/**
 * Mesin sinkronisasi lokal <-> cloud.
 *
 * ARAH: perangkat -> cloud (push) lalu cloud -> perangkat (pull).
 * Push selalu mendahului pull. Urutan itu penting: kalau pull lebih dulu,
 * salinan lama dari cloud bisa menimpa perubahan lokal yang belum sempat naik.
 *
 * ATURAN KONFLIK:
 *   - Entitas LWW  -> bandingkan `updatedAt`; yang lebih baru menang. Perubahan
 *                    lokal menang kalau waktunya sama, agar kasir offline tidak
 *                    kehilangan pekerjaannya.
 *   - Entitas APPEND -> cloud hanya menerima, tidak pernah menimpa. Baris yang
 *                    sudah ada di cloud dilewati (idempoten).
 *   - Session TIDAK ikut sync. Sesi adalah milik perangkat.
 *   - Stok TIDAK ikut sync sebagai angka. Stok dihitung ulang dari
 *     InventoryMovement, sehingga hasilnya sama di semua perangkat
 *     apa pun urutan sinkronisasi.
 *
 * Idempoten: push/pull bisa diulang dengan aman, dan `SyncState.syncedHash`
 * mencegah penulisan ulang yang tidak perlu.
 */

import { db, dbMode } from '../db'
import { ensureLocalDb } from '../local-db-bootstrap'
import { getDeviceId, getUniqueDeviceLabel, isLocalMode } from '../device'
import { ENTITIES, SYNC_ORDER, isDeviceLocalSetting, type EntityDef, type EntityName } from './entities'
import { SyncUnavailableError, withCloud, type CloudClient } from './cloud'
import { buildScope } from './scope'

export type SyncPhase = 'push' | 'pull' | 'full' | 'bootstrap'

export type SyncReport = {
  phase: SyncPhase
  pushed: number
  pulled: number
  conflicts: number
  skipped: number
  durationMs: number
  at: string
  error?: string
  offline?: boolean
  /** Rincian per entitas — berguna saat sinkronisasi gagal sebagian. */
  entities?: Array<{ entity: string; pushed: number; pulled: number; error?: string }>
}

const CURSOR_PREFIX = 'sync.cursor.'

/** Kursor waktu terakhir pull untuk satu entitas. */
async function readCursor(entity: EntityName): Promise<Date> {
  const row = await db.systemSetting.findUnique({ where: { key: CURSOR_PREFIX + entity } })
  const iso = row?.value
  if (!iso) return new Date(0)
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? new Date(0) : d
}

async function writeCursor(entity: EntityName, at: Date): Promise<void> {
  await db.systemSetting.upsert({
    where: { key: CURSOR_PREFIX + entity },
    create: { key: CURSOR_PREFIX + entity, value: at.toISOString() },
    update: { value: at.toISOString() },
  })
}

/** Tandai baris lokal sebagai "sudah naik ke cloud". */
async function markClean(entity: EntityName, ids: string[], syncedHash: string | null): Promise<void> {
  if (ids.length === 0) return
  const now = new Date()
  await db.$transaction(
    ids.map((entityId) =>
      db.syncState.upsert({
        where: { entity_entityId: { entity, entityId } },
        create: { entity, entityId, dirty: false, syncedAt: now, syncedHash },
        update: { dirty: false, syncedAt: now, syncedHash },
      }),
    ),
  )
}

/** Ambil hanya field yang terdaftar di registri, sebagai objek datar. */
function pickFields(row: Record<string, unknown>, def: EntityDef): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of def.fields) out[f] = row[f]
  return out
}

/**
 * Akses model dinamis. Nama model berasal dari registri (bukan input user), dan
 * Prisma tidak menyediakan tipe untuk "model bernama variabel" — jadi satu
 * delegasi generik dipakai untuk push/pull/bootstrap.
 */
type ModelDelegate = Record<string, (...args: any[]) => Promise<any>>

function localModel(name: EntityName): ModelDelegate {
  return (db as unknown as Record<string, ModelDelegate>)[name] as ModelDelegate
}

function cloudModel(cloud: CloudClient, name: EntityName): ModelDelegate {
  return (cloud as unknown as Record<string, ModelDelegate>)[name] as ModelDelegate
}

/**
 * Kunci unik alami untuk lookup idempoten (mis. User.email saat bootstrap).
 * Dipakai first-run agar tidak membuat user dua kali bila sync terulang.
 */
function naturalKeyOf(def: EntityDef, row: Record<string, unknown>): Record<string, unknown> | null {
  if (!def.uniqueKeys?.length) return null
  const out: Record<string, unknown> = {}
  for (const k of def.uniqueKeys) out[k] = row[k]
  return out
}

// ---------------------------------------------------------------------------
// PUSH: perangkat -> cloud
// ---------------------------------------------------------------------------

async function pushEntity(
  cloud: CloudClient,
  def: EntityDef,
  tenantId: string | null,
): Promise<{ pushed: number; conflicts: number }> {
  const model = cloudModel(cloud, def.name)
  const local = localModel(def.name)

  // Kandidat naik: baris yang (a) ditandai dirty, (b) belum PERNAH punya
  // SyncState (baru dibuat lokal), atau (c) berubah SETELAH sinkronisasi terakhir.
  //
  // Syarat (c) memakai perbandingan `updatedAt > syncedAt` yang sepenuhnya
  // lokal — tanpa perlu query ke cloud untuk setiap baris. Tanpa itu, perubahan
  // lokal pada baris yang sudah pernah tersinkron tidak pernah terdeteksi:
  // mis. `recomputeStock()` yang menaikkan `updatedAt` CatalogItem tidak
  // akan pernah naik ke cloud, sehingga stok di server melekat selamanya.
  const states = await db.syncState.findMany({
    where: { entity: def.name },
    select: { entityId: true, dirty: true, syncedAt: true },
  })
  const known = new Map(states.map((s) => [s.entityId, s]))

  const scope = await buildScope(db, def, tenantId)
  if (scope.kind === 'empty') return { pushed: 0, conflicts: 0 }

  const fresh = (await local.findMany({
    where: scope.kind === 'global' ? {} : scope.where,
    orderBy: { [def.pk]: 'asc' },
  })) as Array<Record<string, unknown>>

  const candidates = fresh.filter((r) => {
    // Kunci milik perangkat (blok nota, id perangkat, kursor sync) tidak boleh
    // naik ke cloud — kalau bocor, perangkat lain ikut memakainya.
    if (def.name === 'SystemSetting' && isDeviceLocalSetting(String(r[def.pk]))) return false
    if (def.strategy === 'append') return true // immutable: selalu coba kirim

    const id = String(r[def.pk])
    const st = known.get(id)
    if (!st) return true // belum pernah sync
    if (st.dirty) return true
    if (def.timeField && st.syncedAt) {
      const changedAt = r[def.timeField] as Date | undefined
      if (changedAt && changedAt > st.syncedAt) return true
    }
    return false
  })

  if (process.env.SERBABISA_SYNC_DEBUG) {
    console.warn(
      `[sync-debug] ${JSON.stringify({
        entity: def.name,
        pk: def.pk,
        scope: scope.kind,
        known: known.size,
        fresh: fresh.length,
        kandidat: candidates.length,
      })}`,
    )
  }

  let pushed = 0
  let conflicts = 0
  const pushedIds: string[] = []

  for (const raw of candidates as Array<Record<string, unknown>>) {
    const data = pickFields(raw, def)

    // Entitas append: cloud hanya menerima, dan itu pun hanya bila belum ada.
    if (def.strategy === 'append') {
      const existing = await model.findUnique({ where: { [def.pk]: data[def.pk] as string }, select: { [def.pk]: true } })
      if (existing) {
        pushedIds.push(String(data.id))
        continue
      }
      try {
        await model.create({ data })
        pushed++
        pushedIds.push(String(data.id))
      } catch {
        // Pelanggaran unique (mis. idempotencyKey) -> biarkan cloud, tandai bersih.
        pushedIds.push(String(data.id))
      }
      continue
    }

    // Entitas LWW: cloud hanya ditimpa kalau cloud tidak lebih baru.
    const existing = await model.findUnique({ where: { [def.pk]: data[def.pk] as string } })
    if (existing) {
      const cloudUpdated = (existing as { updatedAt?: Date }).updatedAt
      const localUpdated = raw.updatedAt as Date | undefined
      if (cloudUpdated && localUpdated && cloudUpdated > localUpdated) {
        // Cloud lebih baru -> jangan ditimpa; pull akan mengambilnya.
        conflicts++
        await markClean(def.name, [String(data.id)], cloudUpdated.toISOString())
        continue
      }
    }

    const saved = existing
      ? await model.update({ where: { [def.pk]: data[def.pk] as string }, data })
      : await model.create({ data })
    pushed++
    pushedIds.push(String(data.id))
    const cloudUpdated = (saved as { updatedAt?: Date }).updatedAt
    await markClean(
      def.name,
      [String(data.id)],
      cloudUpdated ? cloudUpdated.toISOString() : null,
    )
  }

  return { pushed, conflicts }
}

// ---------------------------------------------------------------------------
// PULL: cloud -> perangkat
// ---------------------------------------------------------------------------

async function pullEntity(
  cloud: CloudClient,
  def: EntityDef,
  tenantId: string | null,
  full: boolean,
): Promise<{ pulled: number; conflicts: number }> {
  const model = cloudModel(cloud, def.name)
  const local = localModel(def.name)
  const cursor = full ? new Date(0) : await readCursor(def.name)

  // Cakupan tenant diselesaikan oleh buildScope(): sebagian entitas (mis.
  // TransactionItem) tidak punya tenantId dan harus ikut transaksi induknya.
  const scope = await buildScope(db, def, tenantId)
  if (scope.kind === 'empty') return { pulled: 0, conflicts: 0 }

  const where: Record<string, unknown> = scope.kind === 'global' ? {} : { ...scope.where }
  if (def.name !== 'SystemSetting') where[def.timeField] = { gt: cursor }

  const rows = (await model.findMany({
    where,
    orderBy: { [def.timeField]: 'asc' },
    take: 2000,
  })) as Array<Record<string, unknown>>
  let pulled = 0
  let conflicts = 0
  let maxSeen = cursor

  for (const raw of rows) {
    const data = pickFields(raw, def)
    const pk = def.pk
    const id = String(data[pk])

    // Pengaturan milik perangkat tidak pernah masuk ke perangkat lain.
    if (def.name === 'SystemSetting' && isDeviceLocalSetting(id)) continue

    const rowUpdated = raw[def.timeField] as Date | undefined
    if (rowUpdated && rowUpdated > maxSeen) maxSeen = rowUpdated

    const localRow = await local.findUnique({ where: { [pk]: id } })
    const state = await db.syncState.findUnique({
      where: { entity_entityId: { entity: def.name, entityId: id } },
    })

    // Sudah identik dengan cloud — tidak perlu menulis apa pun.
    if (state?.syncedHash && rowUpdated && state.syncedHash === rowUpdated.toISOString()) {
      continue
    }

    if (localRow) {
      const localUpdated = (localRow as { updatedAt?: Date }).updatedAt
      const cloudIsNewer = rowUpdated && (!localUpdated || rowUpdated > localUpdated)
      const localIsDirty = state?.dirty === true

      if (localIsDirty && !cloudIsNewer) {
        // Perubahan lokal belum terpush dan tidak kalah — biarkan, push akan menanganinya.
        conflicts++
        continue
      }
      if (!cloudIsNewer && !full) {
        // Kursor sudah melewati, tidak ada yang berubah.
        continue
      }
      await local.upsert({ where: { [pk]: id }, update: data, create: data })
    } else {
      // Foreign key child harus parent-nya ada lebih dulu — SYNC_ORDER menjamin itu.
      try {
        await local.create({ data })
      } catch {
        // Melewati baris yang melanggar FK / unique; baris berikutnya tetap jalan.
        continue
      }
    }

    pulled++
    await markClean(def.name, [id], rowUpdated ? rowUpdated.toISOString() : null)
  }

  if (rows.length > 0) await writeCursor(def.name, maxSeen)
  return { pulled, conflicts }
}

// ---------------------------------------------------------------------------
// Stok: turunan dari ledger, bukan angka yang disalin
// ---------------------------------------------------------------------------

/**
 * Hitung ulang `stockQty` dari InventoryMovement.
 *
 * Kenapa tidak menyalin angka stok antar perangkat: dua perangkat bisa sama-
 * sama menjual barang yang sama saat offline. Kalau angka stok ikut disalin,
 * penjualan satu perangkat akan menimpa penjualan device lain dan hasil
 * akhirnya bergantung pada urutan sync — tidak deterministik.
 *
 * Dengan menghitung dari ledger (SALE/VOID_RETURN menambah, REFUND_RETURN
 * mengurangi, ADJUSTMENT sesuai arah), semua perangkat pasti berakhir pada
 * angka yang sama.
 */
export async function recomputeStock(tenantId: string): Promise<number> {
  await ensureLocalDb()

  // Stok awal dicatat sebagai ADJUSTMENT saat item dibuat, jadi ledger memuat
  // seluruh riwayat — cukup dijumlahkan movement per item.
  const movements = await db.inventoryMovement.findMany({
    where: { tenantId },
    select: { catalogItemId: true, movementType: true, quantity: true },
  })
  if (movements.length === 0) return 0

  const totals = new Map<string, number>()
  // Item yang punya ADJUSTMENT berarti ledger-nya lengkap: ada titik awal
  // yang diketahui, jadi angkanya boleh dihitung ulang.
  const anchored = new Set<string>()
  for (const m of movements) {
    totals.set(m.catalogItemId, (totals.get(m.catalogItemId) ?? 0) + deltaForMovement(m.movementType, m.quantity))
    if (m.movementType === 'ADJUSTMENT') anchored.add(m.catalogItemId)
  }

  // Item TANPA ADJUSTMENT tidak boleh dihitung ulang: titik awal stoknya tidak
  // diketahui, jadi penjumlahannya hanya akan menghasilkan angka negatif.
  //
  // Ini bukan kasus hipotetis. Katalog lama (mis. hasil seed, atau dibuat
  // sebelum perubahan ini) mengisi `stockQty` langsung tanpa movement, sedangkan
  // penjualan tetap tercatat. Tanpa guard ini, Air Mineral 600ml berubah dari
  // stok 92 menjadi -8 hanya karena satu kali sinkronisasi.
  if (anchored.size === 0) return 0

  const items = await db.catalogItem.findMany({
    where: { tenantId, id: { in: [...anchored] } },
    select: { id: true, stockQty: true },
  })

  let changed = 0
  for (const item of items) {
    const next = round3(totals.get(item.id) ?? 0)
    if (item.stockQty === next) continue
    await db.catalogItem.update({ where: { id: item.id }, data: { stockQty: next } })
    changed++
  }
  return changed
}

/** Arah delta per tipe movement: SALE & REFUND_RETURN mengurangi, sisanya menambah. */
function deltaForMovement(type: string, qty: number): number {
  switch (type) {
    case 'SALE':
    case 'REFUND_RETURN':
      return -Math.abs(qty)
    case 'VOID_RETURN':
    case 'ADJUSTMENT':
    default:
      return Math.abs(qty)
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ---------------------------------------------------------------------------
// Orkestrasi
// ---------------------------------------------------------------------------

export type SyncOptions = {
  /** Batasi tenant (multi-tenant: hanya tenant perangkat ini). */
  tenantId?: string | null
  /** Tarik seluruh riwayat, bukan hanya perubahan sejak kursor. */
  full?: boolean
}

function emptyReport(phase: SyncPhase): SyncReport {
  return { phase, pushed: 0, pulled: 0, conflicts: 0, skipped: 0, durationMs: 0, at: new Date().toISOString() }
}

/** Jalankan satu siklus sinkronisasi penuh. Aman dipanggil berulang. */
export async function runSync(options: SyncOptions = {}): Promise<SyncReport> {
  const phase: SyncPhase = options.full ? 'full' : 'push'
  const report = emptyReport(phase)
  const started = Date.now()

  if (dbMode !== 'local') {
    report.error = 'Sinkronisasi hanya berjalan pada mode lokal (desktop).'
    report.durationMs = Date.now() - started
    return report
  }

  await ensureLocalDb()
  const tenantId = options.tenantId ?? null
  const full = options.full === true

  try {
    // 1) Pastikan perangkat terdaftar di cloud (agar bisa memesan blok nota).
    if (tenantId) {
      await withCloud(async (cloud) => {
        const deviceId = await getDeviceId()
        if (!deviceId) return
        const name = await getUniqueDeviceLabel()
        const found = await cloud.device.findFirst({ where: { id: deviceId }, select: { id: true } })
        if (!found) {
          try {
            await cloud.device.create({ data: { id: deviceId, tenantId, name, platform: 'WINDOWS' } })
          } catch (err) {
            // Tidak fatal: perangkat tetap bisa offline. Tapi nomor nota akan
            // memakai format device-scoped, jadi perlu diketahui.
            console.error(`[sync] gagal mendaftarkan perangkat "${name}":`, err)
          }
        } else {
          await cloud.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }).catch(() => undefined)
        }
      })
    }

    // 2) Hitung stok dari ledger SEBELUM push, supaya angka turunan yang
    //    dikirim ke cloud sudah benar pada siklus ini juga (bukan satu siklus
    //    terlambat). Item tanpa anchor ADJUSTMENT dilewati oleh recomputeStock.
    if (tenantId) {
      try {
        await recomputeStock(tenantId)
      } catch (err) {
        console.warn('[sync] recompute stok pra-push gagal:', err)
      }
    }

    // 3) Push, lalu 4) pull. Urutan ini wajib (lihat catatan di atas file).
    const cloud = (await import('./cloud')).getCloudDb()

    // Kegagalan SATU entitas tidak boleh membatalkan sinkronisasi entitas lain.
    // Ini sempat terjadi: satu query salah (SystemSetting tidak punya kolom `id`)
    // membuat SELURUH sync berhenti, termasuk stok yang tidak pernah dihitung ulang.
    const errors: string[] = []
    const perEntity: NonNullable<SyncReport['entities']> = []
    const detail = new Map<string, { pushed: number; pulled: number }>()

    for (const def of ENTITIES) {
      if (def.name === 'Tenant' && !tenantId) continue
      try {
        const r = await pushEntity(cloud, def, tenantId)
        report.pushed += r.pushed
        report.conflicts += r.conflicts
        detail.set(def.name, { pushed: r.pushed, pulled: 0 })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${def.name} (push): ${msg}`)
        detail.set(def.name, { pushed: 0, pulled: 0 })
      }
    }

    for (const name of SYNC_ORDER) {
      const def = ENTITIES.find((e) => e.name === name)
      if (!def) continue
      if (name === 'Tenant' && !tenantId) continue
      try {
        const r = await pullEntity(cloud, def, tenantId, full)
        report.pulled += r.pulled
        report.conflicts += r.conflicts
        const prev = detail.get(name) ?? { pushed: 0, pulled: 0 }
        detail.set(name, { pushed: prev.pushed, pulled: r.pulled })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push(`${def.name} (pull): ${msg}`)
        const prev = detail.get(name) ?? { pushed: 0, pulled: 0 }
        detail.set(name, prev)
      }
    }

    for (const [entity, d] of detail) {
      const row: { entity: string; pushed: number; pulled: number; error?: string } = {
        entity,
        pushed: d.pushed,
        pulled: d.pulled,
      }
      const e = errors.find((x) => x.startsWith(entity + ' '))
      if (e) row.error = e
      perEntity.push(row)
    }
    report.entities = perEntity

    // 5) Stok diturunkan ulang dari ledger setelah semua movement dari
    //    perangkat lain ikut masuk. Nilai koreksinya naik pada siklus berikutnya.
    if (tenantId) {
      try {
        await recomputeStock(tenantId)
      } catch (err) {
        errors.push(`stok: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (errors.length) {
      report.error = errors.join(" | ")
      console.error('[sync] sebagian entitas gagal:', errors)
    }
  } catch (err) {
    report.durationMs = Date.now() - started
    report.error = err instanceof Error ? err.message : String(err)
    report.offline = err instanceof SyncUnavailableError
    return report
  }

  report.durationMs = Date.now() - started
  return report
}

/** Ringkasan status sinkronisasi untuk UI. */
export type SyncStatus = {
  enabled: boolean
  isLocalMode: boolean
  deviceId: string | null
  deviceName: string
  lastSyncAt: string | null
  lastError: string | null
  pendingChanges: number
  remainingInvoiceNumbers: number | null
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (!isLocalMode()) {
    return {
      enabled: false,
      isLocalMode: false,
      deviceId: null,
      deviceName: 'SERVER',
      lastSyncAt: null,
      lastError: null,
      pendingChanges: 0,
      remainingInvoiceNumbers: null,
    }
  }
  await ensureLocalDb()

  const [pending, lastSyncRow] = await Promise.all([
    db.syncState.count({ where: { dirty: true } }),
    db.systemSetting.findUnique({ where: { key: 'sync.lastAt' } }),
  ])
  const lastErrorRow = await db.systemSetting.findUnique({ where: { key: 'sync.lastError' } })
  const { remainingInvoiceNumbers } = await import('../invoice-number')

  return {
    enabled: true,
    isLocalMode: true,
    deviceId: await getDeviceId(),
    deviceName: await getUniqueDeviceLabel(),
    lastSyncAt: lastSyncRow?.value ?? null,
    lastError: lastErrorRow?.value ?? null,
    pendingChanges: pending,
    remainingInvoiceNumbers: await remainingInvoiceNumbers(),
  }
}

/** Catat hasil sync terakhir (dipanggil scheduler setelah runSync). */
export async function recordSyncOutcome(report: SyncReport): Promise<void> {
  if (!isLocalMode()) return
  await ensureLocalDb()
  if (report.error) {
    await db.systemSetting.upsert({
      where: { key: 'sync.lastError' },
      create: { key: 'sync.lastError', value: report.error },
      update: { value: report.error },
    })
    return
  }
  await db.systemSetting.upsert({
    where: { key: 'sync.lastError' },
    create: { key: 'sync.lastError', value: '' },
    update: { value: '' },
  })
  await db.systemSetting.upsert({
    where: { key: 'sync.lastAt' },
    create: { key: 'sync.lastAt', value: report.at },
    update: { value: report.at },
  })
  // Blok nota yang terpakai habis bisa dilepas supaya blok baru dipesan
  // pada siklus berikutnya (tidak-Menahan penunjuk di tahun yang sudah ganti).
  await db.systemSetting.deleteMany({ where: { key: 'sync.lastAt', value: '' } }).catch(() => undefined)
}
