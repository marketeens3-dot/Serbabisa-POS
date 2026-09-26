/**
 * Klien sinkronisasi sisi perangkat → sisi cloud.
 *
 * Berisi satu-satunya tempat aplikasi menyentuh Prisma Client POSTGRES saat
 * berjalan local-first. Modul ini HANYA di-load dinamis (import()) dari
 * src/lib/sync/*, sehingga build Vercel (mode cloud) tidak pernah memuatnya.
 *
 * Prinsip:
 *   - Semua koneksi memakai DATABASE_URL yang sudah ada di konfigurasi .exe
 *   - Kegagalan TIDAK boleh merusak transaksi lokal → selaluLEMpar SyncError
 *     yang caught oleh scheduler, dan data lokal tetap dianggap valid
 *   - Idempoten: push memakai upsert berdasarkan id, jadi aman diulang
 */

import { PrismaClient as CloudClient } from '@prisma/client'

export type { CloudClient }

const globalForSync = globalThis as unknown as {
  __serbabisaCloudDb?: CloudClient
}

let cloudDb: CloudClient | null = globalForSync.__serbabisaCloudDb ?? null

/** Error sinkronisasi yang bisa di safely diabaikan (tidak ada internet, dsb). */
export class SyncUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'SyncUnavailableError'
  }
}

/**
 * Prisma Client PostgreSQL untuk sinkronisasi. Dibuat malas agar proses yang
 * tidak pernah sync (mis. Vercel) tidak pernah membuka koneksi cloud.
 *
 * Melempar SyncUnavailableError bila DATABASE_URL tidak diset — bukan crash.
 */
export function getCloudDb(): CloudClient {
  if (cloudDb) return cloudDb
  const url = process.env.DATABASE_URL
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
    throw new SyncUnavailableError('DATABASE_URL cloud tidak tersedia')
  }
  cloudDb = new CloudClient({ datasources: { db: { url } }, log: ['error', 'warn'] })
  if (process.env.NODE_ENV !== 'production') globalForSync.__serbabisaCloudDb = cloudDb
  return cloudDb
}

export function hasCloudDb(): boolean {
  return !!process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
}

/** Jalankan pekerjaan dengan client cloud; error koneksi dibungkus typed. */
export async function withCloud<T>(fn: (db: CloudClient) => Promise<T>): Promise<T> {
  try {
    return await fn(getCloudDb())
  } catch (err) {
    if (err instanceof SyncUnavailableError) throw err
    // Prisma mengetuk error koneksi sebagai P1001/P1002.
    const code = (err as { code?: string })?.code
    if (code === 'P1001' || code === 'P1002' || code === 'P1017') {
      throw new SyncUnavailableError('Tidak dapat menghubungi server database', err)
    }
    throw err
  }
}
