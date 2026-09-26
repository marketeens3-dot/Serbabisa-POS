/**
 * Generator skema SQLite dari skema PostgreSQL kanonik.
 *
 * Aplikasi berjalan LOCAL-FIRST: runtime memakai SQLite (file di %APPDATA%),
 * sementara Supabase adalah salinan bersama + identitas. Prisma mengunci
 * `provider` di waktu generate, jadi butuh DUA Prisma Client — yang berarti
 * DUA berkas skema.
 *
 * Daripada menyalin skema secara manual (pasti melenceng), file ini membaca
 * prisma/schema.prisma lalu MENGGANTI HANYA blok `datasource db { ... }`.
 * Seluruh model, relasi, dan index dijamin identik.
 *
 * Famous: prisma/schema.prisma       → PostgreSQL (kanonik,diedit manusia)
 * Output: prisma/schema.sqlite.prisma → SQLite   (generated, JANGAN diedit)
 *
 * Usage:
 *   node scripts/generate-sqlite-schema.mjs           → tulis + generate client + verifikasi
 *   node scripts/generate-sqlite-schema.mjs --check   → hanya verifikasi (exit 1 bila melenceng)
 *   node scripts/generate-sqlite-schema.mjs --no-generate → hanya tulis berkas skema
 *
 * `--no-generate` tersedia karena `prisma generate` memakan waktu 5-10 detik,
 * sementara mode `--check` hanya perlu membandingkan teks.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL = path.join(root, "prisma", "schema.prisma");
const SQLITE = path.join(root, "prisma", "schema.sqlite.prisma");

const CHECK_ONLY = process.argv.includes("--check");
const SKIP_GENERATE = process.argv.includes("--no-generate");

/** Blok datasource PostgreSQL yang diganti. */
const PG_DATASOURCE = /datasource db \{\s*provider\s*=\s*"postgresql"\s*url\s*=\s*env\("DATABASE_URL"\)\s*\}/;

const SQLITE_DATASOURCE = `// GENERATED dari prisma/schema.prisma — JANGAN diedit manual.
// Jalankan: node scripts/generate-sqlite-schema.mjs
datasource db {
  provider = "sqlite"
  // Path absolut diisi saat runtime oleh src/lib/db.ts (libsql-ish file lokal).
  // Nilai di bawah hanya placeholder agar "prisma generate" tidak gagal.
  url      = env("LOCAL_DATABASE_URL")
}`;

/** Generator block juga harus diganti agar client SQLite punya output sendiri. */
const PG_GENERATOR = /generator client \{\s*provider\s*=\s*"prisma-client-js"[\s\S]*?\n\}/;

const SQLITE_GENERATOR = `generator client {
  provider = "prisma-client-js"
  // Client kedua: runtime lokal (SQLite). Sengaja output terpisah supaya
  // @prisma/client tetap khusus PostgreSQL (dipakai sync engine).
  //
  // Output DI DALAM node_modules sebagai paket bernama, dengan alasan penting:
  // Prisma membangkitkan client yang menunjuk ke direktori dirinya sendiri.
  // Kalau output-nya di luar node_modules (mis. generated/prisma-local), Next.js
  // menganggapnya KODE SUMBER lalu meng-inline-nya ke dalam bundle — hasilnya
  // path absolut mesin build ikut ter-hardcode, dan .exe tidak akan jalan di
  // komputer lain. Berada di node_modules membuat Next.js mengecualikannya
  // (serverExternalPackages di next.config.ts) dan output tracing ikut
  // menyalin foldernya ke paket standalone.
  output   = "../node_modules/@serbabisa/prisma-local"
  binaryTargets = ["native", "windows"]
}`;

function transform(source) {
  if (!PG_DATASOURCE.test(source)) {
    throw new Error(
      "Blok `datasource db` tidak ditemukan di prisma/schema.prisma.\n" +
        "  Generator ini bergantung pada bentuk persis:\n" +
        '  datasource db {\n    provider = "postgresql"\n    url      = env("DATABASE_URL")\n  }',
    );
  }
  if (!PG_GENERATOR.test(source)) {
    throw new Error("Blok `generator client` tidak ditemukan di prisma/schema.prisma.");
  }
  return source.replace(PG_GENERATOR, SQLITE_GENERATOR).replace(PG_DATASOURCE, SQLITE_DATASOURCE);
}

/** Normalisasi untuk perbandingan: buang komentar & whitespace yang tidak berarti. */
function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trimEnd())
    .filter((l) => l.trim() !== "")
    .join("\n")
    .trim();
}

function main() {
  const source = fs.readFileSync(CANONICAL, "utf8");
  const expected = transform(source);

  if (CHECK_ONLY) {
    if (!fs.existsSync(SQLITE)) {
      console.error("GAGAL: prisma/schema.sqlite.prisma belum ada. Jalankan tanpa --check.");
      process.exit(1);
    }
    const actual = fs.readFileSync(SQLITE, "utf8");
    if (normalize(actual) !== normalize(expected)) {
      console.error(
        "GAGAL: prisma/schema.sqlite.prisma melenceng dari prisma/schema.prisma.\n" +
          "  Jalankan: node scripts/generate-sqlite-schema.mjs",
      );
      process.exit(1);
    }
    console.log("OK  prisma/schema.sqlite.prisma sinkron dengan skema kanonik");
    return;
  }

  fs.writeFileSync(SQLITE, expected, "utf8");
  const modelCount = (source.match(/^model /gm) || []).length;
  console.log(
    `OK  prisma/schema.sqlite.prisma  (${modelCount} model, ${expected.split("\n").length} baris)`,
  );
  if (!SKIP_GENERATE) generateLocalClient();
}

/**
 * Bangun Prisma Client SQLite ke node_modules/@serbabisa/prisma-local.
 *
 * Ini bagian WAJIB dari langkah generate, bukan perintah terpisah yang harus
 * diingat pemakai. Tanpa client-nya, `next build` gagal me-resolve
 * "@serbabisa/prisma-local" dan aplikasi .exe tidak bisa boot. Karena
 * `postinstall` hanya meng-generate client PostgreSQL (benar untuk Vercel),
 * clone baru akan rusak tanpa gejala sampai detik build. Kasus itu sudah
 * pernah terjadi di mesin ini: build .exe hanya berhasil karena client-nya
 * di-generate manual di luar script.
 */
function generateLocalClient() {
  // CLI dipanggil lewat berkas JS-nya sendiri, bukan lewat `node_modules/.bin`.
  // Alasan: isi .bin berbeda tiap package manager — npm membuat `prisma.cmd`,
  // bun membuat `prisma.exe` + `prisma.bunx`. Kalau script ini bergantung pada
  // salah satu nama itu, ia hanya akan bekerja di mesin yang kebetulan memakai
  // package manager yang sama.
  const pkgPath = path.join(root, "node_modules", "prisma", "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      "Paket `prisma` tidak ditemukan di node_modules.\n" +
        "  Jalankan `npm install` lebih dulu.",
    );
  }
  const binField = JSON.parse(fs.readFileSync(pkgPath, "utf8")).bin;
  const rel = typeof binField === "string" ? binField : binField?.prisma;
  const cli = path.join(root, "node_modules", "prisma", rel || "build/index.js");
  if (!fs.existsSync(cli)) {
    throw new Error(`Entry point Prisma CLI tidak ditemukan: ${cli}`);
  }

  const r = spawnSync(process.execPath, [cli, "generate", "--schema", "prisma/schema.sqlite.prisma"], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(
      "prisma generate untuk skema SQLite gagal:\n" + (r.stderr || r.stdout || ""),
    );
  }
  console.log("OK  Prisma Client SQLite  (node_modules/@serbabisa/prisma-local)");
}

try {
  main();
} catch (err) {
  console.error("GAGAL:", err instanceof Error ? err.message : err);
  process.exit(1);
}
