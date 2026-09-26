/**
 * Penyaring cakupan tenant untuk sinkronisasi.
 *
 * Hampir semua entitas punya kolom `tenantId`, tapi TIDAK semua:
 *   TransactionItem tidak punya tenantId — ia hanya punya `transactionId`.
 * Mengquery `where: { tenantId }` pada entitas seperti itu akan gagal, dan
 * mengabaikannya berarti membocorkan data toko lain ke perangkat ini.
 *
 * Modul ini menyediakan satu cara resmi menyusun klausa WHERE:
 *   - punya tenantId        → { tenantId }
 *   - anak dari entitas lain → { <parentField>: { in: [...id induk tenant ini] } }
 *   - global (SystemSetting) → {}
 */

import type { PrismaClient } from '@prisma/client'
import type { EntityDef } from './entities'

/** Klausa WHERE untuk entitas anak; butuh daftar id induk. */
export type ScopeResult =
  | { kind: 'global' }
  | { kind: 'tenant'; where: Record<string, unknown> }
  | { kind: 'parent'; where: Record<string, unknown>; parentEntity: string }
  | { kind: 'empty' }

export async function buildScope(
  db: PrismaClient,
  def: EntityDef,
  tenantId: string | null,
): Promise<ScopeResult> {
  // SystemSetting memang global (kunci primer `key`).
  if (def.name === 'SystemSetting') return { kind: 'global' }

  // Tenant tidak punya kolom tenantId (diri sendiri), tapi TIDAK boleh
  // diperlakukan sebagai global: satu perangkat hanya menyimpan tokonya.
  // Bug ini sempat terjadi — sinkronisasi menarik seluruh daftar tenant dari
  // cloud ke database lokal, lalu `findFirst()` mengambil tenant yang salah,
  // sehingga semua query scoped mengembalikan 0 baris dan TIDAK ADA data yang
  // pernah naik ke cloud.
  if (def.name === 'Tenant') {
    if (!tenantId) return { kind: 'empty' }
    return { kind: 'tenant', where: { id: tenantId } }
  }

  if (def.tenantScoped) {
    if (!tenantId) return { kind: 'empty' }
    return { kind: 'tenant', where: { tenantId } }
  }

  if (def.parentEntity && def.parentField) {
    if (!tenantId) return { kind: 'empty' }
    const parentModel = (db as unknown as Record<string, any>)[def.parentEntity]
    const parents = (await parentModel.findMany({
      where: { tenantId },
      select: { id: true },
    })) as Array<{ id: string }>
    // Tanpa induk → tidak ada anak yang boleh ikut sync.
    if (parents.length === 0) return { kind: 'empty' }
    return {
      kind: 'parent',
      parentEntity: def.parentEntity,
      where: { [def.parentField]: { in: parents.map((p) => p.id) } },
    }
  }

  return { kind: 'global' }
}
