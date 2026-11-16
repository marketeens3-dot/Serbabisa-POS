// Logika diskon voucher — dipakai bersama oleh:
//   - POST /api/vouchers/validate (preview kasir)
//   - POST /api/transactions (checkout — validasi ulang penuh, anti tampering)
// Rumus harus SATU sumber agar preview kasir = hasil checkout.

export function computeVoucherDiscount(
  type: string,
  value: number,
  maxDiscount: number | null,
  subtotal: number
): number {
  const raw = type === 'PERCENT'
    ? Math.floor((subtotal * value) / 100)
    : Math.min(value, subtotal)
  const capped = type === 'PERCENT' && maxDiscount !== null ? Math.min(raw, maxDiscount) : raw
  return Math.min(capped, subtotal)
}
