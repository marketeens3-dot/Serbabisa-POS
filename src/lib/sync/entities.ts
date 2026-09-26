/**
 * Registri entitas sinkronisasi.
 *
 * Satu-satunya tempat yang mendefinisikan "entitas apa yang ikut sync, dengan
 * aturan apa, dan field mana yang disalin". Dipakai oleh src/lib/sync/engine.ts
 * untuk push maupun pull, dan oleh bootstrap first-run.
 *
 * Strategi:
 *   LWW   — last-write-wins berdasarkan `updatedAt`. Dipakai untuk data yang
 *           bisa diedit dari dua sisi (katalog, pelanggan, template, transaksi
 *           yang di-void/refund).
 *   APPEND — hanya mengalir dari perangkat ke cloud, tidak pernah ditimpa.
 *           Dipakai untuk data immutable (baris nota, jejak stok, audit).
 *   NEVER — tidak ikut sync (sesi perangkat, counter global, SyncState).
 *
 * `fields` ditulis EKSPLISIT (bukan "semua kolom") supaya penambahan kolom
 * berikutnya tidak diam-diam ikut bocor ke cloud tanpa tinjauan kode.
 */

export type SyncStrategy = 'lww' | 'append'
export type EntityName =
  | 'Tenant'
  | 'User'
  | 'Category'
  | 'CatalogItem'
  | 'Customer'
  | 'Transaction'
  | 'CashSession'
  | 'TransactionItem'
  | 'InventoryMovement'
  | 'InvoiceTemplate'
  | 'AuditLog'
  | 'SystemSetting'

export type EntityDef = {
  name: EntityName
  strategy: SyncStrategy
  /**
   * Kolom primary key. Hampir semua model pakai `id`; SystemSetting memakai
   * `key`. Menebak `id` untuk semua entity akan membuat query gagal.
   */
  pk: 'id' | 'key'
  /**
   * Kolom waktu yang dipakai untuk kursor sinkronisasi dan pengurutan.
   * Hampir semua model punya `updatedAt`; model append-only seperti AuditLog
   * hanya punya `createdAt`. Mengebak `updatedAt` akan membuat query gagal.
   */
  timeField: 'updatedAt' | 'createdAt' | 'openedAt'
  /** Kolom yang disalin. Tidak boleh memuat relasi. */
  fields: readonly string[]
  /**
   * Cara membatasi baris ke satu tenant:
   *  - `true`  → kolom `tenantId` tersedia
   *  - `false` → tidak punya tenantId; baris dicakup lewat `parentEntity`
   *              (mis. TransactionItem hanya punya transactionId)
   */
  tenantScoped: boolean
  /** Entitas induk yang dipakai untuk memfilter baris anak. */
  parentEntity?: EntityName
  /** Kolom yang menunjuk ke `parentEntity`. */
  parentField?: string
  /** true bila baris punya tenantId (untuk filter tenant di cloud). */
  uniqueKeys?: readonly string[]
}

export const ENTITIES: readonly EntityDef[] = [
  {
    name: 'Tenant',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: false,
    uniqueKeys: ['slug'],
    fields: [
      'id', 'businessName', 'slug', 'phone', 'whatsappNumber', 'address', 'logoUrl',
      'currency', 'timezone', 'isActive', 'invoiceSettings', 'createdAt', 'updatedAt',
    ],
  },
  {
    name: 'User',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    uniqueKeys: ['email'],
    fields: [
      'id', 'email', 'passwordHash', 'fullName', 'phone', 'role', 'status', 'tenantId',
      'mustChangePassword', 'failedLoginAttempts', 'lockedUntil', 'lastLoginAt',
      'createdAt', 'updatedAt',
    ],
  },
  {
    name: 'Category',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    fields: [
      'id', 'tenantId', 'name', 'normalizedName', 'description', 'isActive',
      'createdAt', 'updatedAt',
    ],
  },
  {
    name: 'CatalogItem',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    fields: [
      'id', 'tenantId', 'type', 'name', 'sku', 'barcode', 'description', 'categoryId',
      'costPrice', 'sellingPrice', 'minStockQty', 'unit', 'isActive', 'createdAt', 'updatedAt',
      // stockQty IKUT disinkronkan, karena nilainya adalah hasil turunan dari
      // ledger (InventoryMovement) yang sudah lengkap titik awalnya.
      //
      // Dulu kolom ini sengaja dikecualikan dengan alasan "jangan menimpa
      // penjualan perangkat lain". Konsekuensinya: nilai di cloud melekat
      // selamanya (tertahan di 92 padahal sebenarnya 84), karena angka turunan
      // tidak pernah ikut naik.
      //
      // Keamanannya sekarang datang dari anchor: recomputeStock() hanya menghitung
      // ulang item yang punya movement ADJUSTMENT, sehingga angka yang dikirim
      // selalu deterministik dan tidak bergantung pada urutan sinkronisasi.
      'stockQty',
    ],
  },
  {
    name: 'Customer',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    fields: ['id', 'tenantId', 'name', 'phone', 'email', 'address', 'notes', 'isActive', 'createdAt', 'updatedAt'],
  },
  {
    name: 'CashSession',
    strategy: 'append',
    pk: 'id',
    // CashSession tidak punya createdAt/updatedAt — kolom waktunya adalah openedAt.
    timeField: 'openedAt',
    tenantScoped: true,
    fields: [
      'id', 'tenantId', 'userId', 'openingCash', 'closingCash', 'expectedCash', 'difference',
      'status', 'notes', 'openedAt', 'closedAt',
    ],
  },
  {
    name: 'Transaction',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    fields: [
      'id', 'tenantId', 'customerId', 'cashierId', 'cashSessionId', 'invoiceNumber',
      'subtotal', 'discountAmount', 'taxAmount', 'totalAmount', 'paidAmount', 'changeAmount',
      'paymentMethod', 'status', 'notes', 'voidReason', 'voidedAt', 'voidedById',
      'refundedAmount', 'refundReason', 'refundedAt', 'refundedById', 'createdAt', 'updatedAt',
    ],
  },
  {
    name: 'TransactionItem',
    strategy: 'append',
    pk: 'id',
    timeField: 'createdAt',
    // TIDAK punya tenantId — hanya punya transactionId. Cakupannya ikut transaksi.
    tenantScoped: false,
    parentEntity: 'Transaction',
    parentField: 'transactionId',
    fields: [
      'id', 'transactionId', 'catalogItemId', 'itemType', 'itemNameSnapshot', 'skuSnapshot',
      'quantity', 'unitPrice', 'subtotal', 'refundedQty', 'createdAt',
    ],
  },
  {
    name: 'InventoryMovement',
    strategy: 'append',
    pk: 'id',
    timeField: 'createdAt',
    tenantScoped: true,
    fields: [
      'id', 'tenantId', 'catalogItemId', 'transactionId', 'movementType', 'quantity',
      'note', 'createdAt',
    ],
  },
  {
    name: 'InvoiceTemplate',
    strategy: 'lww',
    pk: 'id',
    timeField: 'updatedAt',
    tenantScoped: true,
    fields: ['id', 'tenantId', 'name', 'config', 'isDefault', 'createdAt', 'updatedAt'],
  },
  {
    name: 'AuditLog',
    strategy: 'append',
    pk: 'id',
    timeField: 'createdAt',
    tenantScoped: true,
    fields: [
      'id', 'actorUserId', 'tenantId', 'action', 'resourceType', 'resourceId',
      'metadata', 'ipAddress', 'userAgent', 'createdAt',
    ],
  },
  {
    name: 'SystemSetting',
    strategy: 'lww',
    pk: 'key',
    timeField: 'updatedAt',
    tenantScoped: false,
    fields: ['key', 'value', 'updatedAt'],
  },
]

export const ENTITY_BY_NAME = new Map(ENTITIES.map((e) => [e.name, e]))

/** Entitas yang TIDAK pernah menyentuh cloud. */
export const NEVER_SYNCED = [
  'Session', // sesi milik perangkat
  'InvoiceCounter', // counter global cloud; perangkat pakai blok
  'Device', // dibuat saat perangkat sync pertama kali
  'InvoiceBlock', // bookkeeping cloud
  'SyncState', // bookkeeping perangkat
] as const

/**
 * Urutan push/pull. Parent SELALU lebih dulu dari child supaya foreign key
 * tidak pernah gagal. SQLite (dengan PRAGMA foreign_keys) dan PostgreSQL sama
 *-sama menolak insert anak sebelum induk ada.
 */
export const SYNC_ORDER: readonly EntityName[] = [
  'Tenant',
  'User',
  'Category',
  'CatalogItem',
  'Customer',
  'CashSession',
  'Transaction',
  'TransactionItem',
  'InventoryMovement',
  'InvoiceTemplate',
  'AuditLog',
  'SystemSetting',
]

/**
 * Kunci SystemSetting yang MILIK PERANGKAT dan tidak boleh pernah ikut sync.
 *
 * Bug yang pernah ada di sini: `invoice.block` ikut ter-push ke cloud, lalu
 * perangkat lain menariknya dan memakai blok nota milik perangkat pertama.
 * Akibatnya nomor INV-2026-000053 terbit di DUA perangkat sekaligus — persis
 * masalah yang harus dicegah oleh alokasi blok.
 *
 * Kunci yang diawali salah satu prefiks di bawah tidak pernah naik ke cloud
 * dan tidak pernah ditarik.
 */
export const DEVICE_LOCAL_SETTING_PREFIXES = ['sync.', 'device.', 'invoice.'] as const

export function isDeviceLocalSetting(key: string): boolean {
  return DEVICE_LOCAL_SETTING_PREFIXES.some((p) => key.startsWith(p))
}
