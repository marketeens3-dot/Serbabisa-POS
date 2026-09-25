// PATCH /api/profile — update nama & nomor HP sendiri.
// Role, tenantId, status TIDAK dapat diubah user (tidak ada field-nya pun).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { profileSchema } from '@/lib/validation'
import { assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user } = await requireUser()
    const body = profileSchema.parse(await req.json())

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { fullName: body.fullName, phone: body.phone } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId: user.tenant?.id ?? null,
        action: AUDIT_ACTIONS.PROFILE_UPDATED, resourceType: 'User', resourceId: user.id,
        metadata: { fullName: body.fullName }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })

    return NextResponse.json({ success: true, fullName: body.fullName, phone: body.phone })
  } catch (err) {
    return handleApiError(err)
  }
}
