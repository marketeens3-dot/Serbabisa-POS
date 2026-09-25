/**
 * Laporan pertumbuhan database — proyeksi menuju limit kuota (default 512 MB,
 * batas Supabase plan free). Berjalan di dev (SQLite) maupun produksi (PostgreSQL).
 *
 *   bun scripts/db-size-report.ts            # laporan + proyeksi
 *   LIMIT_MB=1024 bun scripts/db-size-report.ts
 *
 * Proyeksi memakai heuristik ~1,2 KB per transaksi (baris transaksi + item +
 * jejak audit + indeks) — kalibrasi terukur dari data sandbox.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'

const db = new PrismaClient()
const LIMIT_MB = Number(process.env.LIMIT_MB ?? 512)
const KB_PER_TX = 1.2 // heuristik — row tx + items + audit + index

async function main() {
  const [tx, items, audit, sessions, users, tenants, catalog, customers] = await Promise.all([
    db.transaction.count(),
    db.transactionItem.count(),
    db.auditLog.count(),
    db.session.count(),
    db.user.count(),
    db.tenant.count(),
    db.catalogItem.count(),
    db.customer.count(),
  ])

  let sizeNote = ''
  try {
    const rows = (await db.$queryRawUnsafe('SELECT pg_database_size(current_database()) AS bytes')) as { bytes: number }[]
    if (rows?.length) sizeNote = `PostgreSQL: ${(rows[0].bytes / 1_048_576).toFixed(1)} MB`
  } catch {
    try {
      sizeNote = `SQLite (dev): ${(fs.statSync('db/custom.db').size / 1_048_576).toFixed(2)} MB`
    } catch {
      sizeNote = 'ukuran tidak terbaca'
    }
  }

  // Rata-rata transaksi/hari sejak transaksi pertama.
  const oldest = await db.transaction.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  const days = oldest ? Math.max(1, (Date.now() - oldest.createdAt.getTime()) / 86_400_000) : 0
  const perDay = days ? tx / days : 0
  const usedMb = tx * KB_PER_TX / 1024
  const daysToLimit = perDay > 0 ? (LIMIT_MB - usedMb) / (perDay * KB_PER_TX / 1024) : Infinity

  console.log('=== SERBABISA — Laporan Pertumbuhan Database ===')
  console.log(`Toko: ${tenants} · user: ${users} · katalog: ${catalog} · pelanggan: ${customers}`)
  console.log(`Transaksi: ${tx} · item: ${items} · audit: ${audit} · sesi: ${sessions}`)
  console.log(`Ukuran aktual: ${sizeNote}`)
  console.log(`Estimasi data transaksi: ${usedMb.toFixed(1)} MB (heuristik ${KB_PER_TX} KB/trx)`)
  if (perDay > 0) {
    console.log(`Rata-rata: ${perDay.toFixed(1)} trx/hari (sejak ${oldest!.createdAt.toISOString().slice(0, 10)})`)
    if (Number.isFinite(daysToLimit) && daysToLimit > 0) {
      console.log(`PROYEKSI: limit ${LIMIT_MB} MB tercapai dalam ~${Math.round(daysToLimit)} hari (${(daysToLimit / 30).toFixed(1)} bulan) pada laju saat ini.`)
    } else {
      console.log(`PROYEKSI: sudah melewati estimasi ${LIMIT_MB} MB — perlu Supabase Pro atau arsip data.`)
    }
  } else {
    console.log('Belum ada transaksi — proyeksi tidak tersedia.')
  }
}

main()
  .catch((err) => {
    console.error('[db-size] gagal:', err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
