// GET  /api/transactions — riwayat transaksi (filter, search, pagination; join tanpa N+1)
// POST /api/transactions — CHECKOUT ATOMIC ( RPC-style, seperti create_sale_transaction):
//   1. Validasi auth + status + tenant (dari session, BUKAN input client)
//   2. Idempotency key → transaksi sama tidak dibuat dua kali
//   3. Validasi item milik tenant & aktif
//   4. Decrement stok dengan WHERE stockQty >= qty (atomic, SQLite writer serial)
//   5. HITUNG ULANG subtotal/diskon/pajak/total/kembalian di server (anti price tampering)
//   6. Nomor invoice dari counter atomic (INV-YYYY-NNNNNN, unik per tenant)
//   7. Insert transaction + items snapshot + inventory movement + audit log
//   Semua dalam satu db.$transaction → gagal satu = rollback semua.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkoutSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { jakartaYear } from '@/lib/format'
import { parseInvoiceSettings } from '@/lib/services/tenant'
import { toTransactionDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const paymentMethod = url.searchParams.get('paymentMethod')?.trim() ?? ''
    const customerId = url.searchParams.get('customerId')?.trim() ?? ''
    const cashierId = url.searchParams.get('cashierId')?.trim() ?? ''
    const dateFrom = url.searchParams.get('dateFrom')?.trim() ?? ''
    const dateTo = url.searchParams.get('dateTo')?.trim() ?? ''

    // dateFrom/dateTo: tanggal Jakarta (YYYY-MM-DD) → rentang UTC penuh.
    let createdAt: { gte?: Date; lte?: Date } | undefined
    if (dateFrom) createdAt = { ...createdAt, gte: new Date(`${dateFrom}T00:00:00+07:00`) }
    if (dateTo) createdAt = { ...createdAt, lte: new Date(`${dateTo}T23:59:59.999+07:00`) }

    const where = {
      tenantId,
      ...(status === 'COMPLETED' || status === 'VOID' || status === 'REFUNDED' ? { status } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(customerId ? { customerId } : {}),
      ...(cashierId ? { cashierId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search } },
              { customer: { name: { contains: search } } },
            ],
          }
        : {}),
    }

    const [total, sumAgg, rows] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.aggregate({ where: { ...where, status: 'COMPLETED' }, _count: true, _sum: { totalAmount: true, refundedAmount: true } }),
      db.transaction.findMany({
        where,
        include: {
          cashier: { select: { fullName: true } },
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return NextResponse.json({
      data: rows.map(toTransactionDTO),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        completedCount: sumAgg._count,
        completedTotal: (sumAgg._sum.totalAmount ?? 0) - (sumAgg._sum.refundedAmount ?? 0),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = checkoutSchema.parse(await req.json())

    // ---------- IDEMPOTENSI ----------
    // (dicek lebih dulu agar replay request yang sudah sukses tetap dijawab —
    //  tidak ada double charge; hanya checkout BARU yang dijaga shift guard)
    if (body.idempotencyKey) {
      const existing = await db.transaction.findFirst({
        where: { tenantId, idempotencyKey: body.idempotencyKey },
        include: {
          items: true,
          cashier: { select: { fullName: true } },
          customer: { select: { name: true, phone: true } },
        },
      })
      if (existing) {
        return NextResponse.json({ transaction: toTransactionDTO(existing), idempotentReplay: true })
      }
    }

    // ---------- WAJIB SHIFT AKTIF (opsional per toko) ----------
    // Jika toko mengaktifkan requireActiveShift, checkout baru hanya boleh saat
    // kasir punya sesi kas OPEN. VOID/refund tidak terkunci (endpoint terpisah).
    // Penolakan sengaja tidak di-audit (mencegah noise log).
    const tenantRow = await db.tenant.findUnique({ where: { id: tenantId }, select: { invoiceSettings: true } })
    if (parseInvoiceSettings(tenantRow?.invoiceSettings).requireActiveShift) {
      const activeShift = await db.cashSession.findFirst({
        where: { tenantId, userId: user.id, status: 'OPEN' },
        select: { id: true },
      })
      if (!activeShift) {
        throw new ApiError('SHIFT_REQUIRED', 'Shift wajib aktif sebelum transaksi. Buka shift dahulu di halaman Kasir.', 409)
      }
    }

    const result = await db.$transaction(async (tx) => {
      // ---------- VALIDASI ITEM (milik tenant + aktif) ----------
      const ids = [...new Set(body.items.map((i) => i.catalogItemId))]
      const catalogItems = await tx.catalogItem.findMany({
        where: { id: { in: ids }, tenantId },
      })
      const itemMap = new Map(catalogItems.map((i) => [i.id, i]))

      const lines: {
        catalogItemId: string
        itemType: string
        itemNameSnapshot: string
        skuSnapshot: string | null
        quantity: number
        unitPrice: number
        subtotal: number
      }[] = []

      for (const input of body.items) {
        const item = itemMap.get(input.catalogItemId)
        if (!item) {
          throw new ApiError('ITEM_NOT_FOUND', 'Ada item yang tidak ditemukan di katalog Anda.', 404)
        }
        if (!item.isActive) {
          throw new ApiError('ITEM_INACTIVE', `Item "${item.name}" sudah tidak aktif.`, 400)
        }
        const quantity = Math.round(input.quantity * 1000) / 1000

        if (item.type === 'PRODUCT') {
          // Decrement stok bersyarat — atomic, aman untuk transaksi paralel.
          const upd = await tx.catalogItem.updateMany({
            where: { id: item.id, tenantId, isActive: true, stockQty: { gte: quantity } },
            data: { stockQty: { decrement: quantity } },
          })
          if (upd.count === 0) {
            throw new ApiError(
              'STOCK_INSUFFICIENT',
              `Stok ${item.name} tidak mencukupi. Stok tersedia: ${item.stockQty}, Diminta: ${quantity}`,
              409
            )
          }
        }

        // HARGA SELALU dari database — harga dari browser diabaikan (anti price tampering).
        const unitPrice = item.sellingPrice
        const subtotal = Math.round(quantity * unitPrice)
        lines.push({
          catalogItemId: item.id,
          itemType: item.type,
          itemNameSnapshot: item.name,
          skuSnapshot: item.sku,
          quantity,
          unitPrice,
          subtotal,
        })
      }

      // ---------- HITUNG ULANG SERVER-SIDE ----------
      const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
      const discountAmount = body.discountAmount
      if (discountAmount > subtotal) {
        throw new ApiError('DISCOUNT_TOO_LARGE', 'Diskon tidak boleh melebihi subtotal.', 400)
      }
      const taxAmount = body.taxAmount
      const totalAmount = subtotal - discountAmount + taxAmount
      if (body.paidAmount < totalAmount) {
        throw new ApiError('INVALID_PAYMENT', 'Jumlah bayar kurang dari total belanja.', 400)
      }
      const changeAmount = body.paidAmount - totalAmount

      // ---------- CUSTOMER OWNERSHIP ----------
      if (body.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: body.customerId, tenantId } })
        if (!customer) {
          throw new ApiError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)
        }
      }

      // ---------- SESI KASIR AKTIF (opsional) ----------
      // Transaksi otomatis tercatat ke shift yang sedang dibuka kasir ini.
      // Tidak wajib — tenant yang tidak memakai fitur shift tetap bisa checkout.
      const openSession = await tx.cashSession.findFirst({
        where: { tenantId, userId: user.id, status: 'OPEN' },
        select: { id: true },
      })

      // ---------- NOMOR INVOICE ATOMIC ----------
      const year = jakartaYear()
      const counter = await tx.invoiceCounter.upsert({
        where: { tenantId_year: { tenantId, year } },
        create: { tenantId, year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      })
      const invoiceNumber = `INV-${year}-${String(counter.lastNumber).padStart(6, '0')}`

      // ---------- INSERT ----------
      const transaction = await tx.transaction.create({
        data: {
          tenantId,
          customerId: body.customerId ?? null,
          cashierId: user.id, // SELALU auth user — tidak percaya input browser
          cashSessionId: openSession?.id ?? null,
          invoiceNumber,
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          paidAmount: body.paidAmount,
          changeAmount,
          paymentMethod: body.paymentMethod,
          status: 'COMPLETED',
          notes: body.notes ?? null,
          idempotencyKey: body.idempotencyKey ?? null,
          items: { create: lines },
        },
      })

      // ---------- MUTASI STOK + AUDIT ----------
      for (const line of lines) {
        if (line.itemType === 'PRODUCT') {
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              catalogItemId: line.catalogItemId,
              transactionId: transaction.id,
              movementType: 'SALE',
              quantity: line.quantity,
            },
          })
        }
      }
      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.TRANSACTION_CREATED,
        resourceType: 'Transaction',
        resourceId: transaction.id,
        metadata: { invoiceNumber, totalAmount, itemCount: lines.length, paymentMethod: body.paymentMethod },
        ipAddress: ip,
        userAgent: ua,
      })

      return tx.transaction.findUnique({
        where: { id: transaction.id },
        include: {
          items: true,
          cashier: { select: { fullName: true } },
          customer: { select: { name: true, phone: true } },
        },
      })
    })

    return NextResponse.json({ transaction: toTransactionDTO(result!), idempotentReplay: false }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
