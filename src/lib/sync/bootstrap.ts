/**
 * Aktivasi first-run: mengisi database lokal dari cloud.
 *
 * MASALAH AYAM-TELUR:
 *   Offline login butuh user+passwordHash di SQLite lokal. Tapi user itu sendiri
 *   berasal dari cloud. Jadi pada pemakaian pertama, database lokal masih kosong.
 *
 * SOLUSI (tanpa konsep baru, tanpa kode aktivasi admin):
 *   Login pertama kali diverifikasi terhadap CLOUD. Kalau berhasil, tenant + user
 *   + data pendukung (kategori, katalog, pelanggan, template, pengaturan) disalin
 *   ke SQLite lokal. Setelah itu semua login berikutnya pure-lokal — offline pun
 *   bisa masuk.
 *
 * Prinsip keamanan:
 *   - Password tidak pernah menyentuh disk. Yang disalin `passwordHash` (scrypt)
 *     milik tenant tersebut saja.
 *   - SyncState ditandai BERSIH setelah tarik, supaya data yang baru diunduh tidak
 *     langsung dipush balik ke cloud.
 *   - Kegagalan penarikan tidak menghapus apa pun yang sudah ada.
 */

import { db, dbMode } from '../db'
import { ensureLocalDb } from '../local-db-bootstrap'
import { getDeviceId, getUniqueDeviceLabel } from '../device'
import { ENTITIES, SYNC_ORDER, isDeviceLocalSetting, type EntityDef } from './entities'
import { withCloud } from './cloud'
import { buildScope } from './scope'

export type BootstrapResult =
  | { ok: true; userId: string; tenantId: string | null; rows: number }
  | { ok: false; reason: 'no-cloud' | 'cloud-unreachable' | 'user-not-found' | 'error'; message: string }

/** Salin satu baris cloud ke SQLite lokal, memakai field dari registri. */
async function copyRow(def: EntityDef, row: Record<string, unknown>): Promise<boolean> {
  const data: Record<string, unknown> = {}
  for (const f of def.fields) data[f] = row[f]

  const local = (db as unknown as Record<string, any>)[def.name]
  const pk = def.pk
  const id = String(data[pk])

  const existing = await local.findUnique({ where: { [pk]: id } })
  if (existing) {
    await local.update({ where: { [pk]: id }, data })
  } else {
    try {
      await local.create({ data })
    } catch {
      // Parent belum ada (foreign key) atau unique bentrok — lewati baris ini.
      return false
    }
  }

  // Tandai bersih: ini data dari cloud, bukan perubahan lokal.
  await db.syncState.upsert({
    where: { entity_entityId: { entity: def.name, entityId: id } },
    create: { entity: def.name, entityId: id, dirty: false, syncedAt: new Date() },
    update: { dirty: false, syncedAt: new Date() },
  })
  return true
}

/**
 * Tarik seluruh data tenant ke database lokal.
 * Idempoten: aman dipanggil ulang (mis. setelah sinkronisasi penuh).
 */
export async function bootstrapTenantFromCloud(tenantId: string): Promise<number> {
  await ensureLocalDb()
  return withCloud(async (cloud) => {
    let copied = 0

    // Daftarkan perangkat agar bisa memesan blok nomor nota.
    const deviceId = await getDeviceId()
    if (deviceId) {
      const name = await getUniqueDeviceLabel()
      const found = await cloud.device.findFirst({ where: { id: deviceId }, select: { id: true } })
      if (!found) {
        try {
          await cloud.device.create({ data: { id: deviceId, tenantId, name, platform: 'WINDOWS' } })
        } catch (err) {
          // Kegagalan ini menurunkan kakualitas nomor nota (perangkat tidak bisa
          // memesan blok), jadi TIDAK boleh disembunyikan.
          console.error(
            `[bootstrap] gagal mendaftarkan perangkat "${name}" ke cloud:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    }

    for (const name of SYNC_ORDER) {
      const def = ENTITIES.find((e) => e.name === name)
      if (!def) continue
      if (name === 'SystemSetting') {
        // Hanya pengaturan global. Metadata internal perangkat (blok nota,
        // id perangkat, kursor sync) TIDAK boleh ikut — menariknya membuat
        // perangkat memakai blok nota milik perangkat lain.
        const all = (await cloud.systemSetting.findMany()) as Array<{ key: string }>
        for (const row of all) {
          if (isDeviceLocalSetting(row.key)) continue
          if (await copyRow(def, row as Record<string, unknown>)) copied++
        }
        continue
      }

      // Cakupan tenant: TransactionItem tidak punya tenantId, jadi ikut transaksi.
      const scope = await buildScope(db, def, tenantId)
      if (scope.kind === 'empty') continue
      const where =
        name === 'Tenant'
          ? { id: tenantId }
          : scope.kind === 'global'
            ? {}
            : scope.where

      const model = (cloud as unknown as Record<string, any>)[def.name]
      const rows = await model.findMany({ where })
      for (const row of rows) {
        if (await copyRow(def, row as Record<string, unknown>)) copied++
      }
    }

    // Stok TIDAK ikut sync sebagai angka (lihat catatan di entities.ts) — jadi
    // setelah semua InventoryMovement masuk, stok harus dihitung ulang dari
    // ledger. Tanpa ini katalog lokal akan terlihat "stok 0" padahal cloud
    // punya stok 50.
    const { recomputeStock } = await import('./engine')
    await recomputeStock(tenantId)

    // Simpan tenantId perangkat ini secara eksplisit. Scheduler sync memakai
    // nilai ini, bukan `tenant.findFirst()` — sehingga tidak pernah salah pilih
    // tenant ketika database lokal berisi lebih dari satu baris.
    await db.systemSetting.upsert({
      where: { key: 'device.tenantId' },
      create: { key: 'device.tenantId', value: tenantId },
      update: { value: tenantId },
    })

    return copied
  })
}

/**
 * Login pertama: verifikasi kredensial di CLOUD, lalu aktifkan database lokal.
 * Mengembalikan userId + tenantId supaya pemanggil bisa membuat sesi lokal.
 */
export async function bootstrapUserFromCloud(params: {
  email: string
  passwordHashMatches: (cloudHash: string) => boolean
}): Promise<BootstrapResult> {
  if (dbMode !== 'local') {
    return { ok: false, reason: 'error', message: 'Bootstrap hanya berlaku untuk mode lokal.' }
  }
  await ensureLocalDb()

  try {
    return await withCloud(async (cloud) => {
      const user = await cloud.user.findUnique({
        where: { email: params.email.toLowerCase() },
        include: { tenant: true },
      })
      if (!user) {
        return { ok: false, reason: 'user-not-found' as const, message: 'Akun tidak ditemukan di server.' }
      }
      if (!params.passwordHashMatches(user.passwordHash)) {
        return { ok: false, reason: 'error', message: 'Password salah.' }
      }
      if (user.status !== 'ACTIVE' || (user.tenant && !user.tenant.isActive)) {
        return { ok: false, reason: 'error', message: 'Akun atau toko sedang dinonaktifkan.' }
      }

      const rows = await bootstrapTenantFromCloud(user.tenantId ?? '')
      return {
        ok: true as const,
        userId: user.id,
        tenantId: user.tenantId,
        rows,
      }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Dicatat supaya masalah aktivasi terlihat di log perangkat, bukan hanya
    // sebagai "tidak dapat dihubungi" di layar kasir.
    console.error('[bootstrap] aktivasi gagal:', err)
    return { ok: false, reason: 'cloud-unreachable', message: msg }
  }
}
