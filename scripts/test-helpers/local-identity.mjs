/**
 * Helper untuk test offline: menyuntik identitas (tenant + user + katalog)
 * ke database SQLite lokal.
 *
 * Dalam pemakaian nyata, data ini dihasilkan dari AKTIVASI PERTAMA lewat cloud
 * (src/lib/sync/bootstrap.ts) ketika kasir pertama kali login dengan internet.
 * Test ini melewati cloud sepenuhnya agar tidak bergantung pada koneksi.
 *
 * Password di-hash dengan scrypt yang sama persis dengan src/lib/auth.ts.
 */
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../../node_modules/@serbabisa/prisma-local/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

/** scrypt persis seperti hashPassword() di src/lib/auth.ts. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export async function createLocalIdentity(dbFile, { email, password, tenantName }) {
  // DDL dibaca dari modul app agar selalu sama dengan yang dipakai runtime.
  const ddl = await readDdlFromApp();

  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  try {
    // Pastikan skema ada (idempoten).
    const has = await db.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='Tenant'`,
    );
    if (has.length === 0) {
      for (const stmt of splitStatements(ddl)) await db.$executeRawUnsafe(stmt);
    }

    const slug = `offline-${Date.now()}`;
    const tenant = await db.tenant.create({
      data: { businessName: tenantName, slug, currency: "IDR", timezone: "Asia/Jakarta" },
    });
    const user = await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        fullName: "Kasir Offline",
        role: "USER",
        status: "ACTIVE",
        tenantId: tenant.id,
      },
    });
    const category = await db.category.create({
      data: { tenantId: tenant.id, name: "Minuman", normalizedName: "minuman" },
    });
    const item = await db.catalogItem.create({
      data: {
        tenantId: tenant.id,
        type: "PRODUCT",
        name: "Kopi Susu Botol",
        sku: "OFF-1",
        sellingPrice: 18000,
        stockQty: 20,
        minStockQty: 5,
        unit: "pcs",
        categoryId: category.id,
      },
    });
    // Stok awal dicatat sebagai ADJUSTMENT supaya ledger bisa menghitungnya
    // (lihat recomputeStock() di src/lib/sync/engine.ts).
    await db.inventoryMovement.create({
      data: {
        tenantId: tenant.id,
        catalogItemId: item.id,
        movementType: "ADJUSTMENT",
        quantity: 20,
        note: "Stok awal (suntik test)",
      },
    });

    return {
      ok: true,
      detail: `tenant=${tenant.id.slice(0, 8)} user=${user.email} item=${item.name} (stok 20)`,
      tenantId: tenant.id,
      userId: user.id,
      itemId: item.id,
    };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  } finally {
    await db.$disconnect();
  }
}

/** Baca DDL dari modul yang sudah di-build (src/lib/generated/local-schema-ddl.ts). */
async function readDdlFromApp() {
  const { readFileSync } = await import("node:fs");
  const file = path.join(root, "src", "lib", "generated", "local-schema-ddl.ts");
  const src = readFileSync(file, "utf8");
  const m = src.match(/export const LOCAL_SCHEMA_DDL = `([\s\S]*)`\s*$/);
  if (!m) throw new Error("LOCAL_SCHEMA_DDL tidak ditemukan di " + file);
  return m[1].replace(/\\`/g, "`");
}

function splitStatements(ddl) {
  return ddl
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}
