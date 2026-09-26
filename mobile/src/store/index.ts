/**
 * State aplikasi: sesi, keranjang, dan status sinkronisasi.
 *
 * Memakai zustand (pustaka JS-murni, aman di Expo Go). State sengaja dipisah
 * dari data server: produk & pelanggan dibaca dari SQLite, sementara yang
 * di sini hanya hal yang berubah saat kasir menyentuh layar.
 */
import { create } from 'zustand';
import { CONFIG, STORAGE_KEYS } from '../config';
import { api, getToken, getServerUrl, setServerUrl as persistServerUrl, setToken } from '../api/client';
import { getDb, getMeta, outboxCount, resetDb, setMeta } from '../db';

export type Tenant = {
  id: string;
  businessName: string;
  slug: string;
  phone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  logoUrl: string | null;
  currency: string;
  timezone: string;
};

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'USER';
  mustChangePassword: boolean;
  tenant: Tenant | null;
};

export type CartLine = {
  catalogItemId: string;
  name: string;
  unit: string;
  price: number;
  qty: number;
  /** Stok saat item dimasukkan — untuk menampilkan peringatan stok tipis. */
  stockAtAdd: number;
};

export type SyncState = {
  lastSyncAt: string | null;
  lastError: string | null;
  pending: number;
  online: boolean | null;
  syncing: boolean;
};

type State = {
  booted: boolean;
  serverUrl: string;
  user: SessionUser | null;
  mustChangePassword: boolean;
  cart: CartLine[];
  sync: SyncState;

  boot: () => Promise<void>;
  setServer: (url: string) => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;

  addToCart: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (catalogItemId: string, qty: number) => void;
  removeFromCart: (catalogItemId: string) => void;
  clearCart: () => void;
  cartTotal: () => number;
  cartCount: () => number;

  refreshPending: () => Promise<void>;
  markOnline: (online: boolean) => void;
  setSyncing: (v: boolean) => void;
  setSyncResult: (r: { at?: string; error?: string | null }) => void;
};

const initialSync: SyncState = {
  lastSyncAt: null,
  lastError: null,
  pending: 0,
  online: null,
  syncing: false,
};

export const useAppStore = create<State>((set, get) => ({
  booted: false,
  serverUrl: CONFIG.defaultServerUrl,
  user: null,
  mustChangePassword: false,
  cart: [],
  sync: initialSync,

  async boot() {
    // 1. Buka database dulu — tanpa ini semua layar lain akan gagal.
    await getDb();

    const url = await getServerUrl();
    const token = await getToken();
    set({ serverUrl: url });

    // 2. Pulihkan keranjang yang belum sempat dibayar (mis. aplikasi ditutup
    //    di tengah transaksi). Memperbaiki UX "nota hilang sendiri".
    const rawCart = await getMeta(STORAGE_KEYS.cart);
    let cart: CartLine[] = [];
    if (rawCart) {
      try {
        const parsed = JSON.parse(rawCart);
        if (Array.isArray(parsed)) cart = parsed;
      } catch {
        cart = [];
      }
    }

    // 3. Kalau ada token, cek masih valid atau tidak.
    let user: SessionUser | null = null;
    if (token) {
      const res = await api<{ user: SessionUser }>('/api/auth/me', { timeoutMs: 10_000 });
      if (res.ok) {
        user = res.data.user;
      } else if (res.error.status === 401) {
        // Token benar-benar tidak berlaku → buang, jangan ganggu kasir dengan
        // layar login saat sinyal jelek tapi token masih sempat berlaku.
        await setToken(null);
      }
      // Status 0 (offline): token dipertahankan. Kasir HARUS tetap bisa
      // berjualan tanpa internet — memaksa login ulang akan menghentikan
      // pekerjaan justru saat koneksi sedang putus.
    }

    const pending = await outboxCount();
    set({
      booted: true,
      user,
      cart,
      // Penting: flag ini harus dipulihkan dari sesi yang tersimpan. Kalau
      // tidak, kasir yang password-nya masih sementara akan bisa masuk ke POS
      // setelah aplikasi ditutup — persis yang harus dicegah.
      mustChangePassword: user?.mustChangePassword ?? false,
      sync: { ...get().sync, pending },
    });
  },

  async setServer(url: string) {
    await persistServerUrl(url);
    set({ serverUrl: await getServerUrl() });
  },

  async login(email, password) {
    const res = await api<{ user: SessionUser; sessionToken?: string }>('/api/auth/login', {
      method: 'POST',
      body: { email: email.trim().toLowerCase(), password },
      anonymous: true,
      timeoutMs: 25_000,
    });

    if (!res.ok) {
      return { ok: false, message: res.error.message };
    }
    if (!res.data.sessionToken) {
      // Server lama yang tidak mendukung klien native.
      return {
        ok: false,
        message: 'Server ini tidak mendukung aplikasi HP. Perbarui server terlebih dahulu.',
      };
    }

    await setToken(res.data.sessionToken);
    set({
      user: res.data.user,
      mustChangePassword: res.data.user.mustChangePassword,
      sync: { ...get().sync, online: true, lastError: null },
    });
    return { ok: true };
  },

  async logout() {
    // Panggil server lebih dulu (best effort) supaya sesi dicabut di sana juga.
    // Kalau offline, token lokal tetap dihapus — sesi di server akan kedaluwarsa.
    await api('/api/auth/logout', { method: 'POST', timeoutMs: 4000 }).catch(() => undefined);
    await setToken(null);
    await resetDb();
    set({ user: null, cart: [], mustChangePassword: false, sync: initialSync });
  },

  setUser(u) {
    set({ user: u });
  },

  addToCart(line, qty = 1) {
    const cart = [...get().cart];
    const idx = cart.findIndex((l) => l.catalogItemId === line.catalogItemId);
    if (idx >= 0) {
      cart[idx] = { ...cart[idx], qty: cart[idx].qty + qty };
    } else {
      cart.push({ ...line, qty });
    }
    set({ cart });
    void setMeta(STORAGE_KEYS.cart, JSON.stringify(cart));
  },

  setQty(catalogItemId, qty) {
    // qty dibulatkan ke 3 desimal dan tidak boleh negatif.
    const safe = Math.max(0, Math.round(qty * 1000) / 1000);
    const cart = get()
      .cart.map((l) => (l.catalogItemId === catalogItemId ? { ...l, qty: safe } : l))
      .filter((l) => l.qty > 0);
    set({ cart });
    void setMeta(STORAGE_KEYS.cart, JSON.stringify(cart));
  },

  removeFromCart(catalogItemId) {
    const cart = get().cart.filter((l) => l.catalogItemId !== catalogItemId);
    set({ cart });
    void setMeta(STORAGE_KEYS.cart, JSON.stringify(cart));
  },

  clearCart() {
    set({ cart: [] });
    void setMeta(STORAGE_KEYS.cart, '[]');
  },

  cartTotal() {
    // Pembulatan dilakukan per baris supaya total selalu sama dengan jumlah
    // yang tampil di layar — Kasir dan kasir harus melihat angka yang sama.
    return get().cart.reduce((sum, l) => sum + Math.round(l.price * l.qty), 0);
  },

  cartCount() {
    return get().cart.reduce((sum, l) => sum + l.qty, 0);
  },

  async refreshPending() {
    set({ sync: { ...get().sync, pending: await outboxCount() } });
  },

  markOnline(online) {
    set({ sync: { ...get().sync, online } });
  },

  setSyncing(v) {
    set({ sync: { ...get().sync, syncing: v } });
  },

  setSyncResult(r) {
    set({
      sync: {
        ...get().sync,
        lastSyncAt: r.at ?? get().sync.lastSyncAt,
        lastError: r.error ?? null,
      },
    });
  },
}));

export { CONFIG };
