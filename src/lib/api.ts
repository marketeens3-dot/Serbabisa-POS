// Helper API server-side: pengecekan authorization (requireUser / requireSuperAdmin),
// error mapping ke pesan Indonesia, dan proteksi same-origin untuk mutasi.

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import type { Prisma } from '@prisma/client'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { AUDIT_ACTIONS } from '@/lib/constants'

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400
  ) {
    super(message)
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status })
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ error: code, message }, { status })
}

/** Jangan pernah bocorkan stack trace / detail teknis ke client. */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.status)
  }
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return fail('INVALID_INPUT', first?.message ?? 'Input tidak valid', 422)
  }
  const prismaErr = err as { code?: string; meta?: { target?: string[] } }
  if (prismaErr?.code === 'P2002') {
    const target = (prismaErr.meta?.target ?? []).join(', ')
    const field =
      target.includes('sku') ? 'SKU' : target.includes('barcode') ? 'Barcode'
      : target.includes('email') ? 'Email' : target.includes('normalizedName') ? 'Nama kategori'
      : target.includes('invoiceNumber') ? 'Nomor invoice' : target
    return fail('ALREADY_EXISTS', `${field} sudah digunakan.`, 409)
  }
  if (prismaErr?.code === 'P2025') {
    return fail('NOT_FOUND', 'Data tidak ditemukan.', 404)
  }
  // Body JSON tidak valid. `req.json()` melempar SyntaxError, dan tanpa
  // penanganan khusus ia jatuh ke 500 — padahal ini kesalahan klien, bukan
  // kegagalan server. Akibatnya 500 ikut naik di monitoring dan galat server
  // yang sebenarnya jadi sulit dibedakan dari request yang simply rusak.
  if (err instanceof SyntaxError) {
    return fail('INVALID_JSON', 'Format data yang dikirim tidak valid.', 400)
  }
  // Log teknis aman di server (tanpa secret).
  console.error('[api-error]', err instanceof Error ? err.message : err)
  return fail('INTERNAL_ERROR', 'Terjadi kesalahan. Silakan coba lagi.', 500)
}

export type AuthContext = { user: SessionUser; tenantId: string }

/** USER aktif dengan tenant. tenantId SELALU diturunkan dari session — bukan dari input client. */
export async function requireUser(opts?: { allowMustChangePassword?: boolean }): Promise<AuthContext> {
  const user = await getSessionUser()
  if (!user) throw new ApiError('UNAUTHORIZED', 'Sesi berakhir. Silakan masuk kembali.', 401)
  if (user.role !== 'USER') {
    throw new ApiError('FORBIDDEN', 'Fitur ini hanya untuk pengguna kasir.', 403)
  }
  if (!user.tenant) {
    throw new ApiError('NO_TENANT', 'Akun Anda tidak terhubung ke toko. Hubungi Super Admin.', 403)
  }
  if (user.mustChangePassword && !opts?.allowMustChangePassword) {
    throw new ApiError('MUST_CHANGE_PASSWORD', 'Anda wajib mengganti password terlebih dahulu.', 403)
  }
  return { user, tenantId: user.tenant.id }
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new ApiError('UNAUTHORIZED', 'Sesi berakhir. Silakan masuk kembali.', 401)
  if (user.role !== 'SUPER_ADMIN') {
    // Catat upaya role escalation (actor diketahui dari session).
    await import('@/lib/audit').then(({ logAudit }) =>
      logAudit(undefined, {
        actorUserId: user.id,
        action: AUDIT_ACTIONS.ROLE_CHANGE_ATTEMPT,
        resourceType: 'API',
        metadata: { attempted: 'SUPER_ADMIN_API' },
      })
    )
    throw new ApiError('FORBIDDEN', 'Anda tidak memiliki akses admin.', 403)
  }
  return user
}

/**
 * CSRF defense-in-depth: mutasi harus same-origin jika header Origin/Referer tersedia.
 *
 * Di belakang reverse proxy (gateway sandbox / Caddy), header Host sering ditulis ulang
 * tanpa port ({host}) sehingga perbandingan naif origin==host akan menolak permintaan sah
 * dari browser (login 403). Strategi berlapis:
 *   1. Sec-Fetch-Site (header browser, tidak bisa dipalsukan JS) — sinyal paling kuat.
 *   2. Cocokkan origin dengan Host ATAU X-Forwarded-Host (chain proxy).
 *   3. Toleransi port yang dilepas proxy (bandingkan hostname bila kandidat tanpa port).
 * Klien non-browser tanpa header apa pun tetap lolos — proteksi utama tetap di cookie SameSite.
 */
export function assertSameOrigin(req: Request) {
  // 1) Sinyal browser modern: header Fetch Metadata tidak dapat dipalsukan oleh halaman/web.
  const secFetchSite = req.headers.get('sec-fetch-site')
  if (secFetchSite === 'cross-site') {
    throw new ApiError('BAD_ORIGIN', 'Permintaan tidak sah.', 403)
  }
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none') {
    return
  }

  const origin = req.headers.get('origin') ?? req.headers.get('referer')
  if (!origin) return // request same-origin tanpa header (mis. curl internal) — cookie SameSite tetap melindungi

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    throw new ApiError('BAD_ORIGIN', 'Permintaan tidak sah.', 403)
  }
  const originHost = originUrl.host.toLowerCase()         // host(+port, port default dihapus oleh URL API)
  const originHostname = originUrl.hostname.toLowerCase() // host tanpa port

  // 2) Kandidat host sah: Host request + X-Forwarded-Host (bisa berantai, dipisah koma).
  const candidates: string[] = []
  const host = req.headers.get('host')
  if (host) candidates.push(host)
  const forwarded = req.headers.get('x-forwarded-host')
  if (forwarded) candidates.push(...forwarded.split(',').map((h) => h.trim()))

  // 3) Kecocokan penuh (host+port) atau hostname ketika proxy melepas port dari Host.
  const isAllowed = candidates.some((c) => {
    const cand = c.toLowerCase()
    if (!cand) return false
    if (cand === originHost) return true
    if (!cand.includes(':') && cand === originHostname) return true
    return false
  })

  if (!isAllowed) {
    throw new ApiError('BAD_ORIGIN', 'Permintaan tidak sah.', 403)
  }
}

export function getClientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')
}

export function getUserAgent(req: Request): string | null {
  return req.headers.get('user-agent')
}

export function parsePagination(url: URL, defaultPageSize = 20, maxPageSize = 100) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(maxPageSize, Math.max(1, Number(url.searchParams.get('pageSize')) || defaultPageSize))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export type TxClient = Prisma.TransactionClient
