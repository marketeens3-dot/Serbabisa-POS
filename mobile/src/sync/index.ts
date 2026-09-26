/**
 * Mesin sinkronisasi untuk aplikasi HP.
 *
 * Alur satu siklus:
 *   1. PUSH — kirim antrean outbox ke server satu per satu, urut lama dulu.
 *   2. PULL — ambil data segar (katalog, pelanggan, transaksi terbaru).
 *
 * Urutan push-sebelum-pull itu penting: kalau pull dulu, data basi dari server
 * bisa menimpa pekerjaan kasir yang belum sempat naik.
 *
 * Kegagalan TIDAK pernah menghapus antrean. Entri yang gagal ditandai
 * `failed` supaya kasir bisa melihatnya dan memutuskan, bukan diam-diam
 * hilang.
 */
import { api } from '../api/client';
import { CONFIG, STORAGE_KEYS } from '../config';
import {
  getDb,
  getMeta,
  markOutboxDone,
  markOutboxFailed,
  pendingOutbox,
  retryFailedOutbox,
  setMeta,
  setMetaNumber,
  trimOutbox,
} from '../db';

const SYNC_LAST_AT = 'mobile.sync.lastAt';

export type SyncOutcome = {
  pushed: number;
  pulled: number;
  failed: number;
  dropped: number;
  /** Entri gagal yang dikembalikan ke antrean untuk dicoba lagi. */
  retried: number;
  error: string | null;
  offline: boolean;
  at: string;
};

/** Cooldown: jangan sync lebih sering dari ini, agar tidak memboroskan kuota. */
let lastAttemptAt = 0;
export function shouldSync(force = false): boolean {
  if (force) return true;
  return Date.now() - lastAttemptAt >= CONFIG.syncCooldownMs;
}

/**
 * Jalankan satu siklus sinkronisasi.
 *
 * Tidak pernah melempar exception: kegagalan dikembalikan di `error` supaya UI
 * bisa menampilkannya dengan tenang, bukan lewat crash.
 */
export async function syncNow(tenantId: string, force = false): Promise<SyncOutcome> {
  const at = new Date().toISOString();
  const outcome: SyncOutcome = {
    pushed: 0,
    pulled: 0,
    failed: 0,
    dropped: 0,
    retried: 0,
    error: null,
    offline: false,
    at,
  };

  if (!shouldSync(force)) return outcome;
  lastAttemptAt = Date.now();

  // Entri yang pernah gagal dicoba lagi — jaringan sering pulih sebentar lalu
  // putus lagi, dan menyerah permanen akan menghilangkan pekerjaan kasir.
  //
  // Hanya yang belum habis jatah percobaan. Galat jaringan tidak menambah
  // jatah (lihat markOutboxFailed), jadi penjualan yang menunggu berminggu-
  // minggu tetap dicoba setiap kali ada koneksi — dan yang ditolak server
  // berulang kali (mis. harga berubah) berhentidicoba supaya tidak membakar
  // kuota. Entri seperti itu tetap terlihat di Pengaturan.
  const revived = await retryFailedOutbox(CONFIG.maxOutboxAttempts);
  if (revived > 0) outcome.retried = revived;
  // ---------------------------------------------------------------- PUSH ---
  const queue = await pendingOutbox(50);
  for (const item of queue) {
    let parsed: { path: string; method: string; body?: unknown };
    try {
      parsed = JSON.parse(item.payload);
    } catch {
      // Payload rusak: tidak ada gunanya mengulang selamanya.
      await markOutboxFailed(item.id, 'Payload antrean rusak');
      outcome.failed++;
      continue;
    }

    const res = await api(parsed.path, {
      method: parsed.method as 'POST' | 'PATCH',
      body: parsed.body,
      timeoutMs: 20_000,
    });

    if (res.ok) {
      // Penjualan offline yang baru berhasil naik: ganti placeholder-nya dengan
      // nota asli (id + nomor nota dari server) supaya kasir tidak melihat
      // satu penjualan dua kali.
      //
      // URUTAN PENTING: adopsi harus SEBELUM entri antrean dihapus. Kalau
      // dibalik dan aplikasi tertutup di antaranya, placeholder `local_*`
      // menggantung selamanya sebagai "MENUNGGU SINKRONISASI" sementara nota
      // aslinya juga muncul dari pull — kasir melihat satu penjualan dua kali.
      // `adoptQueuedTransaction` bersifat idempoten, jadi mencoba ulang
      // setelah crash aman.
      if (item.kind === 'transaction') {
        const real = (res.data as { transaction?: { id: string; invoiceNumber: string } })
          ?.transaction;
        if (real?.id && real.invoiceNumber) {
          const local = await getDb().then(async (db) =>
            db.getFirstAsync<{ totalAmount: number; paidAmount: number }>(
              'SELECT totalAmount, paidAmount FROM cache_transaction WHERE id = ?',
              [item.id],
            ),
          );
          await adoptQueuedTransaction(item.id, {
            id: real.id,
            invoiceNumber: real.invoiceNumber,
            // Server adalah sumber kebenaran untuk total; nilai lokal hanya
            // dipakai kalau server tidak mengirimnya.
            totalAmount:
              (res.data as { transaction?: { totalAmount?: number } })?.transaction
                ?.totalAmount ?? local?.totalAmount ?? 0,
            paidAmount:
              (res.data as { transaction?: { paidAmount?: number } })?.transaction
                ?.paidAmount ?? local?.paidAmount ?? 0,
            status: 'COMPLETED',
          });
        }
      }

      await markOutboxDone(item.id);
      outcome.pushed++;
    } else {
      // Galat "server tak terjangkau" tidak dihitung sebagai percobaan gagal:
      // jaringan putus atau proxy sedang 502/503/504 bukan kesalahan entri.
      // Kalau ikut dihitung, penjualan yang menunggu berhari-hari akan habis
      // jatah percobaannya dan berhenti dicoba ulang tepat saat koneksi
      // finally pulih.
      await markOutboxFailed(item.id, `${res.error.code}: ${res.error.message}`, {
        countAttempt: !res.error.isUnreachable,
      });
      outcome.failed++;
      if (res.error.isUnreachable) {
        outcome.offline = true;
        // Tak terjangkau: berhenti di sini. Menyerang server yang tak
        // terjangkau hanya memperpanjang waktu tunggu kasir.
        break;
      }
    }
  }

  // Batas antrean: buang yang paling lama supaya HP tidak membengkak.
  outcome.dropped = await trimOutbox(CONFIG.maxOutboxItems);

  // ---------------------------------------------------------------- PULL ---
  if (!outcome.offline) {
    type BootstrapPayload = {
      serverTime: string;
      user: { id: string; email: string; fullName: string; role: 'SUPER_ADMIN' | 'USER' };
      tenant: { id: string } & Record<string, unknown>;
      categories: Array<{ id: string; name: string; isActive: boolean }>;
      products: Array<Record<string, unknown>>;
      customers: Array<{
        id: string;
        name: string;
        phone: string | null;
        address: string | null;
        isActive: boolean;
      }>;
      templates: Array<Record<string, unknown>>;
      transactions: Array<{
        id: string;
        invoiceNumber: string;
        totalAmount: number;
        paidAmount: number;
        changeAmount: number;
        status: string;
        createdAt: string;
        items: Array<{ id: string; name: string; sku: string | null; quantity: number; price: number }>;
      }>;
    };

    const res = await api<BootstrapPayload>('/api/sync/mobile/bootstrap', {
      timeoutMs: 45_000,
    });

    if (res.ok) {
      outcome.pulled = await writeBootstrap(res.data);
      outcome.at = res.data.serverTime ?? outcome.at;
    } else {
      outcome.error = res.error.message;
      outcome.offline = res.error.isUnreachable;
    }
  }

  await setMeta(SYNC_LAST_AT, outcome.at);
  await setMetaNumber('mobile.sync.pendingAtLastRun', outcome.pushed);
  return outcome;
}

/** Tulis hasil pull ke cache lokal. */
async function writeBootstrap(data: {
  tenant: Record<string, unknown>;
  categories: Array<{ id: string; name: string; isActive: boolean }>;
  products: Array<Record<string, unknown>>;
  customers: Array<{ id: string; name: string; phone: string | null; address: string | null; isActive: boolean }>;
  templates: Array<Record<string, unknown>>;
  transactions: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    status: string;
    createdAt: string;
    items: unknown;
  }>;
}): Promise<number> {
  const db = await getDb();
  const now = Date.now();
  let written = 0;

  const tenant = data.tenant as { id: string };
  const tenantId = tenant.id;

  await db.withTransactionAsync(async () => {
    // Tenant
    await db.runAsync(
      `INSERT INTO cache_tenant(id, json, syncedAt) VALUES(?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, syncedAt = excluded.syncedAt`,
      [tenantId, JSON.stringify(data.tenant), now],
    );
    written++;

    // Kategori
    for (const c of data.categories) {
      await db.runAsync(
        `INSERT INTO cache_category(id, tenantId, name, isActive, json, syncedAt)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, isActive = excluded.isActive,
           json = excluded.json, syncedAt = excluded.syncedAt`,
        [c.id, tenantId, c.name, c.isActive ? 1 : 0, JSON.stringify(c), now],
      );
      written++;
    }

    // Produk.
    //
    // `stockQty` ditulis APA ADANYA dari server. Angka yang ditampilkan ke
    // kasir dihitung sebagai `stockQty - penjualanYangMasihAntre`
    // (lihat effectiveStock() di db/repo.ts).
    //
    // Versi sebelumnya memakai MAX(stok_server, stok_lokal) dengan alasan
    // "jangan menimpa penjualan perangkat lain" — tapi akibatnya stok tidak
    // PERNAH turun, sehingga penjualan dari perangkat lain tak akan terlihat.
    for (const p of data.products as Array<{
      id: string; type: string; name: string; sku: string | null; barcode: string | null;
      categoryId: string | null; categoryName: string | null; costPrice: number;
      sellingPrice: number; stockQty: number; minStockQty: number; unit: string;
      isActive: boolean; tenantId: string;
    }>) {
      await db.runAsync(
        `INSERT INTO cache_product(id, tenantId, type, name, sku, barcode, categoryId, categoryName,
                                   sellingPrice, costPrice, stockQty, minStockQty, unit, isActive, json, syncedAt)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type, name = excluded.name, sku = excluded.sku,
           barcode = excluded.barcode, categoryId = excluded.categoryId,
           categoryName = excluded.categoryName, sellingPrice = excluded.sellingPrice,
           costPrice = excluded.costPrice, stockQty = excluded.stockQty,
           minStockQty = excluded.minStockQty, unit = excluded.unit,
           isActive = excluded.isActive, json = excluded.json, syncedAt = excluded.syncedAt`,
        [
          p.id,
          p.tenantId ?? tenantId,
          p.type,
          p.name,
          p.sku,
          p.barcode,
          p.categoryId,
          p.categoryName,
          p.sellingPrice,
          p.costPrice,
          p.stockQty,
          p.minStockQty,
          p.unit,
          p.isActive ? 1 : 0,
          JSON.stringify(p),
          now,
        ],
      );
      written++;
    }

    // Pelanggan
    for (const c of data.customers) {
      await db.runAsync(
        `INSERT INTO cache_customer(id, tenantId, name, phone, address, isActive, json, syncedAt)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, phone = excluded.phone, address = excluded.address,
           isActive = excluded.isActive, json = excluded.json, syncedAt = excluded.syncedAt`,
        [c.id, tenantId, c.name, c.phone, c.address, c.isActive ? 1 : 0, JSON.stringify(c), now],
      );
      written++;
    }

    // Template nota
    for (const t of data.templates as Array<{
      id: string; name: string; config: string; isDefault: boolean; tenantId: string;
    }>) {
      await db.runAsync(
        `INSERT INTO cache_invoice_template(id, tenantId, isDefault, json, syncedAt)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           isDefault = excluded.isDefault, json = excluded.json, syncedAt = excluded.syncedAt`,
        [t.id, tenantId, t.isDefault ? 1 : 0, JSON.stringify(t), now],
      );
      written++;
    }

    // Transaksi dari server.
    //
    // Baris lokal yang masih antre (id diawali `local_`) tidak akan menimpa
    // apa pun karena id-nya berbeda. Baris placeholder-nya sendiri sudah
    // diubah menjadi nota asli tepat setelah push-nya berhasil — lihat
    // adoptQueuedTransaction() — sehingga kasir tidak pernah melihat satu
    // penjualan dua kali.
    for (const t of data.transactions) {
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
          t.id,
          tenantId,
          t.invoiceNumber,
          t.totalAmount,
          t.paidAmount,
          t.status,
          Date.parse(t.createdAt),
          JSON.stringify(t),
          now,
        ],
      );
      written++;
    }
  });

  return written;
}

/**
 * Ubah baris placeholder `local_*` menjadi nota asli setelah berhasil di-push.
 *
 * Ini yang mencegah nota kembar: tanpa langkah ini kasir melihat
 * "MENUNGGU SINKRONISASI", lalu setelah sync nomor nota yang sama muncul lagi
 * sebagai catatan terpisah — seolah ada dua penjualan.
 *
 * `id` bisa langsung di-UPDATE di SQLite, jadi tidak perlu pola
 * hapus-tulis yang rawan kehilangan data kalau aplikasi tertutup di tengah.
 */
async function adoptQueuedTransaction(
  localId: string,
  real: { id: string; invoiceNumber: string; totalAmount: number; paidAmount: number; status: string },
): Promise<void> {
  const db = await getDb();

  const existing = await db.getFirstAsync<{ json: string }>(
    'SELECT json FROM cache_transaction WHERE id = ?',
    [localId],
  );
  if (!existing) return;

  // Kalau nota aslinya sudah ada di cache (mis. hasil pull sebelumnya), baris
  // itu yang otoritatif — placeholder cukup dihapus.
  const dupe = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM cache_transaction WHERE id = ?',
    [real.id],
  );
  if (dupe) {
    await db.runAsync('DELETE FROM cache_transaction WHERE id = ?', [localId]);
    return;
  }

  // Pertahankan `items` hasil checkout offline: rincian nota harus tetap
  // terbaca di HP walau server hanya mengirim data ringkasan.
  let items: unknown = [];
  try {
    items = (JSON.parse(existing.json) as { items?: unknown }).items ?? [];
  } catch {
    items = [];
  }

  await db.runAsync(
    `UPDATE cache_transaction
        SET id = ?, invoiceNumber = ?, totalAmount = ?, paidAmount = ?,
            status = ?, json = ?, syncedAt = ?
      WHERE id = ?`,
    [
      real.id,
      real.invoiceNumber,
      real.totalAmount,
      real.paidAmount,
      real.status,
      JSON.stringify({ ...real, items }),
      Date.now(),
      localId,
    ],
  );
}

/** Kapan sinkronisasi terakhir (ISO) — null bila belum pernah. */
export async function lastSyncAt(): Promise<string | null> {
  return getMeta(SYNC_LAST_AT);
}

export { STORAGE_KEYS };
