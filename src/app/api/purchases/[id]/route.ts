// GET    /api/purchases/[id] — detail PO + item
// PATCH  /api/purchases/[id] — update note / kirim (DRAFT→ORDERED) / batalkan
// DELETE /api/purchases/[id] — hapus (hanya DRAFT)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, PO_STATUSES } from '@/lib/constants'

async function getPoOr404(tenantId: string, id: string) {
  const po = await db.purchaseOrder.findFirst({ where: { id, tenantId }, include: { supplier: { select: { id: true, name: true, phone: true } } } })
  if (!po) throw new ApiError('NOT_FOUND', 'PO tidak ditemukan.', 404)
  return po
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    const po = await getPoOr404(tenantId, id)
    const items = await db.purchaseOrderItem.findMany({ where: { purchaseId: id }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({
      purchase: {
        id: po.id, code: po.code, status: po.status, totalAmount: po.totalAmount, note: po.note,
        supplierId: po.supplier.id, supplierName: po.supplier.name, supplierPhone: po.supplier.phone,
        orderedAt: po.orderedAt?.toISOString() ?? null, receivedAt: po.receivedAt?.toISOString() ?? null,
        createdAt: po.createdAt.toISOString(),
      },
      items: items.map((i) => ({
        id: i.id, catalogItemId: i.catalogItemId, itemName: i.itemNameSnapshot,
        quantity: i.quantity, unitCost: i.unitCost, subtotal: i.subtotal,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const po = await getPoOr404(tenantId, id)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'submit') {
      if (po.status !== PO_STATUSES.DRAFT) throw new ApiError('INVALID_STATUS', 'Hanya PO draft yang bisa dikirim.', 409)
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.purchaseOrder.update({ where: { id }, data: { status: PO_STATUSES.ORDERED, orderedAt: new Date() } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_SENT,
          resourceType: 'PurchaseOrder', resourceId: id,
          metadata: { code: po.code }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json({ id: updated.id, status: updated.status })
    }

    if (action === 'cancel') {
      if (po.status === PO_STATUSES.RECEIVED) throw new ApiError('INVALID_STATUS', 'PO sudah diterima — tidak bisa dibatalkan.', 409)
      if (po.status === PO_STATUSES.CANCELLED) throw new ApiError('INVALID_STATUS', 'PO sudah dibatalkan.', 409)
      await db.$transaction(async (tx) => {
        await tx.purchaseOrder.update({ where: { id }, data: { status: PO_STATUSES.CANCELLED } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_CANCELLED,
          resourceType: 'PurchaseOrder', resourceId: id,
          metadata: { code: po.code }, ipAddress: ip, userAgent: ua,
        })
      })
      return NextResponse.json({ id, status: PO_STATUSES.CANCELLED })
    }

    if (po.status === PO_STATUSES.RECEIVED || po.status === PO_STATUSES.CANCELLED) {
      throw new ApiError('INVALID_STATUS', `PO berstatus ${po.status} tidak bisa diubah.`, 409)
    }
    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 2000) : null
    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { note } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_UPDATED,
        resourceType: 'PurchaseOrder', resourceId: id,
        metadata: { code: po.code, noteUpdated: true }, ipAddress: ip, userAgent: ua,
      })
    })
    return NextResponse.json({ id, note })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const po = await getPoOr404(tenantId, id)
    if (po.status !== PO_STATUSES.DRAFT) {
      throw new ApiError('INVALID_STATUS', 'Hanya PO draft yang bisa dihapus. Gunakan batalkan untuk PO lain.', 409)
    }
    await db.$transaction(async (tx) => {
      await tx.purchaseOrder.delete({ where: { id } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PO_DELETED,
        resourceType: 'PurchaseOrder', resourceId: id,
        metadata: { code: po.code }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
