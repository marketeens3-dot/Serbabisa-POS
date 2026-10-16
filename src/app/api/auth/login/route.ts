// POST /api/auth/login — rate-limited, lockout per-akun, audit LOGIN_SUCCESS/LOGIN_FAILED.
//
// Local-first: kredensial diverifikasi terhadap SQLite lokal. Bila akun belum ada
// di perangkat ini, route mencoba AKTIVASI PERTAMA lewat cloud (butuh internet
// satu kali) — lihat src/lib/sync/bootstrap.ts. Sesi sendiri selalu lokal dan
// tidak pernah ikut sync.
import { NextResponse } from 'next/server'
import { db, dbMode } from '@/lib/db'
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
import { rateLimit, emailRateLimitKey, RATE_LIMIT } from '@/lib/rate-limit'
import { ROLES } from '@/lib/constants'

async function bootstrapUserFromCloud(params: {
  email: string
  passwordHashMatches: (cloudHash: string) => boolean
}) {
  const { bootstrapUserFromCloud: run } = await import('@/lib/sync/bootstrap')
  return run(params)
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const ip = getClientIp(req)
    if (!rateLimit(`login:${ip ?? 'unknown'}`, 10, 60_000)) {
      throw new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan masuk. Coba lagi dalam 1 menit.', 429)
    }

    const body = loginSchema.parse(await req.json())

    // Dua bucket, dua alasan berbeda:
    //  - per-IP  → menahan penyerang yang mencoba banyak akun dari satu mesin
    //  - per-akun → menahan tebakan password berulang ke SATU akun tanpa
    //    menghukum kasir lain yang kebetulan satu WiFi / satu IP.
    // Batas per-akun dibuat lebih longgar (30/menit) supaya ini tidak menjadi
    // pengganti lockout per-akun yang persisten di database.
    if (!rateLimit(emailRateLimitKey(body.email), RATE_LIMIT.loginAttemptsPerEmailPerMinute, 60_000)) {
      throw new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan masuk. Coba lagi dalam 1 menit.', 429)
    }

    // --- LOCAL-FIRST ---
    // Database lokal adalah sumber kebenaran saat runtime. User yang belum pernah
    // singgah di perangkat ini akan diaktifkan lewat cloud (butuh internet
    // satu kali); setelah itu login berikutnya murni offline.
    let user = await db.user.findUnique({ where: { email: body.email }, include: { tenant: true } })

    if (!user && dbMode === 'local') {
      const activation = await bootstrapUserFromCloud({
        email: body.email,
        passwordHashMatches: (cloudHash) => verifyPassword(body.password, cloudHash),
      })
      if (activation.ok) {
        user = await db.user.findUnique({ where: { email: body.email }, include: { tenant: true } })
        if (user) {
          await logAudit(undefined, {
            actorUserId: user.id,
            tenantId: user.tenantId,
            action: AUDIT_ACTIONS.LOGIN_SUCCESS,
            resourceType: 'Auth',
            metadata: {
              email: user.email,
              role: user.role,
              activated: true,
              rowsPulled: activation.rows,
            },
            ipAddress: ip,
            userAgent: getUserAgent(req),
          })
        }
      } else if (activation.reason === 'cloud-unreachable') {
        throw new ApiError(
          'OFFLINE_ACTIVATION_NEEDED',
          'Akun ini belum pernah masuk di perangkat ini dan server tidak dapat dihubungi. ' +
            'Hubungkan internet satu kali untuk mengaktifkan perangkat, setelah itu bisa offline.',
          503,
        )
      }
    }

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
    const payload: Record<string, unknown> = {
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
    }

    // Klien native (React Native/Expo) tidak bisa membaca cookie HttpOnly, dan
    // cookie store native tidak konsisten antar platform. Karena itu token
    // session dikembalikan di body — HANYA bila klien memintanya lewat header
    // `x-client: native`, sehingga JavaScript di browser tidak pernah
    //mendapat akses ke token (pemtoken tetap HttpOnly di jalur web).
    if (req.headers.get('x-client') === 'native') {
      // Anti-bypass httpOnly: fetch dari BROWSER (termasuk same-origin oleh XSS)
      // selalu menyertakan header Origin pada POST; klien native (Electron/React
      // Native) tidak mengirim Origin. Bila ada Origin → tolak, supaya token
      // mentah tidak bisa diminta lewat jalur native dari skrip browser.
      if (req.headers.get('origin')) {
        throw new ApiError('INVALID_CLIENT', 'Permintaan token native tidak sah.', 400)
      }
      payload.sessionToken = token
      payload.expiresAt = expiresAt.toISOString()
    }

    const res = NextResponse.json(payload)
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (err) {
    return handleApiError(err)
  }
}
