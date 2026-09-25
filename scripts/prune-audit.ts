/**
 * Housekeeping database produksi — kontrol pertumbuhan kuota Supabase free:
 *   1. Pangkas audit_logs lebih tua dari N hari (default 90) — jejak audit,
 *      BUKAN data transaksi (data uang tidak pernah disentuh).
 *   2. Hapus sesi kedaluwarsa (baris session terus menumpuk karena tidak
 *      pernah dihapus saat expired — hanya divalidasi).
 *
 *   bun scripts/prune-audit.ts              → DRY-RUN (hanya laporan)
 *   bun scripts/prune-audit.ts --yes        → eksekusi, retensi 90 hari
 *   bun scripts/prune-audit.ts 180 --yes    → retensi 180 hari + eksekusi
 *
 * Jadwalkan mingguan di cron server (bukan Vercel — serverless tanpa filesystem/cron):
 *   0 4 * * 0 cd /app && DATABASE_URL="$PROD_DB" bun scripts/prune-audit.ts 90 --yes
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DAYS = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 90)
const EXECUTE = process.argv.includes('--yes')

async function main() {
  const cutoff = new Date(Date.now() - DAYS * 86_400_000)
  const now = new Date()

  const [staleAudit, totalAudit, expiredSessions, totalSessions] = await Promise.all([
    db.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
    db.auditLog.count(),
    db.session.count({ where: { expiresAt: { lt: now } } }),
    db.session.count(),
  ])

  console.log('=== Housekeeping Database ===')
  console.log(`audit_logs: ${totalAudit} total → ${staleAudit} lebih tua dari ${DAYS} hari`)
  console.log(`sessions:   ${totalSessions} total → ${expiredSessions} kedaluwarsa`)

  if (!EXECUTE) {
    console.log('\nDRY-RUN — tidak ada yang dihapus. Tambahkan --yes untuk mengeksekusi.')
    return
  }

  const delAudit = await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  const delSessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } })
  console.log(`\nDihapus: ${delAudit.count} baris audit + ${delSessions.count} sesi kedaluwarsa.`)
  console.log('Data transaksi & pelanggan TIDAK disentuh.')
}

main()
  .catch((err) => {
    console.error('[prune] gagal:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
