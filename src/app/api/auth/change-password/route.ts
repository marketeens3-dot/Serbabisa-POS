// POST /api/auth/change-password — verifikasi password lama, kebijakan kuat,
// revoke sesi lain (sesi aktif dipertahankan), audit PASSWORD_CHANGED.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { changePasswordSchema } from '@/lib/validation'
import {
  currentSessionTokenHash,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from '@/lib/auth'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError } from '@/lib/api'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const sessionUser = await getSessionUser()
    if (!sessionUser) {
      throw new ApiError('UNAUTHORIZED', 'Sesi berakhir. Silakan masuk kembali.', 401)
    }

    // Rate limit per akun: mencegah brute force offline terhadap verifikasi
    // password lama lewat sesi yang bocor/ditinggal terbuka.
    if (!rateLimit(`pwchange:${sessionUser.id}`, 10)) {
      throw new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi sebentar lagi.', 429)
    }

    const body = changePasswordSchema.parse(await req.json())
    const user = await db.user.findUnique({ where: { id: sessionUser.id } })
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new ApiError('WRONG_PASSWORD', 'Password saat ini salah.', 400)
    }
    if (body.currentPassword === body.newPassword) {
      throw new ApiError('SAME_PASSWORD', 'Password baru harus berbeda dari password lama.', 400)
    }

    const currentHash = await currentSessionTokenHash()
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.newPassword), mustChangePassword: false },
    })
    // Revoke sesi lain — sesi aktif tetap berlaku.
    await db.session.deleteMany({
      where: { userId: user.id, ...(currentHash ? { tokenHash: { not: currentHash } } : {}) },
    })
    await logAudit(undefined, {
      actorUserId: user.id,
      tenantId: user.tenantId,
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      resourceType: 'User',
      resourceId: user.id,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })

    return NextResponse.json({ success: true, mustChangePassword: false })
  } catch (err) {
    return handleApiError(err)
  }
}
