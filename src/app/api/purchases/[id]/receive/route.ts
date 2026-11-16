// POST /api/purchases/[id]/receive — TERIMA BARANG (satu langkah, atomik):
//   1. Validasi PO berstatus ORDERED
//   2. Stok tiap item bertambah + mutasi PURCHASE_RECEIPT
//   3. costPrice (HPP) produk diupdate dengan harga beli terakhir
//   4. CASH → cashflow OUT otomatis (source PURCHASE_CASH)
//      TEMPO → Debt PAYABLE otomatis (jatuh tempo dueDays, default 30)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { purchaseReceiveSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, INVENTORY_MOVEMENT_TYPES, PO_STATUSES, DEBT_TYPES, DEBT_STATUSES } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = purchaseReceiveSchema.parse(await req.json())

    const po = await db.purchaseOrder.findFirst({ where: { id, tenantId }, include: { items: true, supplier: { select: { name: true } } } })
    if (!po) throw new ApiError('NOT_FOUND', 'PO tidak ditemukan.', 404)
    if (po.status === PO_STATUSES.RECEIVED) throw new ApiError('ALREADY_RECEIVED', 'PO ini sudah diterima sebelumnya.', 409)
    if (po.status !== PO_STATUSES.ORDERED) {
      throw new ApiError('INVALID_STATUS', 'Kirim PO dulu (status ORDERED) sebelum menerima barang.', 409)
    }

    const dueDays = body.dueDays ?? 30
    const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000)
    const receivedAt = new Date()

    const result = await db.$transaction(
      async (tx) => {
        // 1. Stok bertambah — updateMany per item (katalog sudah validasi saat PO dibuat,
        //    tapi cek ulang karena katalog bisa berubah antara order & terima).
        for (const item of po.items) {
          const cat = await tx.catalogItem.findFirst({ where: { id: item.catalogItemId, tenantId }, select: { id: true, type: true, costPrice: true, isActive: true } })
          if (!cat) throw new ApiError('ITEM_NOT_FOUND', `Item "${item.itemNameSnapshot}" tidak ada di katalog.`, 404)
          if (cat.type === 'PRODUCT') {
            await tx.catalogItem.update({
              where: { id: item.catalogItemId },
              data: {
                stockQty: { increment: item.quantity },
                // HPP = harga beli terakhir (rata-rata sederhana bisa menyulitkan
                // pemilik toko; harga terakhir lebih mudah dipahami & diaudit).
                costPrice: item.unitCost,
              },
            })
            await tx.inventoryMovement.create({
              data: {
                tenantId,
                catalogItemId: item.catalogItemId,
                movementType: INVENTORY_MOVEMENT_TYPES.PURCHASE_RECEIPT,
                quantity: item.quantity,
                note: `PO ${po.code} — ${po.supplier.name}`,
              },
            })
          }
        }

        // 2. Status PO diterima
        const updated = await tx.purchaseOrder.update({
          where: { id },
          data: { status: PO_STATUSES.RECEIVED, receivedAt },
        })

        // 3. Keuangan otomatis
        let debtId: string | null = null
        if (body.paymentMethod === 'TEMPO') {
          const debt = await tx.debt.create({
            data: {
              tenantId,
              type: DEBT_TYPES.PAYABLE,
              amount: po.totalAmount,
              status: DEBT_STATUSES.UNPAID,
              dueDate,
              supplierId: po.supplierId,
              purchaseId: po.id,
              note: `PO ${po.code} — ${po.supplier.name} (tempo ${dueDays} hari)`,
              createdById: user.id,
            },
          })
          debtId = debt.id
        } else {
          // Dibayar langsung saat terima → kas keluar otomatis.
          await tx.cashflowEntry.create({
            data: {
              tenantId,
              direction: 'OUT',
              category: 'BELI_BAHAN',
              amount: po.totalAmount,
              note: `PO ${po.code} — ${po.supplier.name}`,
              entryDate: receivedAt,
              source: 'PURCHASE_CASH',
              refType: 'PurchaseOrder',
              refId: po.id,
              createdById: user.id,
            },
          })
        }

        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_RECEIVED,
          resourceType: 'PurchaseOrder', resourceId: po.id,
          metadata: { code: po.code, totalAmount: po.totalAmount, paymentMethod: body.paymentMethod, debtId },
          ipAddress: ip, userAgent: ua,
        })
        return { updated, debtId }
      },
      { timeout: 15_000, maxWait: 10_000 },
    )

    return NextResponse.json({
      ok: true,
      id: result.updated.id,
      status: result.updated.status,
      receivedAt: result.updated.receivedAt?.toISOString() ?? null,
      debtId: result.debtId,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
