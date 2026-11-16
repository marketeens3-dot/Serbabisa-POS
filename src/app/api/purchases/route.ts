// GET  /api/purchases — daftar PO (filter status, search kode/supplier)
// POST /api/purchases — buat PO (DRAFT atau langsung ORDERED)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { purchaseCreateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, PO_STATUSES } from '@/lib/constants'

/** Kode PO unik per tenant: PO-YYYYMMDD-NNN. */
async function generatePoCode(tenantId: string): Promise<string> {
  const today = new Date()
  const ymd = `${today.getUTCFullYear()}${String(today.getUTCMonth() + 1).padStart(2, '0')}${String(today.getUTCDate()).padStart(2, '0')}`
  const prefix = `PO-${ymd}-`
  const count = await db.purchaseOrder.count({ where: { tenantId, code: { startsWith: prefix } } })
  for (let n = count + 1; ; n++) {
    const candidate = `${prefix}${String(n).padStart(3, '0')}`
    const exists = await db.purchaseOrder.findFirst({ where: { tenantId, code: candidate }, select: { id: true } })
    if (!exists) return candidate
  }
}

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const status = url.searchParams.get('status')?.trim() ?? ''
    const search = url.searchParams.get('search')?.trim() ?? ''

    const where = {
      tenantId,
      ...(status && Object.values(PO_STATUSES).includes(status as PoStatusType) ? { status } : {}),
      ...(search ? { OR: [{ code: { contains: search } }, { supplier: { name: { contains: search } } }] } : {}),
    }

    const [total, rows] = await Promise.all([
      db.purchaseOrder.count({ where }),
      db.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return NextResponse.json({
      data: rows.map((po) => ({
        id: po.id,
        code: po.code,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        status: po.status,
        totalAmount: po.totalAmount,
        itemCount: po._count.items,
        note: po.note,
        orderedAt: po.orderedAt?.toISOString() ?? null,
        receivedAt: po.receivedAt?.toISOString() ?? null,
        createdAt: po.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

type PoStatusType = keyof typeof PO_STATUSES

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = purchaseCreateSchema.parse(await req.json())

    const supplier = await db.supplier.findFirst({ where: { id: body.supplierId, tenantId } })
    if (!supplier) throw new ApiError('NOT_FOUND', 'Supplier tidak ditemukan.', 404)
    if (!supplier.isActive) throw new ApiError('SUPPLIER_INACTIVE', 'Supplier tidak aktif.', 400)

    const items = body.items
    const totalAmount = items.reduce((s, i) => s + Math.round(i.quantity * i.unitCost), 0)
    const status = body.submit ? PO_STATUSES.ORDERED : PO_STATUSES.DRAFT

    const po = await db.$transaction(async (tx) => {
      // Validasi item milik tenant + snapshot nama katalog (bukan input client).
      const ids = [...new Set(items.map((i) => i.catalogItemId))]
      const catalogRows = await tx.catalogItem.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, name: true } })
      const nameMap = new Map(catalogRows.map((c) => [c.id, c.name]))
      for (const i of items) {
        if (!nameMap.has(i.catalogItemId)) {
          throw new ApiError('ITEM_NOT_FOUND', 'Ada item yang tidak ditemukan di katalog Anda.', 404)
        }
      }

      const created = await tx.purchaseOrder.create({
        data: {
          tenantId,
          code: await generatePoCode(tenantId),
          supplierId: body.supplierId,
          status,
          totalAmount,
          note: body.note ?? null,
          orderedAt: body.submit ? new Date() : null,
          items: {
            create: items.map((i) => ({
              tenantId,
              catalogItemId: i.catalogItemId,
              itemNameSnapshot: nameMap.get(i.catalogItemId) ?? '',
              quantity: i.quantity,
              unitCost: i.unitCost,
              subtotal: Math.round(i.quantity * i.unitCost),
            })),
          },
        },
        include: { items: true, supplier: { select: { name: true } } },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_CREATED,
        resourceType: 'PurchaseOrder', resourceId: created.id,
        metadata: { code: created.code, supplier: supplier.name, totalAmount, status },
        ipAddress: ip, userAgent: ua,
      })
      return created
    })

    return NextResponse.json(
      { id: po.id, code: po.code, status: po.status, totalAmount: po.totalAmount, itemCount: po.items.length, supplierName: po.supplier.name },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
