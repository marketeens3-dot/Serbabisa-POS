// Matematika keranjang POS — SATU sumber rumus untuk pos-view, cart-panel,
// dan checkout-dialog agar angka di layar SELALU sama dengan perhitungan
// server (src/app/api/transactions/route.ts) dan angka di nota.
//
// Konvensi (identik dengan server):
//   gross baris        = round(qty × unitPrice)
//   diskon baris       = pct > 0 ? floor(gross × pct / 100)
//                      : dariProduk ? round(min(rp, hargaSatuan) × qty)
//                      : min(rp, gross)
//   subtotal baris     = gross − diskon baris  (NET — disimpan ke DB)
//   subtotal transaksi = Σ subtotal baris      (NET)
//   diskon transaksi % = floor(subtotalNet × pct / 100)
import type { CatalogItemDTO } from "@/lib/types"

export type CartLine = {
  item: CatalogItemDTO
  quantity: number
  /** Satuan diskon baris: "rp" nominal, "pct" persen. */
  discountMode: "rp" | "pct"
  /**
   * Nilai diskon sesuai mode. Saat `discountFromProduct`, nilai ini adalah
   * nominal PER UNIT (dari master produk) sehingga otomatis ikut qty.
   */
  discountValue: number
  /** true = diskon mengikuti master produk (Rp/unit); false = manual per baris. */
  discountFromProduct?: boolean
}

/** Baris tanpa diskon — dipakai saat menambah item / memulihkan parkiran lama. */
export function emptyLineDiscount(): {
  discountMode: "rp" | "pct"
  discountValue: number
  discountFromProduct: boolean
} {
  return { discountMode: "rp", discountValue: 0, discountFromProduct: false }
}

/** Baris baru dengan diskon default dari master produk (bila ada). */
export function productLineDiscount(
  item: Pick<CatalogItemDTO, "sellingPrice" | "discountAmount">
): { discountMode: "rp" | "pct"; discountValue: number; discountFromProduct: boolean } {
  const d = Math.max(0, Math.floor(item.discountAmount ?? 0))
  return { discountMode: "rp", discountValue: d, discountFromProduct: d > 0 }
}

/** Bruto baris: round(qty × harga jual) — sebelum diskon apa pun. */
export function lineGross(l: Pick<CartLine, "item" | "quantity">): number {
  return Math.round(l.quantity * l.item.sellingPrice)
}

/** Nominal diskon baris (Rp, ≥ 0, tidak pernah melebihi bruto). Rumus = server. */
export function lineDiscount(l: CartLine): number {
  const gross = lineGross(l)
  if (l.discountMode === "pct") {
    return Math.max(0, Math.floor((gross * l.discountValue) / 100))
  }
  if (l.discountFromProduct) {
    // Diskon produk: nominal PER UNIT (dibatasi harga satuan) × qty.
    const perUnit = Math.min(Math.max(0, Math.floor(l.discountValue)), l.item.sellingPrice)
    return Math.min(gross, Math.round(perUnit * l.quantity))
  }
  return Math.max(0, Math.min(Math.floor(l.discountValue), gross))
}

/** Neto baris (yang benar-benar dibayar untuk baris ini) = gross − diskon. */
export function lineNet(l: CartLine): number {
  return lineGross(l) - lineDiscount(l)
}

/** Harga satuan efektif untuk tampilan (Rp harga − diskon produk per unit). */
export function effectiveUnitPrice(l: Pick<CartLine, "item" | "discountMode" | "discountValue" | "discountFromProduct">): number {
  if (l.discountMode === "rp" && l.discountFromProduct) {
    return l.item.sellingPrice - Math.min(Math.max(0, Math.floor(l.discountValue)), l.item.sellingPrice)
  }
  return l.item.sellingPrice
}
