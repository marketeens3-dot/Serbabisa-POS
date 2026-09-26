// Rate limiting in-memory — SUPLEMENTER (bukan satu-satunya kontrol keamanan);
// dipadankan dengan lockout per-akun di database (lib/auth.ts) yang persisten.
import { AUDIT_ACTIONS } from '@/lib/constants'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

// Bersihkan bucket kadaluarsa berkala agar memori terkendali.
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }, 5 * 60_000)
  // Node.js: jangan pegang proses tetap hidup hanya karena interval ini.
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    ;(timer as { unref: () => void }).unref()
  }
}

export const RATE_LIMIT = {
  /**
   * Batas per-IP. Pasar (toko) sering memakai satu WiFi untuk semua kasir,
   * sehingga satu penyerang dari IP yang sama bisa membuat SEMUA kasir ikut
   * terkunci. Batas per-email jadi pelengkap, bukan pengganti.
   */
  loginAttemptsPerIpPerMinute: 10,
  /**
   * Batas per-akun (per menit), jauh lebih longgar dari per-IP.
   *
   * Tujuannya: Percobaan menebak password satu akun tertentu tanpa
   * punished orang lain yang kebetulan satu IP, dan tanpa membuat satu orang
   * bisa mengunci seluruh toko hanya dengan mengetik password salah berulang
   * kali.
   */
  loginAttemptsPerEmailPerMinute: 30,
  mutationPerIpPerMinute: 120,
  actionLabel: AUDIT_ACTIONS.LOGIN_LOCKED,
} as const

/** Kunci bucket yang disamarkan — jangan simpan email polos di memori/log. */
export function emailRateLimitKey(email: string): string {
  // Hash singkat supaya isi bucket tidak membocorkan daftar email yang dicoba.
  let h = 0x811c9dc5
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `login:email:${h.toString(16)}`
}
