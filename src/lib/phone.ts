// Normalisasi nomor telepon Indonesia — isomorphic (dipakai server & client).

/**
 * Normalisasi nomor HP Indonesia ke format internasional tanpa "+".
 * 08123456789 → 628123456789 ; +62812… → 62812… ; 812… → 62812…
 * Mengembalikan null jika tidak bisa dinormalisasi.
 */
export function normalizeIndonesianPhone(input: string): string | null {
  if (!input) return null
  // Hanya digit; "+" hanya diizinkan di awal.
  let cleaned = input.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1)
  if (!/^\d+$/.test(cleaned)) return null
  if (cleaned.startsWith('62')) return cleaned
  if (cleaned.startsWith('0')) return '62' + cleaned.slice(1)
  if (cleaned.startsWith('8')) return '62' + cleaned
  // Nomor non-Indonesia: terima apa adanya jika panjangnya masuk akal.
  if (cleaned.length >= 8 && cleaned.length <= 15) return cleaned
  return null
}

/** Valid nomor WhatsApp Indonesia: 62 + 8–13 digit. */
export function isValidWhatsappNumber(input: string): boolean {
  const normalized = normalizeIndonesianPhone(input)
  return !!normalized && /^62\d{8,13}$/.test(normalized)
}

/** Tampilan ramah untuk nomor ternormalisasi, mis. 628123456789 → 0812-3456-789. */
export function formatPhoneDisplay(normalized: string | null | undefined): string {
  if (!normalized) return '-'
  if (normalized.startsWith('62')) {
    const local = '0' + normalized.slice(2)
    const parts = local.match(/^(\d{4})(\d{4})(\d+)$/)
    if (parts) return `${parts[1]}-${parts[2]}-${parts[3]}`
    return local
  }
  return `+${normalized}`
}
