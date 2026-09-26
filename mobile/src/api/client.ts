/**
 * Klien API untuk aplikasi native.
 *
 * Berbeda dari browser, React Native punya tiga masalah nyata yang ditangani
 * file ini:
 *
 * 1. **Cookie HttpOnly tidak bisa dibaca JS.** Cookie store native juga tidak
 *    konsisten antara iOS dan Android. Solusinya: server mengembalikan
 *    `sessionToken` di body (hanya untuk klien native) dan file ini mengirimnya
 *    kembali sebagai header `Cookie` secara manual.
 *
 * 2. **Tidak ada `Origin`.** Proteksi same-origin server sengaja mengizinkan
 *    request tanpa Origin (untuk CLI/klien native), jadi tidak perlu header
 *    khusus. Klien ini tidak menambahkan `Origin` palsu karena itu justru
 *    akan ditolak.
 *
 * 3. **Timeout tidak bawaan.** `fetch` di RN bisa menggantung saat jaringan
 *    hilang tanpa error — sangat berbahaya untuk aplikasi offline-first,
 *    karena UI akan tampak "loading" selamanya. Semua request punya AbortController.
 */
import { STORAGE_KEYS, stripTrailingSlash } from '../config';
import { getMeta, setMeta } from '../db';

/** Ambil token sesi tersimpan; null bila belum login. */
export async function getToken(): Promise<string | null> {
  return getMeta(STORAGE_KEYS.sessionToken);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await setMeta(STORAGE_KEYS.sessionToken, token);
  else await setMeta(STORAGE_KEYS.sessionToken, '');
}

/** Alamat server yang sedang dipakai (bisa diganti user). */
export async function getServerUrl(): Promise<string> {
  const stored = await getMeta(STORAGE_KEYS.serverUrl);
  return stripTrailingSlash(stored?.trim() || (await import('../config')).CONFIG.defaultServerUrl);
}

export async function setServerUrl(url: string): Promise<void> {
  await setMeta(STORAGE_KEYS.serverUrl, stripTrailingSlash(url.trim()));
}

/** Galat API yang membawa pesan dari server agar bisa ditampilkan ke kasir. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Galat yang Meaning-nya "tidak ada internet", bukan "server rusak". */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  /** Lewati token (untuk login & cek koneksi). */
  anonymous?: boolean;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Panggil API. TIDAK pernah melempar exception untuk galat HTTP/ jaringan —
 * selalu mengembalikan Result supaya pemanggil wajib menangani kondisi offline.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<Result<T>> {
  const {
    method = 'GET',
    body,
    timeoutMs = 20_000,
    anonymous = false,
  } = options;

  const base = await getServerUrl();
  const token = anonymous ? null : await getToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'x-client': 'native' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    // Token dikirim manual sebagai Cookie — inilah alasan login meminta
    // `sessionToken` di body.
    if (token) headers.Cookie = `sb_session=${token}`;

    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const obj = (data ?? {}) as { error?: string; message?: string };
      return {
        ok: false,
        error: new ApiError(
          obj.error ?? 'HTTP_ERROR',
          obj.message ?? `Permintaan gagal (HTTP ${res.status}).`,
          res.status,
        ),
      };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    // AbortError = timeout; TypeError = tidak ada jaringan. Keduanya kondisi
    // OFFLINE, bukan bug — pesannya harus\Migration ke kasir, bukan "error".
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const offline = isAbort || err instanceof TypeError;
    return {
      ok: false,
      error: new ApiError(
        offline ? 'OFFLINE' : 'NETWORK_ERROR',
        offline
          ? isAbort
            ? 'Server tidak menjawab. Periksa koneksi internet.'
            : 'Tidak ada koneksi ke server. Transaksi tetap tersimpan di perangkat dan dikirim begitu online lagi.'
          : (err instanceof Error ? err.message : 'Kesalahan jaringan tidak dikenal.'),
        0,
      ),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Cek apakah server hidup (dipakai layar Pengaturan). */
export async function pingServer(): Promise<Result<{ ok: boolean }>> {
  return api<{ ok: boolean }>('/api/sync/mobile/ping', { anonymous: true, timeoutMs: 8000 });
}
