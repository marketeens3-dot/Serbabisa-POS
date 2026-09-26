/**
 * Hook resolusi modul untuk Node — membuat skrip operasional bisa jalan tanpa Bun.
 *
 * MASALAH YANG DISELESAIKAN
 * -------------------------
 * Kode aplikasi memakai alias `@/lib/...` (standar Next.js, diatur di tsconfig.json).
 * Next.js/Webpack/Mekanisma memah thereof secara otomatis, tapi Node TIDAK. Akibatnya
 * skrip yang mengimpor kode aplikasi — `prisma/seed.ts` dan
 * `scripts/bootstrap-super-admin.ts` — hanya bisa jalan di Bun, yang menghormati
 * `compilerOptions.paths` sekaligus menambah ekstensi otomatis.
 *
 * Hook ini menutup dua celah sekaligus:
 *   1. alias `@/...`  → dipetakan ke `src/...`
 *   2. impor relatif/absolute TANPA ekstensi (`../src/lib/password`) → dicoba dengan
 *      `.ts`, `.tsx`, `.js`, lalu `/index.ts` — perilaku yang sama dengan Bun/Webpack
 *
 * Pemakaian:
 *   node --import ./scripts/alias-hook.mjs prisma/seed.ts
 *
 * Sengaja tanpa dependency baru. `registerHooks` tersedia di Node 22.15+, dan type
 * stripping bawaan Node 22.18+ membuat berkas .ts bisa diimpor langsung.
 *
 * CATATAN: ini HANYA untuk skrip Node. Build Next.js tetap memakai webpack/Turbopack
 * + tsconfig paths seperti biasa, dan file ini tidak ikut ke sana.
 */
import { registerHooks } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "src");

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".cjs"];

/** Cari berkas yang benar untuk sebuah path tanpa ekstensi. */
function resolveFile(target) {
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(target + ext)) return target + ext;
  }
  for (const ext of EXTENSIONS) {
    const idx = path.join(target, "index" + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return null;
}

/** Direktori dari parentURL modul yang sedang mengimpor. */
function dirOf(parentURL) {
  if (!parentURL || !parentURL.startsWith("file:")) return root;
  return path.dirname(fileURLToPath(parentURL));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 1. Alias gaya Next.js.
    if (specifier.startsWith("@/")) {
      const file = resolveFile(path.join(srcDir, specifier.slice(2)));
      if (file) return nextResolve(pathToFileURL(file).href, context);
      // Jangan jatuh diam-diam ke node_modules: lebih baik error yang menyebut
      // alias bermasalah.
      throw new Error(
        `Alias tidak ditemukan: ${specifier}\n` +
          `  Dicoba: src/${specifier.slice(2)}{${EXTENSIONS.join(",")},index.ts}\n` +
          `  Periksa tsconfig.json paths.`,
      );
    }

    // 2. Path relatif/absolute tanpa ekstensi. Node ESM mewajibkan ekstensi
    //    eksplisit; Bun dan bundler tidak.
    if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
      const bare = specifier.startsWith(".") ? path.resolve(dirOf(context.parentURL), specifier) : specifier;
      // Sudah berekstensi? biarkan resolution bawaan yang menangani.
      if (!path.extname(bare)) {
        const file = resolveFile(bare);
        if (file) return nextResolve(pathToFileURL(file).href, context);
      }
    }

    return nextResolve(specifier, context);
  },
});
