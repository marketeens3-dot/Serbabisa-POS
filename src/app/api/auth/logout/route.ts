// POST /api/auth/logout — hapus sesi + audit LOGOUT.
import { NextResponse } from 'next/server'
import { clearSessionCookie, destroySession, getSessionUser } from '@/lib/auth'
import { assertSameOrigin, getClientIp, getUserAgent, handleApiError } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const user = await getSessionUser()
    if (user) {
      await logAudit(undefined, {
        actorUserId: user.id,
        tenantId: user.tenant?.id ?? null,
        action: AUDIT_ACTIONS.LOGOUT,
        resourceType: 'Auth',
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
      })
    }
    await destroySession()
    const res = NextResponse.json({ success: true })
    clearSessionCookie(res)
    return res
  } catch (err) {
    return handleApiError(err)
  }
}
