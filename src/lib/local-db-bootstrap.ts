/**
 * Bootstrap database lokal (SQLite) saat first-run.
 *
 * Aplikasi .exe tidak membawa Prisma CLI, jadi skema dibuat dari DDL yang di-
 * generate duluan (src/lib/generated/local-schema-ddl.ts). Prosesnya idempoten:
 * kalau tabel sudah ada, fungsi ini tidak melakukan apa-apa.
 *
 * Prisma pada SQLite MEMBUKA foreign_keys secara default, dan tidak semua
 * driver SQLite mengizinkan PRAGMA di dalam transaksi — karena itu DDL dijalankan
 * statement-per-statement lewat $executeRawUnsafe.
 */

import { db, dbMode } from './db'
import { LOCAL_SCHEMA_DDL } from './generated/local-schema-ddl'

/** Satu statement DDL → sudah dibersihkan dari komentar baris. */
function splitStatements(ddl: string): string[] {
  return ddl
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

let bootstrapped: Promise<void> | null = null

/**
 * Siapkan SQLite untuk dipakai aplikasi desktop yang konkuren.
 *
 * Tanpa ini, permintaan paralel dari server Next.js (halaman dashboard +
 * sync + pemeriksaan stok) saling mengunci dan Prisma melaporkan
 * "Socket timeout (the database failed to respond to a query)".
 *
 *   journal_mode = WAL
 *     Pembaca tidak lagi terblokir oleh penulis, dan sebaliknya. Mode standar
 *     untuk aplikasi yang diakses banyak koneksi.
 *   busy_timeout = 10000
 *     Kalau lock eksklusif tetap terjadi, SQLite menunggu sampai 10 detik
 *     alih-alih langsung gagal.
 *
 * PENTING: dipakai `$queryRawUnsafe`, bukan `$executeRawUnsafe`.
 * `PRAGMA journal_mode = WAL` MENGEMBALIKAN hasil (mode barunya), dan
 * Prisma menolak hasil dari execute ("Execute returned results, which is not
 * allowed in SQLite"). Dengan execute, PRAGMA ini diam-diam gagal → WAL tidak
 * pernah aktif → aplikasi tetap timeout. Query tidak keberatan hasil kosong,
 * jadi dipakai untuk semua PRAGMA di sini.
 *
 * Prisma memakai satu koneksi per client untuk SQLite, jadi PRAGMA di sini
 * berlaku selama koneksi itu hidup.
 */
async function tuneSqlite(): Promise<void> {
  const pragmas = [
    'PRAGMA journal_mode = WAL;',
    'PRAGMA busy_timeout = 10000;',
    'PRAGMA synchronous = NORMAL;',
    'PRAGMA foreign_keys = ON;',
  ]
  for (const sql of pragmas) {
    try {
      await db.$queryRawUnsafe(sql)
    } catch (err) {
      // Tidak fatal: database tetap berfungsi, hanya kehilangan optimasi.
      console.warn('[local-db] gagal menjalankan', sql, err)
    }
  }
}

/**
 * Pastikan skema lokal ada. Aman dipanggil berulang (memoized per proses).
 * Tidak melakukan apa-apa ketika aplikasi berjalan dalam mode cloud.
 */
export function ensureLocalDb(): Promise<void> {
  if (dbMode !== 'local') return Promise.resolve()
  if (bootstrapped) return bootstrapped

  bootstrapped = (async () => {
    await tuneSqlite()

    // sqlite_master adalah satu-satunya cara portabel mendeteksi keberadaan tabel
    // lintas driver (tidak seperti information_schema).
    const existing = await db.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Tenant'`,
    )
    if (existing.length > 0) return

    const statements = splitStatements(LOCAL_SCHEMA_DDL)
    for (const stmt of statements) {
      await db.$executeRawUnsafe(stmt)
    }
    console.log(`[local-db] skema dibuat dari DDL (${statements.length} statement)`)
  })().catch((err) => {
    // Jangan cache kegagalan: percobaan berikutnya harus mengulang.
    bootstrapped = null
    throw err
  })

  return bootstrapped
}

/** True bila tabel aplikasi sudah ada di database lokal. */
export async function localDbHasSchema(): Promise<boolean> {
  if (dbMode !== 'local') return true
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Tenant'`,
  )
  return rows.length > 0
}
