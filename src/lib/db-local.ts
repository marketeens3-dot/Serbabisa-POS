/**
 * Modul DAUN pemuat Prisma Client SQLite (@serbabisa/prisma-local, ±42 MB).
 *
 * ATURAN: modul ini hanya boleh di-import SECARA DINAMIS (await import) dari
 * src/lib/db.ts saat dbMode === 'local'. Jangan pernah meng-import statis dari
 * modul lain — static import menyebabkan Next.js output tracing menyalin
 * engine SQLite ke SETIAP serverless function Vercel (bundle membengkak,
 * cold start melambat), padahal mode cloud tidak pernah memakainya.
 */
import { PrismaClient as LocalPrismaClient } from '@serbabisa/prisma-local'

export function createLocalClient() {
  return new LocalPrismaClient({ log: ['error', 'warn'] })
}
