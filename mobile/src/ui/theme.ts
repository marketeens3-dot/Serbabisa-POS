/**
 * Palet warna & token visual.
 *
 * Satu tempat supaya semua layar konsisten. Warna diambil dari aplikasi web
 * (emerald sebagai warna utama) supaya kasir yang sudah biasa dengan versi
 * desktop tidak merasa berada di aplikasi yang berbeda.
 */
export const C = {
  primary: '#059669',
  primaryDark: '#047857',
  primarySoft: '#D1FAE5',

  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',

  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  warn: '#D97706',
  warnSoft: '#FEF3C7',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  ok: '#059669',
  okSoft: '#D1FAE5',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 } as const;

export const space = (n: number) => n * 4;

/** Format rupiah tanpa desimal — sama seperti backend dan versi web. */
export function rupiah(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  return `Rp${v.toLocaleString('id-ID')}`;
}

/** Angka ringkas untuk ringkasan (mis. 1,2 rb). */
export function rupiahShort(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  if (Math.abs(v) >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  if (Math.abs(v) >= 1_000) return `Rp${(v / 1_000).toFixed(0)} rb`;
  return rupiah(v);
}

/** Format tanggal Indonesia. */
export function tanggalID(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function waktuID(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2 menit lalu" — dipakai untuk status sinkronisasi. */
export function sejakID(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return '-';
  if (ms < 60_000) return 'baru saja';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} menit lalu`;
  const jam = Math.floor(min / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

/** Angka desimal tanpa trailing nol (stok: 2 / 2,5). */
export function num(n: number): string {
  const v = Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
}
