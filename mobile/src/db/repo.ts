/**
 * Pembacaan data dari cache lokal.
 *
 * Semua layar membaca dari sini, bukan langsung ke server. Dengan begitu UI
 * selalu responsif dan tetap berfungsi tanpa internet.
 *
 * Catatan: filter pencarian dibuat dengan parameter (?), tidak ada string yang
 * dirangkai — ini yang membuat aman dari SQL injection meski query disusun
 * dinamis sesuai kata kunci.
 */
import { getDb } from './index';
import { CONFIG } from '../config';

export type Category = {
  id: string;
  name: string;
  isActive: number;
};

export type Product = {
  id: string;
  tenantId: string;
  type: 'PRODUCT' | 'SERVICE';
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sellingPrice: number;
  costPrice: number;
  stockQty: number;
  minStockQty: number;
  unit: string;
  isActive: number;
};

export type Customer = {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  address: string | null;
  isActive: number;
};

export type CachedTransaction = {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  createdAt: number;
  json: string;
};

export type ProductFilter = {
  tenantId: string;
  search?: string;
  categoryId?: string | null;
  type?: 'PRODUCT' | 'SERVICE' | null;
  /** Tampilkan hanya stok menipis / habis. */
  lowStockOnly?: boolean;
  limit?: number;
};

/** Escape wildcard LIKE supaya '%' dari user tidak jadi operator. */
function escapeLike(term: string): string {
  return term.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

export async function listProducts(f: ProductFilter): Promise<Product[]> {
  const db = await getDb();
  const where: string[] = ['tenantId = ?'];
  const params: (string | number)[] = [f.tenantId];

  if (f.search?.trim()) {
    const term = `%${escapeLike(f.search.trim())}%`;
    where.push('(name LIKE ? ESCAPE \'\\\' OR IFNULL(sku, \'\') LIKE ? ESCAPE \'\\\' OR IFNULL(barcode, \'\') LIKE ? ESCAPE \'\\\')');
    params.push(term, term, term);
  }
  if (f.categoryId) {
    where.push('categoryId = ?');
    params.push(f.categoryId);
  }
  if (f.type) {
    where.push('type = ?');
    params.push(f.type);
  }
  if (f.lowStockOnly) {
    where.push('type = ? AND stockQty <= minStockQty');
    params.push('PRODUCT');
  }

  const limit = Math.min(f.limit ?? CONFIG.pageSize, 200);
  return db.getAllAsync<Product>(
    `SELECT id, tenantId, type, name, sku, barcode, categoryId, categoryName,
            sellingPrice, costPrice, stockQty, minStockQty, unit, isActive
       FROM cache_product
      WHERE ${where.join(' AND ')}
      ORDER BY name COLLATE NOCASE ASC
      LIMIT ?`,
    [...params, limit],
  );
}

/** Cari persis satu produk berdasarkan barcode — untuk pemindai. */
export async function findByBarcode(tenantId: string, barcode: string): Promise<Product | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Product>(
    `SELECT id, tenantId, type, name, sku, barcode, categoryId, categoryName,
            sellingPrice, costPrice, stockQty, minStockQty, unit, isActive
       FROM cache_product
      WHERE tenantId = ? AND barcode = ? AND isActive = 1
      LIMIT 1`,
    [tenantId, barcode],
  );
  return row ?? null;
}

export async function getProduct(tenantId: string, id: string): Promise<Product | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Product>(
    `SELECT id, tenantId, type, name, sku, barcode, categoryId, categoryName,
            sellingPrice, costPrice, stockQty, minStockQty, unit, isActive
       FROM cache_product WHERE tenantId = ? AND id = ?`,
    [tenantId, id],
  );
  return row ?? null;
}

export async function listCategories(tenantId: string): Promise<Category[]> {
  const db = await getDb();
  return db.getAllAsync<Category>(
    'SELECT id, name, isActive FROM cache_category WHERE tenantId = ? ORDER BY name COLLATE NOCASE ASC',
    [tenantId],
  );
}

export async function listCustomers(
  tenantId: string,
  search?: string,
  limit = 50,
): Promise<Customer[]> {
  const db = await getDb();
  if (search?.trim()) {
    const term = `%${escapeLike(search.trim())}%`;
    return db.getAllAsync<Customer>(
      `SELECT id, tenantId, name, phone, address, isActive
         FROM cache_customer
        WHERE tenantId = ? AND (name LIKE ? ESCAPE '\\' OR IFNULL(phone,'') LIKE ? ESCAPE '\\')
        ORDER BY name COLLATE NOCASE ASC LIMIT ?`,
      [tenantId, term, term, limit],
    );
  }
  return db.getAllAsync<Customer>(
    `SELECT id, tenantId, name, phone, address, isActive
       FROM cache_customer WHERE tenantId = ? ORDER BY name COLLATE NOCASE ASC LIMIT ?`,
    [tenantId, limit],
  );
}

/**
 * Stok EFFECTIF untuk ditampilkan ke kasir.
 *
 * `product.stockQty` adalah angka terakhir dari server. Penjualan yang dibuat di
 * perangkat ini dan belum sempat naik (masih di antrean outbox) BELUM
 * terhitung di sana. Kalau angka itu langsung ditampilkan, kasir akan melihat
 * stok yang lebih besar dari kenyataan dan bisa menjual barang yang habis.
 *
 * Jadi: `stokEfektif = stokServer − penjualanYangMasihAntre`.
 *
 *Begitu penjualan berhasil di-push, server sudah mengetahuinya dan
 * `stokServer` naik sendiri — jadi pengurangan ini otomatis hilang dengan
 * sendirinya tanpa perlu ada mekanisme "kembalikan" yang rawan lupa.
 */
export async function effectiveStock(
  products: Array<Pick<Product, 'id' | 'stockQty'>>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const p of products) result.set(p.id, p.stockQty);
  if (products.length === 0) return result;

  const pending = await pendingSalesByItem();
  for (const [id, delta] of pending) {
    const current = result.get(id);
    if (current !== undefined) result.set(id, round3(current - delta));
  }
  return result;
}

/**
 * Jumlah per item dari transaksi yang masih di antrean outbox.
 *
 * Membaca payload outbox secara langsung. Bucket "pending" dan "failed" sama
 *-sama dihitung: penjualan yang gagal push TETAP penjualan yang sudah terjadi
 * di toko, jadi angkanya harus tercermin di layar walau belum sampai ke server.
 */
export async function pendingSalesByItem(): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ payload: string }>(
    "SELECT payload FROM outbox WHERE kind = 'transaction' AND status IN ('pending','failed')",
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.payload) as {
        body?: { items?: Array<{ catalogItemId: string; quantity: number }> };
      };
      for (const it of parsed.body?.items ?? []) {
        const q = Number(it.quantity) || 0;
        if (q > 0) map.set(it.catalogItemId, (map.get(it.catalogItemId) ?? 0) + q);
      }
    } catch {
      // Payload rusak diabaikan; sync akan menandainya failed.
    }
  }
  return map;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function listTransactions(
  tenantId: string,
  limit = 50,
): Promise<CachedTransaction[]> {
  const db = await getDb();
  return db.getAllAsync<CachedTransaction>(
    `SELECT id, tenantId, invoiceNumber, totalAmount, paidAmount, status, createdAt, json
       FROM cache_transaction
      WHERE tenantId = ?
      ORDER BY createdAt DESC LIMIT ?`,
    [tenantId, limit],
  );
}

export async function getTransaction(id: string): Promise<CachedTransaction | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CachedTransaction>(
    'SELECT * FROM cache_transaction WHERE id = ?',
    [id],
  );
  return row ?? null;
}

/** Simpan transaksi lokal (dipakai setelah checkout sukses ATAU saat offline). */
export async function saveLocalTransaction(
  tenantId: string,
  tx: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
    createdAt: string;
    [k: string]: unknown;
  },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO cache_transaction(id, tenantId, invoiceNumber, totalAmount, paidAmount, status, createdAt, json, syncedAt)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       invoiceNumber = excluded.invoiceNumber,
       totalAmount   = excluded.totalAmount,
       paidAmount    = excluded.paidAmount,
       status        = excluded.status,
       json          = excluded.json,
       syncedAt      = excluded.syncedAt`,
    [
      tx.id,
      tenantId,
      tx.invoiceNumber,
      tx.totalAmount,
      tx.paidAmount,
      tx.status,
      Date.parse(tx.createdAt),
      JSON.stringify(tx),
      Date.now(),
    ],
  );
}

/** Kurangi stok lokal setelah penjualan (agar angka di layar langsung benar). */
export async function applyLocalStockDelta(
  tenantId: string,
  deltas: Array<{ catalogItemId: string; delta: number }>,
): Promise<void> {
  if (deltas.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const d of deltas) {
      // `stockQty` dihitung dari nilai sekarang + delta, dan dibulatkan ke 3
      // desimal supaya tidak menumpuk galat floating point.
      await db.runAsync(
        `UPDATE cache_product
            SET stockQty = ROUND(MAX(0, stockQty + ?), 3)
          WHERE tenantId = ? AND id = ?`,
        [d.delta, tenantId, d.catalogItemId],
      );
    }
  });
}

export async function stockCount(tenantId: string): Promise<{ out: number; low: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ out: number; low: number }>(
    `SELECT
       SUM(CASE WHEN type = 'PRODUCT' AND stockQty <= 0 THEN 1 ELSE 0 END) AS out,
       SUM(CASE WHEN type = 'PRODUCT' AND stockQty > 0 AND stockQty <= minStockQty THEN 1 ELSE 0 END) AS low
     FROM cache_product WHERE tenantId = ? AND isActive = 1`,
    [tenantId],
  );
  return { out: row?.out ?? 0, low: row?.low ?? 0 };
}
