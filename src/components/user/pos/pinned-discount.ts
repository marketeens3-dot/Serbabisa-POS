// Diskon tetap (pin diskon) di kasir: mode + nilai diskon terakhir otomatis
// dipakai LAGI untuk transaksi berikutnya — kasir promo (mis. member 10%)
// tidak perlu input ulang tiap nota. Disimpan di localStorage per tenant
// (per perangkat kasir), BUKAN di database — preferensi mesin kasir, aman
// untuk beberapa toko yang login bergantian di browser yang sama.

export type PinnedDiscount = {
  mode: "rp" | "pct"
  value: number
}

const KEY_PREFIX = "sb_pinned_discount_v1"

function storageKey(tenantId: string) {
  return `${KEY_PREFIX}_${tenantId}`
}

/** Baca diskon tersemat. null = tidak ada / data tidak valid. */
export function loadPinnedDiscount(tenantId: string): PinnedDiscount | null {
  try {
    const raw = localStorage.getItem(storageKey(tenantId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { mode?: unknown; value?: unknown }
    const mode = parsed.mode === "pct" ? "pct" : parsed.mode === "rp" ? "rp" : null
    const value = typeof parsed.value === "number" ? parsed.value : Number(parsed.value)
    if (!mode || !Number.isFinite(value) || value <= 0) return null
    // Sanitasi dengan batas yang sama seperti input kasir:
    // % → 0–100 (maks 2 desimal), Rp → bilangan bulat ≥ 0.
    return {
      mode,
      value:
        mode === "pct"
          ? Math.min(100, Math.max(0, Math.round(value * 100) / 100))
          : Math.max(0, Math.floor(value)),
    }
  } catch {
    return null // JSON rusak / storage disabled — perlakukan sebagai belum ada
  }
}

/** Simpan diskon tersemat (value ≤ 0 → hapus; menyematkan nol tidak bermakna). */
export function savePinnedDiscount(tenantId: string, discount: PinnedDiscount | null) {
  if (!tenantId) return
  try {
    if (!discount || discount.value <= 0) localStorage.removeItem(storageKey(tenantId))
    else localStorage.setItem(storageKey(tenantId), JSON.stringify(discount))
  } catch {
    // storage penuh / private mode — fitur menurun diam-diam, jangan ganggu kasir
  }
}
