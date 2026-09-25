// POST /api/auth/login — rate-limited, lockout per-akun, audit LOGIN_SUCCESS/LOGIN_FAILED.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loginSchema } from '@/lib/validation'
import {
  createSession,
  isLoginLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  setSessionCookie,
  verifyPassword,
} from '@/lib/auth'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { rateLimit } from '@/lib/rate-limit'
import { ROLES } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const ip = getClientIp(req)
    if (!rateLimit(`login:${ip ?? 'unknown'}`, 10, 60_000)) {
      throw new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan masuk. Coba lagi dalam 1 menit.', 429)
    }

    const body = loginSchema.parse(await req.json())
    const user = await db.user.findUnique({ where: { email: body.email }, include: { tenant: true } })

    const genericFail = new ApiError('INVALID_CREDENTIALS', 'Email atau password salah.', 401)
    if (!user) {
      await logAudit(undefined, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        resourceType: 'Auth',
        metadata: { email: body.email, reason: 'not_found' },
        ipAddress: ip,
        userAgent: getUserAgent(req),
      })
      throw genericFail
    }
    if (isLoginLocked(user)) {
      throw new ApiError('ACCOUNT_LOCKED', 'Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi 15 menit.', 423)
    }
    if (!verifyPassword(body.password, user.passwordHash)) {
      await recordFailedLogin(user.id)
      await logAudit(undefined, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        actorUserId: user.id,
        resourceType: 'Auth',
        metadata: { email: user.email, reason: 'bad_password' },
        ipAddress: ip,
        userAgent: getUserAgent(req),
      })
      throw genericFail
    }
    if (user.status !== 'ACTIVE') {
      await logAudit(undefined, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        actorUserId: user.id,
        resourceType: 'Auth',
        metadata: { email: user.email, reason: `status_${user.status}` },
        ipAddress: ip,
        userAgent: getUserAgent(req),
      })
      throw new ApiError('ACCOUNT_INACTIVE', 'Akun Anda tidak aktif. Hubungi Super Admin.', 403)
    }
    if (user.role === ROLES.USER && !user.tenantId) {
      throw new ApiError('NO_TENANT', 'Akun Anda tidak terhubung ke toko. Hubungi Super Admin.', 403)
    }
    if (user.role === ROLES.USER && !user.tenant?.isActive) {
      throw new ApiError('TENANT_INACTIVE', 'Toko Anda dinonaktifkan oleh Super Admin.', 403)
    }

    const { token, expiresAt } = await createSession(user.id, ip, getUserAgent(req))
    await recordSuccessfulLogin(user.id)
    await logAudit(undefined, {
      actorUserId: user.id,
      tenantId: user.tenantId,
      action: AUDIT_ACTIONS.LOGIN_SUCCESS,
      resourceType: 'Auth',
      metadata: { email: user.email, role: user.role },
      ipAddress: ip,
      userAgent: getUserAgent(req),
    })

    // Susun DTO langsung dari record (cookie baru belum terbaca di request ini).
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        tenant: user.tenant
          ? {
              id: user.tenant.id,
              businessName: user.tenant.businessName,
              slug: user.tenant.slug,
              phone: user.tenant.phone,
              whatsappNumber: user.tenant.whatsappNumber,
              address: user.tenant.address,
              logoUrl: user.tenant.logoUrl,
              currency: user.tenant.currency,
              timezone: user.tenant.timezone,
            }
          : null,
      },
    })
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (err) {
    return handleApiError(err)
  }
}
