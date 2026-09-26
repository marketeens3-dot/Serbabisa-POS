/**
 * Laporan pertumbuhan database — proyeksi menuju limit kuota (default 512 MB,
 * batas Supabase plan free). Berjalan di dev (SQLite) maupun produksi (PostgreSQL).
 *
 *   npm run db:size
 *   LIMIT_MB=1024 npm run db:size
 *
 * Proyeksi memakai heuristik ~1,2 KB per transaksi (baris transaksi + item +
 * jejak audit + indeks) — kalibrasi terukur dari data sandbox.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'node:fs'

const db = new PrismaClient()
const LIMIT_MB = Number(process.env.LIMIT_MB ?? 512)
const KB_PER_TX = 1.2 // heuristik — row tx + items + audit + index

/** Ukuran file SQLite lokal, atau null kalau tidak ada. */
function localSqliteMb(): number | null {
  try {
    return fs.statSync('db/custom.db').size / 1_048_576
  } catch {
    return null
  }
}

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

  // pg_database_size() mengembalikan `bigint`. Prisma memetakannya ke BigInt JS,
  // dan `BigInt / Number` melempar TypeError — yang tadinya tertelan `catch`
  // lalu dilaporkan sebagai "SQLite (dev)" padahal database-nya PostgreSQL.
  // Jadi konversi dilakukan di SQL (::int) dan hasilnya sudah dalam MB.
  //
  // Fallback pun harus jujur: kalau yang terhubung PostgreSQL dan ukurannya
  // gagal dibaca, laporan menyebut kegagalannya. Angka SQLite lokal tidak
  // ada hubungannya dengan kuota produksi, dan diam-diam menampilkannya bisa
  // membuat orang mengira kuota aman padahal tidak.
  const isPostgres = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? '')
  let sizeNote: string
  try {
    const rows = (await db.$queryRawUnsafe(
      'SELECT (pg_database_size(current_database()) / 1048576)::int AS mb',
    )) as { mb: number }[]
    sizeNote = rows?.length ? `PostgreSQL: ${rows[0].mb} MB` : 'PostgreSQL — jawaban kosong'
  } catch (err) {
    const reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    if (isPostgres) {
      sizeNote = `PostgreSQL — GAGAL membaca ukuran (${reason})`
    } else {
      const mb = localSqliteMb()
      sizeNote = mb === null ? 'SQLite (dev) — db/custom.db tidak ada' : `SQLite (dev): ${mb.toFixed(2)} MB`
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
