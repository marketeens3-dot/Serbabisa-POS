// Autentikasi server-side: scrypt password hashing + session token (hash sha256 di DB, token di cookie httpOnly).
// Password TIDAK PERNAH disimpan plaintext / dilog.

import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'sb_session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 hari
const SCRYPT_KEYLEN = 64
const MAX_FAILED_ATTEMPTS = 8
const LOCK_MS = 15 * 60 * 1000

export type SessionTenant = {
  id: string
  businessName: string
  slug: string
  phone: string | null
  whatsappNumber: string | null
  address: string | null
  logoUrl: string | null
  currency: string
  timezone: string
}

export type SessionUser = {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: 'SUPER_ADMIN' | 'USER'
  mustChangePassword: boolean
  tenant: SessionTenant | null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Hash token sesi aktif saat ini (untuk revoke sesi lain saat ganti password). */
export async function currentSessionTokenHash(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return token ? sha256(token) : null
}

export function generateTemporaryPassword(): string {
  // Ramah kasir: huruf besar + angka, tanpa karakter ambigu.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length]
  return out + '9' // memastikan memenuhi kebijakan (ada angka)
}

export async function createSession(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomUUID().replace(/-/g, '') + randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ipAddress: ipAddress?.slice(0, 45) ?? null,
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
  })
  return { token, expiresAt }
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax', // CSRF: cookie tidak dikirim pada cross-site POST
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set({ name: SESSION_COOKIE, value: '', httpOnly: true, path: '/', maxAge: 0 })
}

export async function revokeAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } })
}

export async function destroySession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
  }
}

/** Validasi session dari cookie; user non-AKTIF otomatis dianggap keluar. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { tenant: true } } },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  const user = session.user
  if (user.status !== 'ACTIVE') return null // user dinonaktifkan → sesi hangus
  if (user.tenantId && !user.tenant?.isActive) return null // toko dinonaktifkan → sesi hangus
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role as SessionUser['role'],
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
  }
}

/** Sliding expiry: perpanjang jika tersisa < 6 hari. */
export async function refreshSessionExpiry() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } })
  if (!session) return
  if (session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - 24 * 60 * 60 * 1000) {
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    })
  }
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return
  const attempts = user.failedLoginAttempts + 1
  await db.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: attempts,
      lockedUntil: attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : user.lockedUntil,
    },
  })
}

export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  })
}

export function isLoginLocked(user: { lockedUntil: Date | null }): boolean {
  return !!user.lockedUntil && user.lockedUntil > new Date()
}
