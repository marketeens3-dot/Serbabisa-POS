// PATCH  /api/projects/[id]/items/[itemId] — ubah item anggaran
// DELETE /api/projects/[id]/items/[itemId] — hapus item anggaran
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rabItemSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser, type TxClient } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

/** Recompute budgetTotal proyek setelah item berubah. */
async function recomputeBudget(tx: TxClient, projectId: string) {
  const agg = await tx.rabItem.aggregate({ where: { projectId }, _sum: { budgetAmount: true } })
  await tx.project.update({ where: { id: projectId }, data: { budgetTotal: agg._sum.budgetAmount ?? 0 } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id, itemId } = await params
    const item = await db.rabItem.findFirst({ where: { id: itemId, projectId: id, tenantId } })
    if (!item) throw new ApiError('NOT_FOUND', 'Item anggaran tidak ditemukan.', 404)

    const body = rabItemSchema.partial().parse(await req.json())
    const quantity = body.quantity ?? item.quantity
    const unitPrice = body.unitPrice ?? item.unitPrice
    const budgetAmount = Math.round(quantity * unitPrice)

    const updated = await db.$transaction(async (tx) => {
      const u = await tx.rabItem.update({
        where: { id: itemId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.quantity !== undefined ? { quantity } : {}),
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.unitPrice !== undefined ? { unitPrice } : {}),
          ...(body.note !== undefined ? { note: body.note ?? null } : {}),
          budgetAmount,
        },
      })
      await recomputeBudget(tx, id)
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.RAB_ITEM_UPDATED,
        resourceType: 'Project', resourceId: id,
        metadata: { itemId, itemName: u.name, budgetAmount }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return u
    })
    return NextResponse.json({
      id: updated.id, name: updated.name, quantity: updated.quantity, unit: updated.unit,
      unitPrice: updated.unitPrice, budgetAmount: updated.budgetAmount, note: updated.note,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id, itemId } = await params
    const item = await db.rabItem.findFirst({ where: { id: itemId, projectId: id, tenantId } })
    if (!item) throw new ApiError('NOT_FOUND', 'Item anggaran tidak ditemukan.', 404)

    await db.$transaction(async (tx) => {
      await tx.rabItem.delete({ where: { id: itemId } })
      await recomputeBudget(tx, id)
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.RAB_ITEM_DELETED,
        resourceType: 'Project', resourceId: id,
        metadata: { itemId, itemName: item.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
