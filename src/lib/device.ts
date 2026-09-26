/**
 * Identitas perangkat kasir.
 *
 * Setiap instalasi .exe = satu perangkat. ID-nya dibuat sekali lalu disimpan di
 * database lokal. ID ini yang dipakai untuk:
 *   - reservasi blok nomor nota (mencegah nomor INV bentrok antar perangkat)
 *   - menandai perubahan lokal yang perlu didorong ke cloud
 *
 * Di mode cloud (Vercel) tidak ada perangkat — fungsi selalu null.
 */

import { db, dbMode } from './db'
import { ensureLocalDb } from './local-db-bootstrap'

const SETTING_KEY = 'device.id'
const SETTING_NAME = 'KASIR-PC'

/** Nama perangkat yang mudah dibaca kasir/admin, mis. "KASIR-PC-01". */
function defaultDeviceName(): string {
  const host = (process.env.COMPUTERNAME || process.env.HOSTNAME || 'KASIR-PC').toUpperCase()
  const safe = host.replace(/[^A-Z0-9\-_]/g, '-').slice(0, 40)
  return safe || 'KASIR-PC'
}

/** True bila aplikasi berjalan dengan database lokal (desktop). */
export function isLocalMode(): boolean {
  return dbMode === 'local'
}

/**
 * ID perangkat, dibuat sekali lalu disimpan permanen.
 * Mengembalikan null pada mode cloud.
 */
export async function getDeviceId(): Promise<string | null> {
  if (!isLocalMode()) return null
  await ensureLocalDb()

  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } })
  if (row) return row.value

  const id = crypto.randomUUID()
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: id },
    update: { value: id },
  })
  return id
}

/**
 * Nama perangkat untuk ditampilkan di UI/dashboard.
 *
 * WAJIB unik per instalasi: `Device` punya batasan `@@unique([tenantId, name])`
 * di cloud. Kalau namanya hanya nama komputer, memasang ulang aplikasi di PC
 * yang sama akan GAGAL terdaftar (unique violation) — dan akibatnya perangkat
 * tidak bisa memesan blok nomor nota, sehingga semua nota terbit dengan
 * format device-scoped. Bug ini benar-benar terjadi.
 *
 * Karena itu 4 karakter id perangkat ditambahkan sebagai akhiran.
 */
export async function getDeviceName(): Promise<string> {
  if (!isLocalMode()) return 'SERVER'
  await ensureLocalDb()
  const row = await db.systemSetting.findUnique({ where: { key: 'device.name' } })
  if (row) return row.value
  const name = defaultDeviceName()
  await db.systemSetting.upsert({
    where: { key: 'device.name' },
    create: { key: 'device.name', value: name },
    update: {},
  })
  return name
}

/** Label perangkat yang unik per instalasi, untuk didaftarkan ke cloud. */
export async function getUniqueDeviceLabel(): Promise<string> {
  const base = await getDeviceName()
  const id = (await getDeviceId()) ?? ''
  const suffix = id.replace(/[^a-f0-9]/gi, '').slice(0, 4).toUpperCase() || '0000'
  return `${base}-${suffix}`
}

/**
 * Tenant tempat perangkat ini terdaftar.
 *
 * Disimpan saat aktivasi (pertama kali login dengan internet). Nilai inilah
 * yang dipakai scheduler sinkronisasi — bukan `tenant.findFirst()`, karena itu
 * bisa memilih tenant yang salah bila database lokal punya lebih dari satu
 * baris (mis. karena sync pernah menarik data toko lain).
 */
export async function getDeviceTenantId(): Promise<string | null> {
  if (!isLocalMode()) return null
  await ensureLocalDb()
  const row = await db.systemSetting.findUnique({ where: { key: 'device.tenantId' } })
  if (row?.value) return row.value

  // Fallback untuk database yang sudah ada sebelum fitur ini: pakai tenant
  // yang punya pengguna lokal. Kalau tidak ada, null (sync akan dilewati).
  const tenant = await db.tenant.findFirst({
    where: { users: { some: {} } },
    select: { id: true },
  })
  return tenant?.id ?? null
}
