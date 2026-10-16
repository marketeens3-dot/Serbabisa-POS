// Format isomorphic (client & server) — locale id-ID, timezone Asia/Jakarta.
// Server menyimpan UTC; tampilan SELALU dikonversi ke Asia/Jakarta.

export const JAKARTA_TZ = 'Asia/Jakarta'

export function formatIDR(amount: number): string {
  if (!Number.isFinite(amount)) return 'Rp 0'
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(amount))
}

export function formatNumberID(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount)
}

/** Persen diskon utk nota/label: 10 → "10%", 12.5 → "12,5%" (tanpa nol desimal tak perlu). */
export function formatPercentID(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%'
  const trimmed = Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)))
  return `${trimmed.replace('.', ',')}%`
}

function toDate(date: Date | string | number): Date {
  return date instanceof Date ? date : new Date(date)
}

export function formatDateID(date: Date | string | number): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(toDate(date))
}

export function formatTimeID(date: Date | string | number): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(date))
}

export function formatDateTimeID(date: Date | string | number): string {
  return `${formatDateID(date)} ${formatTimeID(date)}`
}

export function formatQty(qty: number): string {
  const rounded = Math.round(qty * 1000) / 1000
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(rounded)
}

// Rentang "hari ini" menurut Asia/Jakarta (WIB, UTC+7, tanpa DST) — dikembalikan sebagai UTC Date
// agar query database konsisten terlepas dari timezone server.
export function jakartaDayRange(now: Date = new Date()): { startUtc: Date; endUtc: Date; ymd: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) // YYYY-MM-DD
  return {
    ymd,
    startUtc: new Date(`${ymd}T00:00:00+07:00`),
    endUtc: new Date(`${ymd}T23:59:59.999+07:00`),
  }
}

export function jakartaYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA_TZ, year: 'numeric' }).format(now)
  )
}

// Rentang N hari terakhir (termasuk hari ini) versi Jakarta, terurut lama → baru.
export function lastNDayRanges(n: number, now: Date = new Date()): { ymd: string; startUtc: Date; endUtc: Date; label: string }[] {
  const ranges: { ymd: string; startUtc: Date; endUtc: Date; label: string }[] = []
  const todayYmd = jakartaDayRange(now).ymd
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(`${todayYmd}T12:00:00+07:00`) // tengah hari WIB agar aman dari offset aritmetika
    day.setUTCDate(day.getUTCDate() - i)
    const { ymd, startUtc, endUtc } = jakartaDayRange(day)
    const label = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(startUtc)
    ranges.push({ ymd, startUtc, endUtc, label })
  }
  return ranges
}

export function jakartaMonthRange(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(now) // YYYY-MM
  return {
    startUtc: new Date(`${ym}-01T00:00:00+07:00`),
    endUtc: jakartaDayRange(now).endUtc,
  }
}

// dd MMM yyyy, HH:mm versi panjang untuk detail transaksi.
export function formatDateTimeLongID(date: Date | string | number): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(toDate(date))
}
