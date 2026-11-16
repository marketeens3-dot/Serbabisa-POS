// DELETE /api/projects/[id]/realizations/[rid] — hapus realisasi MANUAL
// (realisasi otomatis dari kasir tidak boleh dihapus manual — ikut transaksinya)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; rid: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id, rid } = await params
    const realization = await db.rabRealization.findFirst({ where: { id: rid, projectId: id, tenantId } })
    if (!realization) throw new ApiError('NOT_FOUND', 'Realisasi tidak ditemukan.', 404)
    if (realization.source !== 'MANUAL') {
      throw new ApiError('FORBIDDEN', 'Realisasi otomatis dari kasir hanya bisa dihapus lewat VOID transaksinya.', 403)
    }

    await db.$transaction(async (tx) => {
      await tx.rabRealization.delete({ where: { id: rid } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.RAB_REALIZATION_DELETED,
        resourceType: 'Project', resourceId: id,
        metadata: { description: realization.description, amount: realization.amount },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
