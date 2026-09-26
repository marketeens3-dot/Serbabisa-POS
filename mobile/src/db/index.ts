/**
 * Lapisan database lokal (SQLite via expo-sqlite).
 *
 * Aplikasi HP ini local-first, sama seperti versi desktop: kasir harus tetap
 * bisa berjualan tanpa internet, dan pekerjaan baru ikut tersimpan di perangkat
 * sampai ada koneksi.
 *
 * Tiga kelompok tabel:
 *   cache_*  → salinan baca dari server (katalog, pelanggan, produk…)
 *   meta     → konfigurasi perangkat (server URL, id perangkat, kursor sync)
 *   outbox   → antrean perubahan lokal yang belum sempat naik ke server
 *
 * Seluruh query memakai parameter (?), tidak ada string yang dirangkai dari
 * input pengguna.
 */
import * as SQLite from 'expo-sqlite';
import { STORAGE_KEYS } from '../config';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const SCHEMA_VERSION = 1;

/**
 * Skema lokal.
 *
 * Sengaja dibuat MINIMAL: hanya kolom yang benar-benar dipakai layar HP.
 * Copy-on-write lewat JSON dipakai untuk data yang bentuknya berubah-ubah
 * (mis. template nota), sehingga tidak perlu migrasi tiap kali backend
 * menambah kolom.
 */
const MIGRATIONS: string[][] = [
  // v1
  [
    `CREATE TABLE IF NOT EXISTS meta (
       key   TEXT PRIMARY KEY NOT NULL,
       value TEXT
     );`,
    `CREATE TABLE IF NOT EXISTS cache_tenant (
       id           TEXT PRIMARY KEY NOT NULL,
       json         TEXT NOT NULL,
       syncedAt     INTEGER NOT NULL
     );`,
    `CREATE TABLE IF NOT EXISTS cache_user (
       id           TEXT PRIMARY KEY NOT NULL,
       tenantId     TEXT,
       email        TEXT,
       fullName     TEXT,
       role         TEXT,
       status       TEXT,
       json         TEXT NOT NULL,
       syncedAt     INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_user_tenant ON cache_user(tenantId);`,
    `CREATE TABLE IF NOT EXISTS cache_category (
       id           TEXT PRIMARY KEY NOT NULL,
       tenantId     TEXT NOT NULL,
       name         TEXT NOT NULL,
       isActive     INTEGER NOT NULL DEFAULT 1,
       json         TEXT NOT NULL,
       syncedAt     INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_category_tenant ON cache_category(tenantId);`,
    `CREATE TABLE IF NOT EXISTS cache_product (
       id           TEXT PRIMARY KEY NOT NULL,
       tenantId     TEXT NOT NULL,
       type         TEXT NOT NULL,
       name         TEXT NOT NULL,
       sku          TEXT,
       barcode      TEXT,
       categoryId   TEXT,
       categoryName TEXT,
       sellingPrice INTEGER NOT NULL DEFAULT 0,
       costPrice    INTEGER NOT NULL DEFAULT 0,
       stockQty     REAL NOT NULL DEFAULT 0,
       minStockQty  REAL NOT NULL DEFAULT 0,
       unit         TEXT,
       isActive     INTEGER NOT NULL DEFAULT 1,
       json         TEXT NOT NULL,
       syncedAt     INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_product_tenant ON cache_product(tenantId);`,
    `CREATE INDEX IF NOT EXISTS idx_cache_product_name ON cache_product(name);`,
    `CREATE INDEX IF NOT EXISTS idx_cache_product_barcode ON cache_product(barcode);`,
    `CREATE TABLE IF NOT EXISTS cache_customer (
       id           TEXT PRIMARY KEY NOT NULL,
       tenantId     TEXT NOT NULL,
       name         TEXT NOT NULL,
       phone        TEXT,
       address      TEXT,
       isActive     INTEGER NOT NULL DEFAULT 1,
       json         TEXT NOT NULL,
       syncedAt     INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_customer_tenant ON cache_customer(tenantId);`,
    `CREATE TABLE IF NOT EXISTS cache_transaction (
       id            TEXT PRIMARY KEY NOT NULL,
       tenantId      TEXT NOT NULL,
       invoiceNumber TEXT NOT NULL,
       totalAmount   INTEGER NOT NULL DEFAULT 0,
       paidAmount    INTEGER NOT NULL DEFAULT 0,
       status        TEXT NOT NULL DEFAULT 'COMPLETED',
       createdAt     INTEGER NOT NULL,
       json          TEXT NOT NULL,
       syncedAt      INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_cache_tx_created ON cache_transaction(tenantId, createdAt DESC);`,
    `CREATE TABLE IF NOT EXISTS cache_invoice_template (
       id       TEXT PRIMARY KEY NOT NULL,
       tenantId TEXT NOT NULL,
       isDefault INTEGER NOT NULL DEFAULT 0,
       json     TEXT NOT NULL,
       syncedAt INTEGER NOT NULL
     );`,
    // Antrean perubahan lokal yang belum naik ke server.
    `CREATE TABLE IF NOT EXISTS outbox (
       id         TEXT PRIMARY KEY NOT NULL,
       kind       TEXT NOT NULL,
       payload    TEXT NOT NULL,
       status     TEXT NOT NULL DEFAULT 'pending',
       attempts   INTEGER NOT NULL DEFAULT 0,
       lastError  TEXT,
       createdAt  INTEGER NOT NULL,
       updatedAt  INTEGER NOT NULL
     );`,
    `CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status, createdAt);`,
  ],
];

/** Buka (dan migrasi) database. Dipanggil sekali, hasilnya di-cache. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('serbabisa.db');
      await migrate(db);
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ v: number | null }>('PRAGMA user_version');
  let version = row?.v ?? 0;

  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      for (const stmt of MIGRATIONS[v]) {
        await db.execAsync(stmt);
      }
    });
    version = v + 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

/** Hapus semua data (dipakai saat logout atau ganti server). */
export async function resetDb(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of [
      'cache_tenant',
      'cache_user',
      'cache_category',
      'cache_product',
      'cache_customer',
      'cache_transaction',
      'cache_invoice_template',
      'outbox',
      'meta',
    ]) {
      await db.runAsync(`DELETE FROM ${t};`);
    }
  });
}

// ---------------------------------------------------------------- META ----

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

export async function getMetaNumber(key: string, fallback: number): Promise<number> {
  const raw = await getMeta(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function setMetaNumber(key: string, value: number): Promise<void> {
  await setMeta(key, String(value));
}

// ------------------------------------------------------------- OUTBOX ----

export type OutboxItem = {
  id: string;
  kind: string;
  payload: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
};

export async function enqueue(kind: string, payload: unknown, id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO outbox(id, kind, payload, status, attempts, createdAt, updatedAt)
     VALUES(?, ?, ?, 'pending', 0, ?, ?)`,
    [id, kind, JSON.stringify(payload), now, now],
  );
}

export async function pendingOutbox(limit = 50): Promise<OutboxItem[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxItem>(
    `SELECT * FROM outbox WHERE status = 'pending' ORDER BY createdAt ASC LIMIT ?`,
    [limit],
  );
}

export async function outboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status = 'pending'",
  );
  return row?.c ?? 0;
}

/**
 * Entri antrean yang sudah dicoba tapi GAGAL.
 *
 * Ini bukan sekadar internal: penjualan offline yang gagal naik berarti uang
 * sudah diterima pelanggan tapi belum tercatat di server. Kalau tidak
 * ditampilkan, kasir mengira transactinya aman padahal tidak. Owner toko
 * harus melihat daftar ini dan mengambil tindakan.
 */
export async function failedOutbox(): Promise<OutboxItem[]> {
  const db = await getDb();
  return db.getAllAsync<OutboxItem>(
    "SELECT * FROM outbox WHERE status = 'failed' ORDER BY createdAt ASC",
  );
}

export async function failedOutboxCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM outbox WHERE status = 'failed'",
  );
  return row?.c ?? 0;
}

export async function markOutboxDone(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM outbox WHERE id = ?", [id]);
}

/**
 * Tandai entri gagal, TANPA menghapus.
 *
 * `countAttempt` hanya benar untuk galat dari server (validasi, stok kurang,
 * harga berubah). Galat jaringan harus dikirim dengan `false`: jaringan yang
 * putus bukan kesalahan entri, dan menghitungnya akan membuat penjualan yang
 * menunggu berhari-hari kehabisan jatah percobaan tepat saat koneksi pulih.
 */
export async function markOutboxFailed(
  id: string,
  error: string,
  options: { countAttempt?: boolean } = {},
): Promise<void> {
  const db = await getDb();
  const count = options.countAttempt === false ? 0 : 1;
  await db.runAsync(
    `UPDATE outbox
        SET status = 'failed',
            attempts = attempts + ?,
            lastError = ?,
            updatedAt = ?
      WHERE id = ?`,
    [count, error.slice(0, 500), Date.now(), id],
  );
}

/**
 * Kembalikan entri gagal ke antrean untuk dicoba lagi.
 *
 * Hanya yang belum habis jatah percobaan. Entri yang sudah ditolak server
 * berkali-kali (mis. `PRICE_CHANGED`) tidak dicoba lagi otomatis -- membakar
 * kuota dan menunda entri lain. Entri seperti itu tetap tersimpan dan
 * terlihat di Pengaturan, jadi tidak hilang diam-diam.
 */
export async function retryFailedOutbox(maxAttempts: number): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    "UPDATE outbox SET status = 'pending' WHERE status = 'failed' AND attempts < ?",
    [maxAttempts],
  );
  return res.changes;
}

/**
 * Buang entri tertua kalau antrean melebihi batas.
 *
 * Skenario nyata: kasir memakai HP berbulan-bulan tanpa pernah online. Tanpa
 * batas, database membengkak dan HP melambat. Membuang entri LAMA lebih baik
 * daripada membekukan aplikasi — dan nilainya dikembalikan supaya UI bisa
 * memberi tahu kasir.
 */
export async function trimOutbox(maxItems: number): Promise<number> {
  const db = await getDb();
  const total = await outboxCount();
  if (total <= maxItems) return 0;
  const excess = total - maxItems;
  const res = await db.runAsync(
    `DELETE FROM outbox WHERE id IN (
       SELECT id FROM outbox ORDER BY createdAt ASC LIMIT ?
     )`,
    [excess],
  );
  return res.changes;
}

export { SQLite };
export { STORAGE_KEYS };
