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
 * Prisma Client CLOUD hanya dipakai di src/lib/sync/* — tidak pernah menjadi
 * sumber kebenaran saat aplikasi berjalan local-first.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaClient as LocalPrismaClient } from '@serbabisa/prisma-local'

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

function createClient(): PrismaClient {
  if (dbMode === 'local') {
    return new LocalPrismaClient({
      log: ['error', 'warn'],
    }) as unknown as PrismaClient
  }
  return new PrismaClient({
    log: ['error', 'warn'],
  })
}

// Hot reload Next.js mengevaluasi ulang modul — simpan di global agar tidak
// membuka koneksi database baru pada setiap reload.
export const db: PrismaClient = globalForPrisma.__serbabisaDb ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.__serbabisaDb = db
