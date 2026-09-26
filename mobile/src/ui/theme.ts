/**
 * Token visual aplikasi HP.
 *
 * WARNA DISALIN DARI VERSI WEB, bukan dikira-kira.
 *
 * Aplikasi web memakai token CSS di `src/app/globals.css` (shadcn-style, oklch).
 * Nilai di bawah adalah hasil konversi oklch -> sRGB dengan perhitungan
 * (bukan tebakan), supaya kasir yang berganti antara web dan HP melihat warna
 * yang sama persis. Warna lama mobile (emerald #059669) diganti primary biru
 * #165DFC karena itulah yang benar-benar dipakai web.
 *
 * Semua token publik (radius, space, format angka) tidak berubah, jadi file
 * ini tetap kompatibel dengan seluruh layar yang sudah ada.
 */

/** Palet satu mode. */
export type Palette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  /** Permukaan kedua: isian tombol sekunder, header tabel. */
  secondary: string;
  secondaryForeground: string;
  /** Latar redup: baris hover, area kosong. */
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  success: string;
  warning: string;
  border: string;
  input: string;
  /** Lapisan transparan untuk dialog/overlay. */
  overlay: string;
};

/** Same constant, dibuat soft untuk banner/pill. */
type Soft = { bg: string; fg: string };

export type Theme = {
  mode: 'light' | 'dark';
  C: Palette & {
    /** Alias `background`; dipakai sebagai warna latar halaman. */
    bg: string;
    primaryDark: string;

    primarySoft: string;
    surface: string;
    surfaceAlt: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textFaint: string;
    danger: string;
    dangerSoft: string;
    warn: string;
    warnSoft: string;
    info: string;
    infoSoft: string;
    ok: string;
    okSoft: string;
    /** Teks di atas isian jenuh (tombol, tab aktif, chip terpilih). */
    onFill: string;
  };
  radius: typeof radius;
  space: typeof space;
  /** Varian soft untuk tone status, sudah mengikuti mode. */
  soft: Record<'primary' | 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent', Soft>;
};

const LIGHT: Palette = {
  background: '#FAFAF9',
  foreground: '#17171A',
  card: '#FFFFFF',
  cardForeground: '#17171A',
  primary: '#165DFC',
  primaryForeground: '#F6FAFF',
  secondary: '#F2F2EE',
  secondaryForeground: '#2E2E34',
  muted: '#F2F2EF',
  mutedForeground: '#67676C',
  accent: '#E7F1FF',
  accentForeground: '#1647B4',
  destructive: '#DB000A',
  success: '#007F55',
  // #B05800, bukan #E27100 dari web: amber-lumterang di atas krem hanya
  // 2,92:1, jadi badge "Stok menipis" sulit dibaca kasir. Nilai ini satu
  // hue, digelapkan sampai 4,54:1 (lihat `mobile:theme`).
  warning: '#B05800',
  border: '#E5E5E2',
  // 3,06:1 terhadap latar. Garis kotak isian adalah satu-satunya penanda
  // bahwa kolom bisa diketik, jadi WCAG 1.4.11 minimum 3:1 — #E5E5E2 hanya
  // 1,21:1. `border` (dekoratif) tidak diangkakan, hanya `input`.
  input: '#90908E',
  overlay: 'rgba(23, 23, 26, 0.45)',
};

const DARK: Palette = {
  background: '#0A0A0D',
  foreground: '#F0F0F3',
  card: '#17171A',
  cardForeground: '#FAFAFA',
  primary: '#2C7FFF',
  primaryForeground: '#070D1A',
  secondary: '#262629',
  secondaryForeground: '#FAFAFA',
  muted: '#262629',
  mutedForeground: '#A0A0A7',
  accent: '#1D2D4C',
  accentForeground: '#A4CDFF',
  destructive: '#FF6467',
  success: '#00BC7D',
  warning: '#F0B100',
  border: 'rgba(255, 255, 255, 0.12)',
  // alpha 0,21 hanya 1,83:1 — kotak isian nyaris tak terlihat di latar
  // gelap. 0,45 memberi 4,49:1 (dan 4,06:1 di atas kartu).
  input: 'rgba(255, 255, 255, 0.45)',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export function buildTheme(mode: 'light' | 'dark'): Theme {
  const p = mode === 'dark' ? DARK : LIGHT;
  const isDark = mode === 'dark';

  const C = {
    ...p,
    // Alias yang sudah dipakai seluruh layar — dipertahankan agar tidak ada
    // file layar yang harus diubah hanya karena nama token.
    // `bg` wajib ada: dipakai sebagai background halaman di semua layar.
    bg: p.background,
    primaryDark: isDark ? '#1E6BE0' : '#0F47C4',
    primarySoft: isDark ? 'rgba(44, 127, 255, 0.16)' : '#E7F1FF',
    surface: p.card,
    surfaceAlt: p.muted,
    borderStrong: isDark ? 'rgba(255, 255, 255, 0.22)' : '#D3D3CF',
    text: p.foreground,
    textMuted: p.mutedForeground,
    // Level paling redup, tapi tetap di atas 4,5:1. Nilai lama (#8A8A90 terang /
    // #6E6E75 gelap) hanya 3,4:1, padahal dipakai untuk label tab yang
    // kasir baca terus-menerus, placeholder pencarian, dan total nota yang
    // dicoret saat void — semuanya isi, bukan hiasan.
    // Sisakan margin di atas 4,5 supaya tidak rapuh terhadap pembulatan.
    textFaint: isDark ? '#85858C' : '#75757A',
    danger: p.destructive,
    dangerSoft: isDark ? 'rgba(255, 100, 103, 0.15)' : '#FDECEC',
    warn: p.warning,
    warnSoft: isDark ? 'rgba(240, 177, 0, 0.15)' : '#FFF4E0',
    // Sengaja TIDAK sama dengan `primary`. Di mode gelap, biru `#2C7FFF`
    // hanya 3,65:1 di atas `infoSoft`, jadi teks info jadi #{primary} tak
    // terbaca. Warna info dibuat lebih terang (6,4:1 di latar) sementara
    // `primary` tetap #2C7FFF supaya warna tombol tidak ikut berubah.
    info: isDark ? '#4E93FF' : p.primary,
    infoSoft: p.accent,
    ok: p.success,
    okSoft: isDark ? 'rgba(0, 188, 125, 0.16)' : '#E6F7F0',
    /**
     * Teks di atas isian jenuh (tombol, tab aktif). Nilai sama dengan
     * `primaryForeground` karena hasilnya kebetulan benar untuk semua
     * isian di kedua mode — tetapi dipisah agar maksud di call site jelas.
     * Dulu call site menulis `color: '#fff'` langsung, dan putih di atas
     * `warn` hanya 3,18:1 sehingga badge "Stok menipis" gagal terbaca.
     */
    onFill: p.primaryForeground,
  };

  return {
    mode,
    C,
    radius,
    space,
    soft: {
      primary: { bg: C.primarySoft, fg: p.primary },
      ok: { bg: C.okSoft, fg: p.success },
      warn: { bg: C.warnSoft, fg: p.warning },
      danger: { bg: C.dangerSoft, fg: p.destructive },
      info: { bg: C.infoSoft, fg: p.accentForeground },
      neutral: { bg: p.muted, fg: p.mutedForeground },
      accent: { bg: p.accent, fg: p.accentForeground },
    },
  };
}

/** Radius mengikuti `--radius: 0.625rem` (10px) dari globals.css web. */
export const radius = { sm: 8, md: 10, lg: 12, xl: 16 } as const;

export const space = (n: number) => n * 4;

/**
 * Palet mode terang — dipakai sebagai nilai default bila `useTheme` belum
 * tersedia (mis. di luar provider). Layar sebaiknya tetap memanggil
 * `useTheme()` supaya ikut berubah saat mode gelap dinyalakan.
 *
 * PENTING: `radius` & `space` harus dideklarasikan DI ATAS titik ini. Keduanya
 * dirujuk di body `buildTheme`, dan baris ini memanggil `buildTheme` saat modul
 * dievaluasi. Kalau const-nya dipindah ke bawah, objek itu masih berada di
 * temporal dead zone saat baris ini jalan → `ReferenceError: Cannot access
 * 'radius' before initialization`, yang membuat seluruh aplikasi HP gagal
 * start. `tsc` TIDAK menangkap ini (pemakaian di dalam body fungsi lolos
 * pemeriksaan), jadi dijaga oleh `npm run mobile:theme` (lihat scripts/).
 */
export const C = buildTheme('light').C;

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

/** Waktu Indonesia 24 jam. */
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
