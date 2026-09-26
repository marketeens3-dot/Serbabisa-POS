/**
 * Logika checkout.
 *
 * Ini jalur paling kritis di aplikasi: uang dan stok. Karena itu perhitungannya
 * sengaja DIHITUNG ULANG di perangkat, bukan memakai angka dari server — kalau
 * angkanya salah, kasir yang menanggung, dan kalau device ini yang salah maka
 * server akan menolak dengan pesan yang membingungkan.
 *
 * Aturan yang dipegang:
 *  - server tetap menjadi sumber kebenaran; perangkat hanya menyiapkan
 *  - pembayaran harus >= total (kembalian negatif berarti ada kesalahan input)
 *  - stok diperiksa sebelum mengantar ke antrean, tapi PENJUALAN offline tetap
 *    diizinkan sampai stok nol — menolak jualan karena stok habis saat offline
 *    akan lebih merusak daripada oversell kecil yang bisa direkonsiliasi
 */
import { api } from '../api/client';
import { enqueue } from '../db';
import { applyLocalStockDelta, saveLocalTransaction } from '../db/repo';
import type { CartLine } from '../store';

export type CheckoutInput = {
  tenantId: string;
  lines: CartLine[];
  /** Idempotency key — mengunci agar tombol yang ditekan dua kali tidak
   *  menghasilkan dua nota. Dibuat sekali per attempt. */
  idempotencyKey: string;
  customerId?: string | null;
  paidAmount: number;
  paymentMethod: 'CASH' | 'QRIS' | 'TRANSFER' | 'OTHER';
  notes?: string;
  cashierName: string;
};

export type CheckoutResult =
  | { ok: true; invoiceNumber: string; transactionId: string; queued: boolean }
  | { ok: false; message: string; code: string };

/** Nominal uang selalu bulat rupiah; qty boleh 3 desimal. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function computeTotals(lines: CartLine[], paidAmount: number) {
  // Pembulatan per baris, bukan di akhir: supaya total yang tampil di layar
  // persis sama dengan yang disimpan, tanpa selisih pembulatan.
  const subtotal = lines.reduce((sum, l) => sum + Math.round(l.price * round3(l.qty)), 0);
  return {
    subtotal,
    total: subtotal,
    change: Math.round(paidAmount) - subtotal,
  };
}

/** Syarat minimum agar checkout boleh dicoba. */
export function validateCheckout(
  lines: CartLine[],
  paidAmount: number,
  paymentMethod: string,
): string | null {
  if (lines.length === 0) return 'Keranjang masih kosong.';
  const { total } = computeTotals(lines, paidAmount);
  if (Math.round(paidAmount) < total) return 'Uang pembayaran kurang dari total.';
  if (paymentMethod === 'CASH' && paidAmount <= 0) return 'Masukkan jumlah uang dibayar.';
  if (paymentMethod !== 'CASH' && paidAmount !== total) {
    return 'Untuk non-tunai, jumlah dibayar harus sama dengan total.';
  }
  return null;
}

/** Kodekan baris keranjang menjadi format yang dipakai API server. */
function toApiItems(lines: CartLine[]) {
  return lines.map((l) => ({ catalogItemId: l.catalogItemId, quantity: round3(l.qty) }));
}

/**
 * Jalankan checkout.
 *
 * Dua jalur, dengan hasil yang beide'menylam' berhasil ke kasir:
 *   ONLINE  → terkirim ke server, nomor nota asli dari server
 *   OFFLINE → masuk antrean lokal, nomor nota provisional
 *
 * Nomor nota provisional sengaja diberi akhiran "OFFLINE" agar tidak pernah
 * disalahartikan sebagai nomor resmi. Nomor sebenarnya diberikan server
 * setelah sinkronisasi.
 */
export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const problem = validateCheckout(input.lines, input.paidAmount, input.paymentMethod);
  if (problem) return { ok: false, message: problem, code: 'VALIDATION' };

  const totals = computeTotals(input.lines, input.paidAmount);
  const body = {
    items: toApiItems(input.lines),
    customerId: input.customerId ?? null,
    paymentMethod: input.paymentMethod,
    paidAmount: Math.round(input.paidAmount),
    notes: input.notes?.trim() || null,
    idempotencyKey: input.idempotencyKey,
  };

  const res = await api<{ transaction: { id: string; invoiceNumber: string } }>(
    '/api/transactions',
    { method: 'POST', body, timeoutMs: 25_000 },
  );

  if (res.ok) {
    const tx = res.data.transaction;
    await saveLocalTransaction(input.tenantId, {
      id: tx.id,
      invoiceNumber: tx.invoiceNumber,
      // `totals.total` — bukan `paidAmount - totals.change`. Nilai latter
      // memang sama sekarang, hanya karena `change` didefinisikan sebagai
      // `paid - subtotal`: begitu ada biaya/kembalian/diskon, pengurangan
      // ini diam-diam jadi salah, dan `totals` di atas justru tak terpakai.
      totalAmount: totals.total,
      paidAmount: Math.round(input.paidAmount),
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
      items: input.lines,
      offline: false,
    });
    return { ok: true, invoiceNumber: tx.invoiceNumber, transactionId: tx.id, queued: false };
  }

  // Server tak terjangkau (tidak ada jaringan, atau 502/503/504 dari proxy)
  // → antre, jangan gagalkan kasir. Uang pelanggan sudah diterima; penjualan
  // yang hilang berarti nota hilang tanpa jejak. 4xx lain (stok kurang,
  // validasi, lockout) tetap ditampilkan apa adanya karena itu penolakan
  // yang benar.
  if (res.error.isUnreachable) {
    return queueOffline(input, body);
  }

  // Galat lain (stok kurang, validasi, lockout) → tampilkan apa adanya.
  return { ok: false, message: res.error.message, code: res.error.code };
}

/** Simpan penjualan ke antrean lokal saat server tidak terjangkau. */
async function queueOffline(
  input: CheckoutInput,
  body: Record<string, unknown>,
): Promise<CheckoutResult> {
  const totals = computeTotals(input.lines, input.paidAmount);
  // Id lokal sementara; invoiceNumber masih kosong sampai server memberi tahu.
  const localId = `local_${input.idempotencyKey}`;

  // `clientTotal` sengaja hanya disertakan di jalur antrean.
  //
  // Kenapa tidak di jalur online: kalau cache harga di perangkat basi (admin
  // baru mengubah harga, perangkat belum sync), mengirim clientTotal akan
  // membuat server MENOLAK checkout yang sah, padahal pembayaran pelanggan
  // sudah wajar. Untuk penjualan online, angka server yang dipakai; tidak ada
  // yang perlu direkonsiliasi.
  //
  // Untuk penjualan offline situasinya berbeda: pelanggan SUDAH membayar
  // berdasarkan harga di layar. Kalau harga berubah selama perangkat offline,
  // transaksi tidak boleh diam-diam disimpan dengan angka lain. `clientTotal`
  // membuat server menolak dengan kode PRICE_CHANGED, yang bisa ditindaklanjuti
  // manusia (catat manual) alih-alih menghasilkan catatan keuangan yang salah.
  const payload = {
    path: '/api/transactions',
    method: 'POST',
    body: { ...body, clientTotal: totals.total },
  };

  await enqueue('transaction', payload, localId);

  // Catat di cache transaksi supaya langsung muncul di Riwayat.
  await saveLocalTransaction(input.tenantId, {
    id: localId,
    invoiceNumber: 'MENUNGGU SINKRONISASI',
    totalAmount: totals.total,
    paidAmount: Math.round(input.paidAmount),
    status: 'QUEUED',
    createdAt: new Date().toISOString(),
    items: input.lines,
    offline: true,
  });

  return { ok: true, invoiceNumber: 'MENUNGGU SINKRONISASI', transactionId: localId, queued: true };
}

