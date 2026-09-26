/**
 * Penomoran nota yang AMAN SAAT OFFLINE dan multi-perangkat.
 *
 * MASALAH KLASIK:
 *   Dua PC kasir sama-sama offline. Keduanya membaca counter = 4.
 *   Keduanya menerbitkan INV-2026-000005. Nomor nota duplikat → laporan, pajak,
 *   dan rekonsiliasi shift jadi salah.
 *
 * SOLUSI — alokasi blok:
 *   1. Saat perangkat online, perangkat memesan SEJUMAH nomor dari cloud
 *      (mis. 50). Cloud menaikkan `InvoiceCounter.lastNumber` secara atomik
 *      sebesar jumlah itu dan mencatat bloknya di `InvoiceBlock`.
 *   2. Perangkat memakai blok itu sendiri secara lokal, sekuensial, tanpa
 *      perlu internet lagi.
 *   3. Nomor berformat tetap `INV-YYYY-NNNNNN` — TIDAK berubah, jadi nota yang
 *      sudah tercetak ke customer tetap sah dan tidak perlu dicetak ulang.
 *
 * Kekuncian nomor dijamin oleh cloud: karena setiap blok berasal dari satu
 * increment atomik, dua perangkat tidak mungkin mendapat angka yang sama.
 *
 * Cloud "menyerahkan" blok, jadi perangkat boleh memakai/membuang angka di
 * dalam bloknya (mis. habis tengah tahun lalu pindah blok) tanpa bentrok.
 *
 * Mode cloud (Vercel) memakai jalur lama: counter global atomik, tanpa blok.
 */

import type { PrismaClient } from '@prisma/client'
import { db, dbMode } from './db'
import { ensureLocalDb } from './local-db-bootstrap'
import { getDeviceId, isLocalMode } from './device'

/** Berapa nomor nota yang dipesan sekaligus saat online. */
export const INVOICE_BLOCK_SIZE = 50

/** Kunci SystemSetting untuk menyimpan blok yang sedang dipakai. */
const BLOCK_SETTING = 'invoice.block'
/** Kunci untuk menandai kapan terakhir mencoba memesan blok dari cloud. */
const BLOCK_RETRY_AT = 'invoice.block.retryAt'
/** Jeda minimum antar percobaan pemesanan blok (ms). Mencegah setiap checkout online-offline. */
const BLOCK_RETRY_COOLDOWN_MS = 5 * 60 * 1000

type ActiveBlock = {
  year: number
  deviceId: string
  next: number
  end: number
}

function formatInvoice(year: number, seq: number): string {
  return `INV-${year}-${String(seq).padStart(6, '0')}`
}

type TxLike = Pick<PrismaClient, 'systemSetting' | 'invoiceCounter'>

/** Baca blok aktif; null bila belum ada. Selalu lewat client yang diberikan. */
async function readActiveBlock(client: TxLike): Promise<ActiveBlock | null> {
  const row = await client.systemSetting.findUnique({ where: { key: BLOCK_SETTING } })
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value) as ActiveBlock
    if (
      typeof parsed?.year === 'number' &&
      typeof parsed?.next === 'number' &&
      typeof parsed?.end === 'number' &&
      typeof parsed?.deviceId === 'string'
    ) {
      return parsed
    }
  } catch {
    /* data rusak → minta blok baru */
  }
  return null
}

async function writeActiveBlock(client: TxLike, block: ActiveBlock | null): Promise<void> {
  if (block === null) {
    // `deleteMany`, bukan `delete` + catch.
    //
    // `delete({ where })` melempar P2025 saat barisnya memang tidak ada --
    // dan itu kondisi NORMAL di sini (blok baru saja terpakai habis, jadi
    // tidak ada yang perlu dihapus). `.catch()` membuat galatnya tertangkap,
    // tapi Prisma tetap mencatatnya sebagai `prisma:error` di log. Akibatnya
    // aplikasi mencetak "error" setiap kali blok nota berganti, padahal tidak
    // ada yang salah. `deleteMany` tidak melempar apa pun kalau tidak cocok.
    await client.systemSetting.deleteMany({ where: { key: BLOCK_SETTING } })
    return
  }
  await client.systemSetting.upsert({
    where: { key: BLOCK_SETTING },
    create: { key: BLOCK_SETTING, value: JSON.stringify(block) },
    update: { value: JSON.stringify(block) },
  })
}

/** Pakai satu nomor dari blok aktif dan majukan penunjuk. */
function consumeFromBlock(block: ActiveBlock): { invoiceNumber: string; block: ActiveBlock } {
  const invoiceNumber = formatInvoice(block.year, block.next)
  return { invoiceNumber, block: { ...block, next: block.next + 1 } }
}

/**
 * Minta blok nomor baru ke cloud.
 *
 * Sengaja memakai Prisma Client POSTGRES secara langsung, bukan lewat HTTP API,
 * karena perangkat sudah memegang string koneksi cloud. Blok di-reservasi dengan
 * satu increment atomik sehingga mustahil tumpang tindih.
 *
 * Mengembalikan null bila tidak ada koneksi / cloud menolak.
 */
async function requestBlockFromCloud(
  tenantId: string,
  year: number,
  size: number,
): Promise<{ deviceId: string; start: number; end: number } | null> {
  const deviceId = await getDeviceId()
  if (!deviceId) return null

  // Impor dinamis: modul sync hanya relevan di mode local, dan tidak boleh ikut
  // memblokir mode cloud.
  const { syncAllocateInvoiceBlock } = await import('./sync/invoice-block')
  try {
    return await syncAllocateInvoiceBlock({ tenantId, year, size, deviceId })
  } catch (err) {
    console.warn('[invoice-block] gagal memesan blok:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Pastikan ada blok nomor nota yang bisa dipakai, SEBELUM transaksi dibuka.
 *
 * PENTING: fungsi ini boleh menyentuh jaringan (permintaan blok ke cloud),
 * jadi WAJIB dipanggil di luar `db.$transaction`. I/O jaringan di dalam
 * transaksi SQLite membuat transaksi menunggu sampai timeout default Prisma
 * (5 detik) lalu GAGAL — hal ini benar-benar terjadi saat pengujian offline.
 *
 * Aman dipanggil setiap checkout: kalau blok masih ada, hanya satu baris
 * SystemSetting yang dibaca.
 */
export async function ensureInvoiceBlockReady(tenantId: string, year: number): Promise<void> {
  if (dbMode !== 'local') return
  await ensureLocalDb()

  const current = await readActiveBlock(db)
  if (current && current.year === year && current.next <= current.end) return

  // Backoff: saat internet putus, tanpa jeda ini setiap checkout akan mencoba
  // menghubungi Supabase dan menambah latensi ke kasir. Cukup coba lagi
  // setelah cooldown, atau setelah ada perubahan status jaringan.
  const retryRow = await db.systemSetting.findUnique({ where: { key: BLOCK_RETRY_AT } })
  const retryAt = retryRow?.value ? Date.parse(retryRow.value) : 0
  if (Number.isFinite(retryAt) && Date.now() < retryAt) return

  const granted = await requestBlockFromCloud(tenantId, year, INVOICE_BLOCK_SIZE)

  if (!granted) {
    await db.systemSetting.upsert({
      where: { key: BLOCK_RETRY_AT },
      create: { key: BLOCK_RETRY_AT, value: new Date(Date.now() + BLOCK_RETRY_COOLDOWN_MS).toISOString() },
      update: { value: new Date(Date.now() + BLOCK_RETRY_COOLDOWN_MS).toISOString() },
    })
    return
  }

  // Sama seperti writeActiveBlock: `deleteMany` supaya "belum ada cooldown"
  // yang normal tidak tercatat sebagai error di log.
  await db.systemSetting.deleteMany({ where: { key: BLOCK_RETRY_AT } })
  await writeActiveBlock(db, {
    year,
    deviceId: granted.deviceId,
    next: granted.start,
    end: granted.end,
  })
}

/**
 * Nomor nota berikutnya untuk (tenant, tahun).
 *
 * Panggil DI DALAM transaksi database yang sama dengan pembuatan transaksi.
 * Parameter `tx` harus berarti client transaksi Prisma — itulah yang membuat
 * "ambil nomor + buat transaksi" gagal bersama bila salah satu gagal.
 *
 * Fungsi ini SENGAJA tidak melakukan I/O jaringan; pemesanan blok diurus oleh
 * ensureInvoiceBlockReady() sebelum transaksi dibuka.
 *
 * Type tx sengaja longgar: pada mode cloud memakai `tx` dari `$transaction`,
 * sedangkan mode lokal memakai `db` langsung. Keduanya punya `systemSetting`
 * dan `invoiceCounter`.
 */
export async function allocateInvoiceNumber(
  tx: Pick<PrismaClient, 'systemSetting' | 'invoiceCounter'>,
  opts: { tenantId: string; year: number },
): Promise<string> {
  // ---------- MODE CLOUD / serverless ----------
  // Tidak ada perangkat, jadi tidak ada risiko bentrok antar perangkat:
  // semua nomor keluar dari satu counter global yang di-increment atomik.
  if (dbMode !== 'local') {
    const counter = await tx.invoiceCounter.upsert({
      where: { tenantId_year: { tenantId: opts.tenantId, year: opts.year } },
      create: { tenantId: opts.tenantId, year: opts.year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    })
    return formatInvoice(opts.year, counter.lastNumber)
  }

  await ensureLocalDb()

  // ---------- MODE LOKAL (desktop) ----------
  const current = await readActiveBlock(tx)

  // Blok masih berlaku untuk tahun ini → pakai (murni lokal, tanpa jaringan).
  //
  // PENTING: read/write memakai `tx` yang sama, bukan client global `db`.
  // SQLite hanya punya satu koneksi per client Prisma; menjalankan query lain
  // lewat `db` di tengah transaksi interaktif akan membuat permintaan itu
  // menunggu kunci koneksi dan berakhir "Socket timeout". Ini sempat terjadi.
  if (current && current.year === opts.year && current.next <= current.end) {
    const { invoiceNumber, block } = consumeFromBlock(current)
    await writeActiveBlock(tx, block)
    return invoiceNumber
  }

  // ---------- OFFLINE DAN BLOK HABIS ----------
  // Blok tidak ada (offline, atau ensureInvoiceBlockReady() gagal). Nomor
  // device-scoped dipakai: dijamin unik antar perangkat, jadi kasir tidak
  // berhenti berjualan hanya karena internet putus.
  //
  // Nomor seperti INV-2026-000005-KASIRPC07 hanya muncul pada kondisi itu,
  // jadi management bisa mengetahuinya dari formatnya.
  const deviceId = (await getDeviceId()) ?? 'OFFLINE'
  const deviceTag = sanitizeDeviceTag(deviceId)

  const fallbackCounter = await tx.invoiceCounter.upsert({
    where: { tenantId_year: { tenantId: opts.tenantId, year: opts.year } },
    create: { tenantId: opts.tenantId, year: opts.year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  })

  // Cukup catsat sekali per blok baru, bukan setiap transaksi.
  if (current?.next === 1 || !current) {
    console.warn(
      `[invoice-block] blok habis & offline — memakai nomor device-scoped ` +
        `(${formatInvoice(opts.year, fallbackCounter.lastNumber)}-${deviceTag})`,
    )
  }
  return `${formatInvoice(opts.year, fallbackCounter.lastNumber)}-${deviceTag}`
}

/** 6 karakter pertama dari id perangkat, huruf besar, aman untuk filename nota. */
function sanitizeDeviceTag(deviceId: string): string {
  return deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase().padEnd(6, 'X')
}

/**
 * Berapa nomor nota yang tersisa di blok aktif — untuk indikator UI.
 * Mengembalikan null bila tidak ada blok.
 */
export async function remainingInvoiceNumbers(): Promise<number | null> {
  if (!isLocalMode()) return null
  const block = await readActiveBlock(db)
  if (!block) return null
  return Math.max(0, block.end - block.next + 1)
}
