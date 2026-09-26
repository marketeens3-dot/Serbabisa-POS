/**
 * Generator: src/lib/generated/local-schema-ddl.ts
 *
 * Menghasilkan DDL SQLite sebagai konstanta string supaya aplikasi bisa
 * membuat database lokalnya sendiri pada first-run TANPA memerlukan Prisma CLI
 * di komputer kasir.
 *
 * Sumber DDL: `prisma migrate diff --from-empty --to-schema-datamodel
 *               prisma/schema.sqlite.prisma --script`
 *
 * Jalankan ulang setelah mengubah skema:
 *   node scripts/generate-local-ddl.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "src", "lib", "generated", "local-schema-ddl.ts");

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const schema = path.join(root, "prisma", "schema.sqlite.prisma");

const res = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    schema,
    "--script",
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      // Prisma tetap menuntut env var walau tidak dipakai untuk DDL SQLite.
      LOCAL_DATABASE_URL:
        process.env.LOCAL_DATABASE_URL ?? "file:./ddl-probe.db",
    },
  },
);

// Prisma menulis diagnostik ke stderr; DDL di stdout.
const ddl = res.stdout ?? "";
if (!/CREATE TABLE/.test(ddl)) {
  console.error("GAGAL membuat DDL:", res.stderr || res.stdout);
  process.exit(1);
}

// Normalisasi: buang blok kosong, jaga komentar sebagai dokumentasi.
const body = ddl
  .replace(/\r\n/g, "\n")
  .split("\n")
  .map((l) => l.replace(/\s+$/, ""))
  .join("\n")
  .trim();

const tableCount = (body.match(/CREATE TABLE/g) || []).length;
const indexCount = (body.match(/CREATE (UNIQUE )?INDEX/g) || []).length;

const file = `// GENERATED oleh scripts/generate-local-ddl.mjs — JANGAN diedit manual.
//
// DDL untuk membuat database SQLite lokal saat first-run. Dipakai oleh
// src/lib/local-db-bootstrap.ts supaya .exe tidak memerlukan Prisma CLI.
// Sumber: prisma/schema.sqlite.prisma (${tableCount} tabel, ${indexCount} index)

/** DDL SQLite lengkap untuk skema aplikasi (kosong → siap pakai). */
export const LOCAL_SCHEMA_DDL = \`${body.replace(/`/g, "\\`")}\`
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, file, "utf8");
console.log(
  `OK  src/lib/generated/local-schema-ddl.ts  (${tableCount} tabel, ${indexCount} index, ${(body.length / 1024).toFixed(1)} KB)`,
);
