/**
 * Probe konkurensi SQLite lokal.
 *
 * Menguji apa yang sebenarnya terjadi di aplikasi desktop: banyak permintaan
 * (baca + tulis) berjalan bersamaan ke satu file SQLite. Tanpa WAL +
 * busy_timeout yang benar, Prisma melaporkan
 * "Socket timeout (the database failed to respond to a query)".
 *
 * Usage: node scripts/probe-sqlite-concurrency.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "../node_modules/@serbabisa/prisma-local/index.js";

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sb-sqlite-")), "probe.db");
const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });

async function pragma(name) {
  const rows = await db.$queryRawUnsafe(`PRAGMA ${name};`);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function main() {
  console.log(`\n▸ Probe konkurensi SQLite\n  file: ${dbFile}\n`);

  // Skema minimal yangrepresentatif (tabel dengan PK + indeks).
  await db.$executeRawUnsafe(
    `CREATE TABLE "Probe" ("id" TEXT NOT NULL PRIMARY KEY, "n" INTEGER NOT NULL, "v" TEXT, "updatedAt" DATETIME NOT NULL);`,
  );

  console.log("▸ Prasyarat (sebelum PRAGMA)");
  console.log(`  journal_mode = ${await pragma("journal_mode")}`);
  console.log(`  busy_timeout = ${await pragma("busy_timeout")}`);

  console.log("\n▸ Setelah PRAGMA (meniru src/lib/local-db-bootstrap.ts)");
  // $queryRawUnsafe, bukan $executeRawUnsafe — PRAGMA journal_mode mengembalikan
  // hasil dan Prisma menolaknya lewat execute. Inilah bug yang membuat WAL
  // tidak pernah aktif di versi pertama.
  for (const sql of [
    "PRAGMA journal_mode = WAL;",
    "PRAGMA busy_timeout = 10000;",
    "PRAGMA synchronous = NORMAL;",
    "PRAGMA foreign_keys = ON;",
  ]) {
    try {
      await db.$queryRawUnsafe(sql);
    } catch (e) {
      console.log(`  ! ${sql} gagal: ${e.message.split("\n")[0]}`);
    }
  }
  console.log(`  journal_mode = ${await pragma("journal_mode")}`);
  console.log(`  busy_timeout = ${await pragma("busy_timeout")}`);
  console.log(`  foreign_keys = ${await pragma("foreign_keys")}`);

  // Beban realistis: 60 pembaca + 20 penulis bersamaan.
  console.log("\n▸ Beban: 60 pembaca + 20 penulis bersamaan");
  const started = Date.now();
  const work = [];
  for (let i = 0; i < 60; i++) {
    work.push(
      db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "Probe";`).then((r) => r),
    );
  }
  for (let i = 0; i < 20; i++) {
    work.push(
      db.$executeRawUnsafe(
        `INSERT INTO "Probe" ("id","n","v","updatedAt") VALUES (?, ?, 'x', ?);`,
        `p${i}-${i}`, i, new Date().getTime(),
      ).catch((e) => ({ error: e.message })),
    );
  }
  const results = await Promise.all(work);
  const errors = results.filter((r) => r && r.error);
  const elapsed = Date.now() - started;

  const count = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "Probe";`);
  console.log(`  selesai dalam ${elapsed} ms`);
  console.log(`  baris tersimpan: ${count[0].c}/20`);
  console.log(`  error: ${errors.length}`);
  for (const e of errors.slice(0, 3)) console.log(`    - ${e.error}`);

  // Ulangi TANPA PRAGMA sebagai pembanding, supaya nilai PRAGMAny berarti.
  console.log("\n▸ Pembanding: file baru TANPA PRAGMA");
  const dbFile2 = path.join(path.dirname(dbFile), "probe2.db");
  const db2 = new PrismaClient({ datasources: { db: { url: `file:${dbFile2.replace(/\\/g, "/")}` } } });
  await db2.$executeRawUnsafe(
    `CREATE TABLE "Probe" ("id" TEXT NOT NULL PRIMARY KEY, "n" INTEGER NOT NULL, "v" TEXT, "updatedAt" DATETIME NOT NULL);`,
  );
  const started2 = Date.now();
  const work2 = [];
  for (let i = 0; i < 60; i++) work2.push(db2.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM "Probe";`));
  for (let i = 0; i < 20; i++) {
    work2.push(
      db2.$executeRawUnsafe(
        `INSERT INTO "Probe" ("id","n","v","updatedAt") VALUES (?, ?, 'x', ?);`,
        `q${i}`, i, new Date().getTime(),
      ).catch((e) => ({ error: e.message })),
    );
  }
  const res2 = await Promise.all(work2);
  const err2 = res2.filter((r) => r && r.error);
  console.log(`  selesai dalam ${Date.now() - started2} ms, error: ${err2.length}`);
  for (const e of err2.slice(0, 3)) console.log(`    - ${e.error}`);
  await db2.$disconnect();

  // COUNT dari SQLitedikembalikan Prisma sebagai BigInt → coerce ke Number.
  const stored = Number(count[0].c);
  const ok = errors.length === 0 && stored === 20;
  console.log(`\n  ${ok ? "✓" : "✗"} ${ok ? "PRAGMA diperlukan & cukup" : "masalah konkurensi tersisa"}\n`);
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("GAGAL:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
