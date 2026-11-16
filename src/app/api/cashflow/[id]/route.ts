// PATCH  /api/cashflow/[id] — ubah entri MANUAL (entri otomatis dikunci)
// DELETE /api/cashflow/[id] — hapus entri MANUAL
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cashflowUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, CASHFLOW_SOURCES } from '@/lib/constants'

async function getEntryOr404(tenantId: string, id: string) {
  const entry = await db.cashflowEntry.findFirst({ where: { id, tenantId } })
  if (!entry) throw new ApiError('NOT_FOUND', 'Entri kas tidak ditemukan.', 404)
  return entry
}

function assertManual(entry: { source: string }) {
  if (entry.source !== CASHFLOW_SOURCES.MANUAL) {
    throw new ApiError('FORBIDDEN', 'Entri otomatis (pelunasan/pembelian) tidak bisa diubah manual.', 403)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const entry = await getEntryOr404(tenantId, id)
    assertManual(entry)

    const body = cashflowUpdateSchema.parse(await req.json())
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.cashflowEntry.update({
        where: { id },
        data: {
          ...(body.direction !== undefined ? { direction: body.direction } : {}),
          ...(body.category !== undefined ? { category: body.category.toUpperCase() } : {}),
          ...(body.amount !== undefined ? { amount: body.amount } : {}),
          ...(body.note !== undefined ? { note: body.note ?? null } : {}),
          ...(body.entryDate !== undefined ? { entryDate: body.entryDate ? new Date(body.entryDate) : entry.entryDate } : {}),
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CASHFLOW_UPDATED,
        resourceType: 'CashflowEntry', resourceId: id,
        metadata: { updatedFields: Object.keys(body) }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return u
    })
    return NextResponse.json({
      id: updated.id, direction: updated.direction, category: updated.category, amount: updated.amount,
      note: updated.note, entryDate: updated.entryDate.toISOString(), source: updated.source,
      refType: updated.refType, refId: updated.refId, createdAt: updated.createdAt.toISOString(),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const entry = await getEntryOr404(tenantId, id)
    assertManual(entry)

    await db.$transaction(async (tx) => {
      await tx.cashflowEntry.delete({ where: { id } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CASHFLOW_DELETED,
        resourceType: 'CashflowEntry', resourceId: id,
        metadata: { direction: entry.direction, category: entry.category, amount: entry.amount },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
