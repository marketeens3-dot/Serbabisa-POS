/**
 * Pemilih lapisan database.
 *
 * Aplikasi berjalan LOCAL-FIRST: runtime aplikasi (desktop Windows) membaca dan
 * menulis ke SQLite lokal, sehingga seluruh POS tetap berfungsi tanpa internet.
 * Supabase adalah salinan bersama antar perangkat + sumber identitas.
 *
 * Kedua skema dijamin identik — scripts/generate-sqlite-schema.mjs hanya
 * mengganti blok `datasource` pada prisma/schema.prisma. Karena itu Prisma
 * Client SQLite dan PostgreSQL memiliki API model yang sama persis, dan seluruh
 * service layer yang sudah ada tidak perlu diubah untuk berjalan di salah
 * satu dari keduanya.
 *
 * PEMILIHAN CLIENT:
 *   SERBABISA_DB=local  → SQLite   (desktop / .exe; default bila LOCAL_DATABASE_URL ada)
 *   SERBABISA_DB=cloud  → PostgreSQL (Vercel/serverless, atau debug langsung ke Supabase)
 *   (tidak diisi)        → `local` bila LOCAL_DATABASE_URL terisi, selain itu `cloud`
 *
 * TENTANG TIPE:
 *   Database ini dideklarasikan sebagai PrismaClient (PostgreSQL) untuk kedua
 *   mode. Prisma membangkitkan tipe dari skema, dan skema SQLite adalah hasil
 *   generate dari skema PostgreSQL yang sama, jadi tipe cloud mendeskripsikan
 *   client lokal dengan benar. Tidak ada perbedaan yang relevan di sini karena
 *   skema ini sengaja tidak memakai kolom platform-specific: tidak ada Json,
 *   array, BigInt, maupun Decimal. Kalau ada, tipe kedua client akan berbeda.
 *
 *   Union `CloudClient | LocalClient` akan menggagalkan setiap pemanggilan
 *   method di TypeScript, jadi casting di satu titik ini memang disengaja.
 *
 * LAZY LOADING (penting untuk Vercel):
 *   @serbabisa/prisma-local (±42 MB) TIDAK di-import statis di sini — hanya
 *   via dynamic import di initDbClient() bila dbMode === 'local'. Di Vercel
 *   (cloud) paket itu tidak pernah dimuat dan file-nya dikecualikan dari
 *   output tracing (next.config.ts) → serverless function jauh lebih kecil,
 *   cold start lebih cepat. Build desktop/self-host tetap menyertakannya.
 *
 * Prisma Client CLOUD hanya dipakai di src/lib/sync/* — tidak pernah menjadi
 * sumber kebenaran saat aplikasi berjalan local-first.
 */

import { PrismaClient } from '@prisma/client'

export type DbMode = 'local' | 'cloud'

function resolveMode(): DbMode {
  const explicit = process.env.SERBABISA_DB
  if (explicit === 'local' || explicit === 'cloud') return explicit
  // Desktop selalu menyuntik LOCAL_DATABASE_URL; Vercel tidak punya disk lokal.
  return process.env.LOCAL_DATABASE_URL ? 'local' : 'cloud'
}

export const dbMode: DbMode = resolveMode()

const globalForPrisma = globalThis as unknown as {
  __serbabisaDb?: PrismaClient
}

function createCloudClient(): PrismaClient {
  return new PrismaClient({ log: ['error', 'warn'] })
}

/** Pasang client hasil init (dipanggil initDbClient / instrumentation). */
export function setDbClient(client: PrismaClient): void {
  globalForPrisma.__serbabisaDb = client
}

/**
 * Muat client database sekali per proses (idempoten).
 * - cloud: sinkron dari @prisma/client (paket kecil, selalu tersedia).
 * - local: dynamic import ke src/lib/db-local.ts (lihat catatan lazy di atas).
 * instrumentation.register() memanggilnya saat server start, sebelum
 * request pertama dilayani.
 */
export async function initDbClient(): Promise<void> {
  if (globalForPrisma.__serbabisaDb) return
  if (dbMode === 'cloud') {
    globalForPrisma.__serbabisaDb = createCloudClient()
    return
  }
  const { createLocalClient } = await import('./db-local')
  globalForPrisma.__serbabisaDb = createLocalClient() as unknown as PrismaClient
}

/**
 * Proxy `db` — seluruh aplikasi tetap menulis `db.model.method()` tanpa peduli
 * mode. Cloud: client dibuat on-demand pada akses pertama. Local: WAJIB lewat
 * initDbClient() dulu (dijalankan instrumentation saat server start); akses
 * sebelum siap melempar error yang jelas, bukan gagal diam-diam.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    let real = globalForPrisma.__serbabisaDb
    if (!real) {
      if (dbMode !== 'cloud') {
        throw new Error('Database lokal belum siap — initDbClient() belum dijalankan di server ini.')
      }
      real = globalForPrisma.__serbabisaDb = createCloudClient()
    }
    const value = Reflect.get(real as object, prop, real) as unknown
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(real) : value
  },
})
