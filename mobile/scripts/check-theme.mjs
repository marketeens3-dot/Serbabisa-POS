#!/usr/bin/env node
/**
 * Gerbang kualitas untuk sistem tema HP: smoke test + audit kontras WCAG.
 *
 * Kenapa skrip ini ada (bukan sekadar "tidak salah"):
 *
 * 1. BUG FATAL YANG SUDAH PERNAH TERJADI — "Cannot access 'radius' before
 *    initialization". `theme.ts` memanggil `buildTheme()` di baris `export
 *    const C = ...`, sementara `radius`/`space` baru dideklarasikan di
 *    bawahnya. Hasilnya ReferenceError saat modul dievaluasi, yaitu saat
 *    aplikasi baru start → SELURUH layar gagal render. `tsc` tidak
 *    menangkapnya, karena pemakaian const di dalam body fungsi lolos dari
 *    pemeriksaan "used before declaration". Skrip ini meng-import modulnya
 *    sungguhan, jadi kelas bug itu tertutup.
 *
 * 2. TOKEN BISA "ADA DI TIPE" TAPI HILANG DI OBJEK. `Theme` bertipe penuh,
 *    tapi `buildTheme` tidak wajib menyalin semua field `Palette`; satu
 *    `undefined` akan jadi `backgroundColor: undefined` (l transparan) tanpa
 *    error TypeScript. Karena itu setiap token dicek ada & berformat warna.
 *
 * 3. WARNA HARDCODE. Layar yang menulis `color: '#fff'` tidak ikut berubah
 *    saat mode gelap dinyalakan, dan putih di atas biru terang mode gelap
 *    hanya ~3,8:1 (butuh 4,5:1). Warna literal di luar palet/error/overlay
 *    diperlakukan sebagai kegagalan.
 *
 * Ambang mengikuti WCAG 2.1: 4,5:1 teks normal, 3:1 teks besar & batas
 * komponen UI (termasuk ikon dan border yang jadi satu-satunya penanda).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const failures = [];
const warnings = [];

/** 4,5:1 teks normal, 3:1 teks besar (>=18,66px bold / 24px) & komponen UI. */
const AA_TEXT = 4.5;
const AA_LARGE = 3;

/* ------------------------------------------------------------------ *
 * 1. Smoke test: modul harus benar-benar bisa dievaluasi.
 * ------------------------------------------------------------------ */

let buildTheme;
try {
  // `pathToFileURL` wajib: di Windows, path absolut `C:\...` ditolak ESM loader.
  ({ buildTheme } = await import(pathToFileURL(join(MOBILE, 'src/ui/theme.ts')).href));
} catch (err) {
  // Kegagalan di sini = aplikasi tidak bisa start. Stop, jangan laporkan
  // kontras apa pun, karena tidak ada tema yang bisa dinilai.
  console.error('FATAL: src/ui/theme.ts gagal diimpor (aplikasi tidak akan start):');
  console.error(`  ${err && err.message ? err.message : err}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 2. Hitung kontras (WCAG 2.1 relative luminance).
 * ------------------------------------------------------------------ */

function parseColor(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return null;
    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      a: parts.length > 3 ? Number(parts[3]) : 1,
    };
  }
  return null;
}

/** [r,g,b] 0-255 -> luminance relatif. */
function luminance({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rasio kontras dua warna.
 *
 *  PENTING: warna semi-transparan harus di-composite di atas latar yang
 *  sebenarnya. Kalau tidak, `dangerSoft` mode gelap yang Bernilai
 *  `rgba(255,100,103,0.15)` akan dianggap merah pekat, dan `danger`
 *  `#FF6467` di atasnya jadi "1,00:1" — hasil yang salah dan menipu.
 *  `pageBg` dipakai sebagai lapisan dasar untuk komposit tersebut.
 */
function contrast(fgValue, bgValue, pageBg = '#FFFFFF') {
  const base = parseColor(pageBg);
  if (!base) return null;

  // 1. Komposit latar di atas halaman (bisa berlapis: soft di atas kartu).
  let bg = parseColor(bgValue);
  if (!bg) return null;
  if (bg.a < 1) {
    bg = {
      r: bg.r * bg.a + base.r * (1 - bg.a),
      g: bg.g * bg.a + base.g * (1 - bg.a),
      b: bg.b * bg.a + base.b * (1 - bg.a),
    };
  }

  // 2. Komposit teks di atas latar hasil langkah 1.
  const fg = parseColor(fgValue);
  if (!fg) return null;
  const ink =
    fg.a < 1
      ? {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        }
      : fg;

  const l1 = luminance(ink);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const fmt = (n) => `${n.toFixed(2)}:1`;

/* ------------------------------------------------------------------ *
 * 3. Structural: semua token harus ada di kedua mode.
 * ------------------------------------------------------------------ */

const themes = {};
for (const mode of ['light', 'dark']) {
  const t = buildTheme(mode);
  themes[mode] = t;
  if (t.mode !== mode) {
    failures.push(`buildTheme('${mode}') mengembalikan mode="${t.mode}"`);
  }
  for (const [key, value] of Object.entries(t.C)) {
    if (value === undefined || value === null || value === '') {
      failures.push(`tema ${mode}: token C.${key} kosong/undefined (l transparan)`);
      continue;
    }
    if (!parseColor(value)) {
      failures.push(`tema ${mode}: token C.${key}="${value}" bukan format warna yang valid`);
    }
  }
  for (const [key, soft] of Object.entries(t.soft)) {
    for (const part of ['bg', 'fg']) {
      if (!soft || !parseColor(soft[part])) {
        failures.push(`tema ${mode}: soft.${key}.${part}="${soft && soft[part]}" bukan warna valid`);
      }
    }
  }
  if (t.radius.md !== 10) {
    warnings.push(`tema ${mode}: radius.md=${t.radius.md} (globals.css web = 10)`);
  }
}

/* ------------------------------------------------------------------ *
 * 4. Audit kontras per mode.
 *    [label, fg, bg, minimum, lapis-lapis?]
 *
 *  `true` = latar token itu semi-transparan dan dirender di atas `surface`,
 *  jadi harus dikomposit. `false` = berlatar opak, bisa langsung dihitung.
 *
 *  Catatan ambang:
 *  - `border` dipakai untuk garis pemisah dekoratif. WCAG 1.4.11 TIDAK
 *    menuntut 3:1 untuk dekorasi, jadi hanya dilaporkan sebagai peringatan.
 *  - `input` berbeda: garisnya adalah satu-satunya penanda bahwa kotak itu
 *    bisa diketik, jadi 3:1 memang wajib (WCAG 1.4.11, non-text contrast).
 * ------------------------------------------------------------------ */

const PAIRS = [
  ['teks di latar halaman', 'text', 'bg', AA_TEXT, false],
  ['teks di kartu', 'text', 'surface', AA_TEXT, false],
  ['teks redup di latar', 'textMuted', 'bg', AA_TEXT, false],
  ['teks redup di kartu', 'textMuted', 'surface', AA_TEXT, false],
  ['teks redup di permukaan alt', 'textMuted', 'surfaceAlt', AA_TEXT, false],
  ['teks sanak di latar', 'textFaint', 'bg', AA_LARGE, false],
  ['tombol utama', 'primaryForeground', 'primary', AA_TEXT, false],
  ['kartu', 'cardForeground', 'card', AA_TEXT, false],
  ['permukaan sekunder', 'secondaryForeground', 'secondary', AA_TEXT, false],
  ['aksen', 'accentForeground', 'accent', AA_TEXT, false],
  ['border dekoratif di latar', 'border', 'bg', AA_LARGE, false],
  ['border dekoratif di kartu', 'border', 'surface', AA_LARGE, false],
  ['input (penanda komponen)', 'input', 'bg', AA_LARGE, false],
  ['danger di dangerSoft', 'danger', 'dangerSoft', AA_TEXT, true],
  ['warn di warnSoft', 'warn', 'warnSoft', AA_TEXT, true],
  ['ok di okSoft', 'ok', 'okSoft', AA_TEXT, true],
  ['info di infoSoft', 'info', 'infoSoft', AA_TEXT, true],
  ['danger di kartu', 'danger', 'surface', AA_TEXT, false],
  ['warn di kartu', 'warn', 'surface', AA_TEXT, false],
  ['ok di kartu', 'ok', 'surface', AA_TEXT, false],
  ['info di kartu', 'info', 'surface', AA_TEXT, false],
  // `onFill` = teks di atas isian jenuh. Inilah yang dulu ditulis `#fff`
  // langsung di 6 call site; putih di atas `warn` hanya 3,18:1.
  ['onFill di primary', 'onFill', 'primary', AA_TEXT, false],
  ['onFill di danger', 'onFill', 'danger', AA_TEXT, false],
  ['onFill di ok', 'onFill', 'ok', AA_TEXT, false],
  ['onFill di warn', 'onFill', 'warn', AA_TEXT, false],
];

const SOFT_PAIRS = [
  ['soft.primary', AA_TEXT],
  ['soft.ok', AA_TEXT],
  ['soft.warn', AA_TEXT],
  ['soft.danger', AA_TEXT],
  ['soft.info', AA_TEXT],
  ['soft.neutral', AA_TEXT],
  ['soft.accent', AA_TEXT],
];

/** Pasangan yang hanya informational:tinger warned, bukan gagal. */
const DECORATIVE = new Set(['border dekoratif di latar', 'border dekoratif di kartu']);

let checked = 0;
for (const mode of ['light', 'dark']) {
  const t = themes[mode];
  for (const [label, fgKey, bgKey, min, layered] of PAIRS) {
    const page = layered ? t.C.surface : t.C.bg;
    const ratio = contrast(t.C[fgKey], t.C[bgKey], page);
    if (ratio === null) {
      failures.push(`tema ${mode}: tidak bisa hitung "${label}" (${fgKey} di ${bgKey})`);
      continue;
    }
    checked++;
    if (ratio < min) {
      const msg =
        `tema ${mode}: KONTRAS "${label}" ${fmt(ratio)} < ${min}:1 ` +
        `(${fgKey}="${t.C[fgKey]}" di ${bgKey}="${t.C[bgKey]}")`;
      if (DECORATIVE.has(label)) warnings.push(msg);
      else failures.push(msg);
    }
  }
  for (const [key, min] of SOFT_PAIRS) {
    const s = t.soft[key];
    if (!s) continue;
    const ratio = contrast(s.fg, s.bg, t.C.surface);
    if (ratio === null) {
      failures.push(`tema ${mode}: tidak bisa hitung "${key}"`);
      continue;
    }
    checked++;
    if (ratio < min) {
      failures.push(
        `tema ${mode}: KONTRAS "${key}" ${fmt(ratio)} < ${min}:1 (fg="${s.fg}" bg="${s.bg}")`
      );
    }
  }
}

/* ------------------------------------------------------------------ *
 * 5. Layar tidak boleh hardcode warna.
 * ------------------------------------------------------------------ */

// Hitam penuh '#000'/'#000000' dipakai sebagai `shadowColor`, yang memang
// selalu hitam di kedua mode — bukan warna tampilan, jadi dikecualikan.
const LITERAL_OK = /^#(?:000|000000)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'scripts') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const SCREEN_FILES = [
  ...walk(join(MOBILE, 'app')),
  join(MOBILE, 'src/ui/components.tsx'),
];

for (const file of SCREEN_FILES) {
  const rel = relative(MOBILE, file).replace(/\\/g, '/');
  if (rel.endsWith('ui/theme.ts')) continue;
  const src = readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    const re = /(['"])(#[0-9a-fA-F]{3,8})\1/g;
    let m;
    while ((m = re.exec(line))) {
      if (LITERAL_OK.test(m[2])) continue;
      failures.push(
        `${rel}:${i + 1}: warna hardcode ${m[2]} — pakai token tema (C.*) ` +
          `supaya ikut berubah saat mode gelap dinyalakan`
      );
    }
    // Shorthand yang sering ditulis untuk putih penuh.
    const short = /(['"])(white|black)\1/.exec(line);
    if (short) {
      failures.push(`${rel}:${i + 1}: warna hardcode "${short[2]}" — pakai token tema (C.*)`);
    }
  });
}

/* ------------------------------------------------------------------ *
 * Laporan
 * ------------------------------------------------------------------ */

console.log('check-theme — smoke test + audit kontras WCAG\n');
console.log(`  Modul theme      : OK (diimpor & kedua mode terbangun)`);
console.log(`  Pasangan kontras  : ${checked} diperiksa (${Object.keys(themes).join(' + ')})`);
console.log(`  Berkas layar      : ${SCREEN_FILES.length} dipindai rgba()/hex`);

if (warnings.length) {
  console.log('\nPeringatan:');
  for (const w of warnings) console.log(`  - ${w}`);
}

if (failures.length) {
  console.log(`\nGAGAL — ${failures.length} masalah:\n`);
  for (const f of failures) console.log(`  x ${f}`);
  process.exit(1);
}

console.log('\nOK — semua token ada, kontras memenuhi WCAG AA, tanpa warna hardcode.');
