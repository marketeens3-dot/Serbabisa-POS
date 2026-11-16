// Visual deterministik untuk katalog POS: emoji per jenis/kategori + gradasi
// pastel per item. Tanpa aset gambar (bundle tetap ringan) dan STABIL antara
// render server/client — dihitung dari id/nama (hash), bukan Math.random(),
// sehingga bebas hydration mismatch.

const EMOJI_RULES: [RegExp, string][] = [
  [/boba|bubble|pearl|milk ?tea/i, "🧋"],
  [/matcha|green ?tea/i, "🍵"],
  [/tea|teh(?! cuma)/i, "🍵"],
  [/kopi|coffee|espresso|latte|americano|cappucino|cappuccino|mocha/i, "☕"],
  [/jus|juice|smoothie|lemon|jeruk|mangga|strawberry|melon/i, "🥤"],
  [/susu|milk/i, "🥛"],
  [/air|mineral|aqua|water/i, "💧"],
  [/soda|cola|sprite|fanta|soft ?drink|energi|energy/i, "🥤"],
  [/roti|bread|toast|bakery|kue|cake|bolu|donat|donut|brownis|martabak/i, "🍰"],
  [/eskrim|ice ?cream|gelato/i, "🍦"],
  [/snack|keripik|chips|kentang|popcorn|cimol|cilok|siomay|batagor|risol/i, "🍿"],
  [/nasi|rice|ayam|chicken|geprek|bakmi|kwetiau|bubur|mie\b|mi\b|noodle/i, "🍜"],
  [/burger|pizza|hot ?dog|sandwich|kebab|wrap/i, "🍔"],
  [/gorengan|fried|tempe|tahu/i, "🧆"],
  [/sate|satay|grill|bakar|barbeque|bbq/i, "🍢"],
  [/sayur|salad|vegetable|capcay/i, "🥗"],
  [/buah|fruit|pisang|semangka|apel|durian/i, "🍎"],
  [/manis|gula|sweet|coklat|chocolate/i, "🍫"],
  [/minuman|beverage|drink/i, "🧋"],
]

/** Emoji ikon untuk item katalog — berdasar nama (kata kunci) + jenis. */
export function itemEmoji(name: string, type: string): string {
  if (type !== "PRODUCT") return "🛠️"
  for (const [re, emoji] of EMOJI_RULES) if (re.test(name)) return emoji
  return "📦"
}

/** Emoji ikon untuk chip kategori / label jenis. */
export function categoryEmoji(name: string): string {
  if (/jasa|service|servis|repair|service /i.test(name)) return "🛠️"
  if (/promo|paket|combo|bundling|hemat/i.test(name)) return "🎁"
  if (/makanan|food|kitchen|dapur/i.test(name)) return "🍽️"
  if (/minuman|drink|beverage/i.test(name)) return "🧋"
  for (const [re, emoji] of EMOJI_RULES) if (re.test(name)) return emoji
  return "🏷️"
}

/** Palet pastel lembut — latar area media kartu produk ala desain referensi. */
const PASTELS = [
  "linear-gradient(135deg, #fff7ed 0%, #ffedd5 60%, #fbe7cf 100%)", // oranye hangat
  "linear-gradient(135deg, #eef2ff 0%, #e0e7ff 60%, #d9e3fb 100%)", // indigo
  "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 60%, #d3f3dd 100%)", // hijau
  "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 60%, #f8dcf0 100%)", // pink
  "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 60%, #e6defa 100%)", // violet
  "linear-gradient(135deg, #ecfeff 0%, #cffafe 60%, #c3eff7 100%)", // cyan
] as const

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Gradasi pastel stabil untuk seed (id item / kategori) — anti hydration mismatch. */
export function pastelFor(seed: string): string {
  return PASTELS[hashString(seed) % PASTELS.length]
}
