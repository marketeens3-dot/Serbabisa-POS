/**
 * Reservasi blok nomor nota di sisi cloud.
 *
 * Dipanggil dari src/lib/invoice-number.ts (mode lokal) ketika perangkat perlu
 * nomor nota baru dan sedang punya koneksi ke Supabase.
 *
 * Keamanan nomor:
 *   Satu `InvoiceCounter.upsert({ increment: size })` memberi rentang angka yang
 *   MILIK PERANGKAN tersebut. Karena increment-nya atomik di database, dua
 *   perangkat tidak mungkin menerima angka yang sama — inilah yang membuat
 *   nomor INV tetap unik meski keduanya sempat offline.
 *
 * Blok yang sudah dibuat tidak dapat dipakai ulang: `startSeq` unik per
 * (tenant, device), jadi percobaan ulang yang sama tidak akan mendapat rentang
 * baru dan tidak sengaja membuat nomor ganda.
 */

import { withCloud } from './cloud'

export type AllocatedBlock = {
  deviceId: string
  start: number
  end: number
}

/**
 * Pesan `size` nomor nota untuk (tenant, year) atas nama `deviceId`.
 * Mengembalikan null bila perangkat tidak terdaftar di cloud.
 */
export async function syncAllocateInvoiceBlock(params: {
  tenantId: string
  year: number
  size: number
  deviceId: string
}): Promise<AllocatedBlock | null> {
  const { tenantId, year, size, deviceId } = params
  if (!Number.isInteger(size) || size < 1 || size > 1000) {
    throw new Error(`Ukuran blok tidak valid: ${size}`)
  }

  return withCloud(async (cloud) => {
    const device = await cloud.device.findFirst({
      where: { id: deviceId, tenantId },
      select: { id: true },
    })
    if (!device) return null

    // Satu transaksi: counter naik dan blok tercatat bersama-sama. Bila blok
    // gagal ditulis, nomornya tidak "hilang" ke antrean.
    return cloud.$transaction(async (tx) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { tenantId_year: { tenantId, year } },
        create: { tenantId, year, lastNumber: size },
        update: { lastNumber: { increment: size } },
        select: { lastNumber: true },
      })

      const end = counter.lastNumber
      const start = end - size + 1

      await tx.invoiceBlock.create({
        data: { tenantId, deviceId, year, startSeq: start, endSeq: end },
      })
      await tx.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } })

      console.log(
        `[invoice-block] device=${deviceId.slice(0, 8)} tenant=${tenantId.slice(0, 8)} ` +
          `year=${year} blok=${start}..${end} (counter=${end})`,
      )

      return { deviceId, start, end }
    })
  })
}
