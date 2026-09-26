/**
 * Assemble paket server untuk aplikasi desktop.
 *
 * Next.js `output: "standalone"` menghasilkan .next/standalone/ yang sudah
 * berisi server + node_modules hasil trace. Yang belum ikut: folder `static`
 * dan `public`. Script ini merakit semuanya ke dalam `desktop-build/server`
 * beserta `default-config.json` (DATABASE_URL dari .env saat build), lalu
 * electron-builder membungkusnya jadi .exe.
 *
 * Uso: node scripts/build-desktop.mjs [--skip-next-build]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...s) => path.join(root, ...s);

const OUT = p("desktop-build");
// Semua isi paket diletakkan satu level di bawah `bundle/` (bukan langsung di
// desktop-build/) karena filter file electron-builder MELEWATI direktori
// `node_modules` yang berada di root folder sumber. Dengan selector
// `from: desktop-build/bundle`, path-nya jadi `server/node_modules/...` → lolos.
const BUNDLE = path.join(OUT, "bundle");
const SERVER_OUT = path.join(BUNDLE, "server");
const SKIP_NEXT_BUILD = process.argv.includes("--skip-next-build");

const log = (m) => console.log(`  ${m}`);
const step = (m) => console.log(`\n▸ ${m}`);

// ---------------------------------------------------------------------------
// 1. Build Next.js (produksi, standalone)
// ---------------------------------------------------------------------------
function runNextBuild() {
  step("Build Next.js (standalone, webpack)");
  // --webpack: Turbopack di Windows gagal membuat junction point untuk
  // @prisma/client pada path project, jadi pakai webpack untuk build desktop.
  const nextBin = p("node_modules", "next", "dist", "bin", "next");
  const r = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (r.status !== 0) throw new Error("next build gagal");
}

/**
 * Regenerasi artefak skema lokal (SQLite) dari skema PostgreSQL kanonik.
 *
 * Dijalankan di awal build, bukan hanya saat generate manual: kalau skema
 * kanonik berubah, skema SQLite + DDL first-run ikut berubah secara otomatis.
 * Tanpa ini, .exe bisa memuat DDL lama yang tidak cocok dengan kode.
 */
function regenerateLocalSchema() {
  step("Sinkronkan skema SQLite & DDL first-run");
  for (const [script, label] of [
    ["scripts/generate-sqlite-schema.mjs", "skema SQLite"],
    ["scripts/generate-local-ddl.mjs", "DDL first-run"],
  ]) {
    const r = spawnSync(process.execPath, [p(script)], { cwd: root, encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(`gagal membuat ulang ${label}:\n${r.stderr || r.stdout}`);
    }
    log((r.stdout || "").trim());
  }
}

// ---------------------------------------------------------------------------
// 2. Salin direktori (recursive, dengan symlink di-resolve)
// ---------------------------------------------------------------------------
function copyDir(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isSymbolicLink()) {
      // Windows: symlink tidak selalu didukung tanpa Developer Mode → salin target.
      fs.cpSync(fs.realpathSync(src), dst, { recursive: true, dereference: true });
    } else fs.copyFileSync(src, dst);
  }
  return true;
}

// ---------------------------------------------------------------------------
// 3. Verifikasi file wajib (kalau hilang, .exe akan gagal saat dijalankan)
// ---------------------------------------------------------------------------
function assertExists(relPath, hint) {
  const abs = p(relPath);
  if (fs.existsSync(abs)) {
    log(`✓ ${relPath}`);
    return true;
  }
  throw new Error(`File wajib tidak ditemukan: ${relPath}\n  → ${hint}`);
}

/** Cari file berdasarkan pola rekursif (case-insensitive) di dalam satu direktori. */
function findFiles(dir, predicate, limit = 5) {
  const out = [];
  const walk = (d) => {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else if (predicate(e.name)) out.push(abs);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// ---------------------------------------------------------------------------
// 4. Baca .env → default-config.json
// ---------------------------------------------------------------------------
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function writeDefaultConfig() {
  const env = { ...readEnvFile(p(".env")), ...readEnvFile(p(".env.local")) };
  const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL tidak ditemukan (.env / .env.local / environment).\n" +
        "  Isi DATABASE_URL lebih dulu — nilainya akan tertanam sebagai koneksi bawaan di dalam .exe.",
    );
  }
  const cfg = { databaseUrl, host: "127.0.0.1", port: 0 };
  fs.writeFileSync(
    path.join(BUNDLE, "default-config.json"),
    JSON.stringify(cfg, null, 2) + "\n",
    "utf8",
  );
  const masked = databaseUrl.replace(/(:\/\/[^:]+:)([^@]+)@/, "$1****@");
  log(`✓ default-config.json  DATABASE_URL=${masked}`);
}

// ---------------------------------------------------------------------------
// 5. Ikon
// ---------------------------------------------------------------------------
function ensureIcon() {
  const ico = p("build", "icon.ico");
  if (fs.existsSync(ico)) {
    log("✓ build/icon.ico (ada)");
    return;
  }
  const r = spawnSync(process.execPath, [p("scripts", "make-icon.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0 || !fs.existsSync(ico)) {
    throw new Error("Gagal membuat build/icon.ico");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  regenerateLocalSchema();
  if (!SKIP_NEXT_BUILD) runNextBuild();

  step("Siapkan folder build desktop");
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(BUNDLE, { recursive: true });
  log(`folder keluaran: ${path.relative(root, BUNDLE)}`);

  step("Salin server standalone");
  assertExists(".next/standalone/server.js", "Jalankan `next build` lebih dulu.");
  copyDir(p(".next", "standalone"), SERVER_OUT);
  log("✓ .next/standalone → desktop-build/bundle/server");

  // static & public tidak di-trace oleh Next, harus disalin manual.
  copyDir(p(".next", "static"), path.join(SERVER_OUT, ".next", "static"));
  log("✓ .next/static");
  copyDir(p("public"), path.join(SERVER_OUT, "public"));
  log("✓ public");

  // Next menyalin .env ke output standalone. Buang: database URL hanya boleh
  // ada di default-config.json (satu sumber kebenaran) dan selalu dikirim lewat
  // environment proses ke server anak — tidak perlu file di dalam paket.
  for (const f of fs.readdirSync(SERVER_OUT)) {
    if (f === ".env" || f.startsWith(".env.")) {
      fs.rmSync(path.join(SERVER_OUT, f), { force: true });
      log(`− ${f} (buang; koneksi diberikan lewat environment)`);
    }
  }

  step("Verifikasi dependensi native (Prisma / sharp)");
  const prismaDir = path.join(SERVER_OUT, "node_modules", ".prisma", "client");
  const engines = findFiles(prismaDir, (n) => n.endsWith(".node"), 10);
  const winEngine = engines.find((f) => /windows/i.test(f));
  if (!winEngine) {
    throw new Error(
      "Engine Prisma untuk Windows tidak ikut dalam standalone.\n" +
        "  Jalankan ulang `prisma generate` lalu `next build` (pastikan schema.prisma\n" +
        "  punya binaryTargets = [\"native\", \"windows\"] lalu build ulang).",
    );
  }
  log(`✓ Prisma engine: ${path.basename(winEngine)}`);

  const sharpFiles = findFiles(path.join(SERVER_OUT, "node_modules", "@img"), () => true, 2000);
  const sharpWin = sharpFiles.filter((f) => /win32/i.test(f));
  if (sharpWin.length === 0) {
    log("! Peringatan: binding sharp untuk Windows tidak ditemukan (/api/upload akan gagal)");
  } else {
    log(`✓ sharp win32: ${sharpWin.length} file`);
  }

  const depCount = fs.readdirSync(path.join(SERVER_OUT, "node_modules")).length;
  if (depCount === 0) {
    throw new Error(
      "node_modules hasil trace Next kosong — paket server tidak akan jalan.\n" +
        "  Hapus .next lalu jalankan ulang `next build`.",
    );
  }
  log(`✓ node_modules: ${depCount} paket`);

  // Prisma Client SQLite + engine-nya WAJIB ikut paket. Kalau tidak, aplikasi
  // .exe akan gagal saat boot dengan "Cannot find module @serbabisa/prisma-local".
  //
  // Letaknya di node_modules/@serbabisa/prisma-local karena Prisma client
  // menunjuk ke direktori dirinya sendiri; bila di-inline webpack, path absolut
  // mesin build ikut ter-hardcode dan .exe tidak jalan di komputer lain.
  const localClientDir = path.join(SERVER_OUT, "node_modules", "@serbabisa", "prisma-local");
  if (!fs.existsSync(path.join(localClientDir, "index.js"))) {
    throw new Error(
      "Prisma Client SQLite tidak ikut ter-paket " +
        "(node_modules/@serbabisa/prisma-local/index.js hilang).\n" +
        "  Jalankan: prisma generate --schema prisma/schema.sqlite.prisma\n" +
        "  lalu build ulang (tanpa --skip-next-build).",
    );
  }
  const localEngines = findFiles(localClientDir, (n) => n.endsWith(".node"), 10);
  if (localEngines.length === 0) {
    throw new Error(
      "Engine query SQLite untuk Windows tidak ikut ter-paket.\n" +
        "  Jalankan: prisma generate --schema prisma/schema.sqlite.prisma lalu build ulang.",
    );
  }
  log(`✓ Prisma Client SQLite: index.js + ${localEngines.map((f) => path.basename(f)).join(", ")}`);

  // ---------------------------------------------------------------------
  // Pangkas binary untuk platform lain.
  //
  // Aplikasi .exe ini HANYA berjalan di Windows (x64). Tapi output tracing
  // Next menyalin apa adanya semua engine yang ditemukan, termasuk:
  //   - file .tmp* dari `prisma generate` yang terbatalkan / gagal
  //   - engine Linux Prisma (libquery_engine-*.so)
  //   - paket sharp untuk Linux/macOS (@img/sharp-*-(linux|darwin)-*)
  //
  // Pada build terakhir semua itu menambah puluhan MB ke installer untuk
  // file yang TIDAK PERNAH dieksekusi. Kasir mengunduhnya sia-sia.
  //
  // Keamanan prune ini:
  //  1. Dijalankan SETELAH verifikasi engine Windows di atas benar-benar ada
  //  2. Hanya pola yang jelas tidak terpakai di Windows
  //  3. File WASM Prisma SENGAJA TIDAK disentuh: `runtime/library.js` me-require
  //     file itu secara statis, jadi menghapusnya bisa membuat crash
  // ---------------------------------------------------------------------

  // Shared object berversi: `libvips-cpp.so.8.17.3` berakhiran `.3`, bukan
  // `.so`. Pola pertama yang dipakai meleset dan diam-diam membiarkan 32 MB
  // binary Linux ikut ke installer.
  const FOREIGN_BINARY = /(\.tmp\d+|\.so(\.\d+)*|\.dylib)$/;
  // sharp memuat binary per-platform saat runtime
  // (`require(`@img/sharp-libvips-${runtimePlatform}/package`)` di
  // sharp.js), jadi paket non-Windows tidak pernah disentuh di Windows.
  const FOREIGN_SHARP_DIR = /^sharp-.*-(linux|linuxmusl|darwin)-/;

  let prunedBytes = 0;
  let prunedCount = 0;

  const imgDir = path.join(SERVER_OUT, "node_modules", "@img");
  if (fs.existsSync(imgDir)) {
    for (const name of fs.readdirSync(imgDir)) {
      if (!FOREIGN_SHARP_DIR.test(name)) continue;
      const dir = path.join(imgDir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      prunedBytes += du(dir);
      fs.rmSync(dir, { recursive: true, force: true });
      prunedCount++;
    }
  }

  for (const f of findFiles(path.join(SERVER_OUT, "node_modules"), () => true, 100000)) {
    if (!FOREIGN_BINARY.test(path.basename(f))) continue;
    const size = fs.statSync(f).size;
    // Abaikan file kecil: pola .so bisa muncul sebagai teks di dalam paket JS.
    if (size < 256 * 1024) continue;
    fs.rmSync(f, { force: true });
    prunedBytes += size;
    prunedCount++;
  }

  if (prunedCount > 0) {
    const saved = prunedBytes / 1024 / 1024;
    log(
      `✓ pangkas ${prunedCount} binary non-Windows ` +
        `(${saved >= 1 ? saved.toFixed(1) + " MB" : Math.round(prunedBytes / 1024) + " KB"})`,
    );
  } else {
    log("  tidak ada binary non-Windows untuk dipangkas");
  }
  // Guard terakhir: pastikan tidak ada path absolut mesin build yang ikut
  // ter-hardcode di bundle. Ini penyebab aplikasi .exe gagal start di PC lain.
  const chunksDir = path.join(SERVER_OUT, ".next", "server");
  const offenders = [];
  for (const f of findFiles(chunksDir, (n) => n.endsWith(".js"), 100000)) {
    const content = fs.readFileSync(f, "utf8");
    if (content.includes("@serbabisa\\prisma-local") || content.includes("@serbabisa/prisma-local")) {
      // Absolute path Windows ke folder client lokal = belum di-external-kan.
      if (content.includes(root)) offenders.push(path.relative(SERVER_OUT, f));
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      "Ditemukan path absolut mesin build di dalam bundle Prisma SQLite:\n" +
        offenders
          .slice(0, 5)
          .map((f) => `  - ${f}`)
          .join("\n") +
        "\n  .exe akan gagal jalan di komputer lain. Pastikan " +
        '"@serbabisa/prisma-local" ada di serverExternalPackages (next.config.ts) lalu build ulang.',
    );
  }
  log("✓ tidak ada path absolut mesin build di bundle");

  step("Koneksi database bawaan");
  writeDefaultConfig();

  step("Ikon aplikasi");
  ensureIcon();

  const total = du(SERVER_OUT);
  log(`Ukuran paket server: ${(total / 1024 / 1024).toFixed(1)} MB`);
  console.log("\nSelesai. Lanjutkan: npm run desktop:pack (uji) atau npm run desktop:dist (installer + portable)");
}

/** Ukuran folder rekursif (MB). */
function du(dir) {
  let total = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs);
      else {
        try {
          total += fs.statSync(abs).size;
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(dir);
  return total;
}

try {
  main();
} catch (err) {
  console.error("\nGAGAL:", err instanceof Error ? err.message : err);
  process.exit(1);
}
