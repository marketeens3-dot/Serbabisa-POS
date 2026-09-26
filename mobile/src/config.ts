/**
 * Konfigurasi runtime aplikasi mobile.
 *
 * Berbeda dengan desktop, aplikasi HP tidak tahu address server desde awal.
 * Alasananya:
 *   - server bisa di-host sendiri (VPS / on-premise) dan berbeda tiap toko
 *   - tidak boleh ada satu URL global yang jadi,andal untuk semua toko
 *
 * Jadi alamat server disimpan per perangkat dan bisa diganti kapan saja dari
 * layar Pengaturan, TIDAK dikompilasi ke dalam binary. Default dipakai hanya
 * untuk pengembangan lokal.
 *
 * `EXPO_PUBLIC_*` di-inline oleh Metro saat build, jadi nilainya ikut ter-bake
 * ke bundle — karena itu TIDAK boleh dipakai untuk rahasia.
 */

/**
 * Server default untuk pengembangan.
 *
 * - Android emulator: 10.0.2.2 = alias host loopback mesin pengembang
 * - iOS simulator / device: localhost atau IP LAN
 */
function defaultServerUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_URL;
  if (fromEnv) return stripTrailingSlash(fromEnv);
  if (process.env.EXPO_OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export const CONFIG = {
  defaultServerUrl: defaultServerUrl(),

  /**
   * Batas jumlah entri antrean offline.
   *
   * Batas ini penting untuk perangkat yang dipakai berhari-hari tanpa
   * sinkron: database HP tidak boleh tumbuh tanpa batas. Setelah tercapai,
   * entri tertua dibuang (dan diberi tahu lewat `droppedCount`) supaya
   * kasir tetap bisa berjualan alih-alih aplikasi berhenti total.
   */
  maxOutboxItems: 500,

  /**
   * Jatah percobaan untuk entri yang ditolak server.
   *
   * Galat jaringan TIDAK dihitung terhadap jatah ini (lihat
   * `markOutboxFailed`). Setelah jatah habis, entri berhenti dicoba otomatis
   * dan tampil di Pengaturan sebagai "Perlu tindakan" -- karena entri seperti
   * itu (mis. harga berubah saat offline) memang butuh manusia, bukan
   * percobaan berulang yang tidak akan pernah berhasil.
   */
  maxOutboxAttempts: 5,

  /** Batas baris untuk satu halaman daftar. */
  pageSize: 50,

  /** Jeda minimum antar percobaan sinkron otomatis (ms). */
  syncCooldownMs: 30_000,

  /** Umur data lokal sebelum dianggap perlu disegarkan (ms). */
  staleAfterMs: 10 * 60_000,
} as const;

/** Nama tabel/kunci yang dipakai lapisan database. */
export const STORAGE_KEYS = {
  serverUrl: 'serbabisa.serverUrl',
  sessionToken: 'serbabisa.sessionToken',
  deviceId: 'serbabisa.deviceId',
  cart: 'serbabisa.cart',
} as const;
