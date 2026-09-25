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
  if (typeof timer === 'object' && 'unref' in timer) timer.unref()
}

export const RATE_LIMIT = {
  loginAttemptsPerIpPerMinute: 10,
  mutationPerIpPerMinute: 120,
  actionLabel: AUDIT_ACTIONS.LOGIN_LOCKED,
} as const
