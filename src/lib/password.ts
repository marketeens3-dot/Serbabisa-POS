// Kriptografi password & token — MURNI, tanpa Next.js dan tanpa database.
//
// Kenapa dipisah dari `auth.ts`:
//   1. Fungsi-fungsi ini tidak butuh request context sama sekali. Semula ikut
//      di `auth.ts` yang meng-import `next/headers`, sehingga skrip operasional
//      (seed, bootstrap admin) ikut menarik Next.js runtime — dan hanya bisa
//      jalan di Bun. Sekarang cukup `node`.
//   2. Dipisah => bisa diuji tanpa server, dan tidak ada cara tak sengaja
//      untuk menyentuh database dari sini.
//
// Password TIDAK PERNAH disimpan plaintext maupun dilog. Algoritma: scrypt
// dengan salt acak per-pengguna, dibandingkan dengan timingSafeEqual agar
// tidak bocor lewat perbedaan waktu.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const SCRYPT_KEYLEN = 64

/** Format tersimpan: `scrypt:<salt-hex>:<hash-hex>`. */
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

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function generateTemporaryPassword(): string {
  // Ramah kasir: huruf besar + angka, tanpa karakter ambigu (tanpa 0/O/1/l).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += alphabet[bytes[i] % alphabet.length]
  return out + '9' // memastikan memenuhi kebijakan (ada angka)
}
