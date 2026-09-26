/**
 * Uji cepat: apakah Prisma Client SQLite (node_modules/.prisma-local) benar-benar
 * bisa dipakai â€” membuat tenant, user, katalog, device, blok nota, dan SyncState.
 *
 * Usage: node scripts/probe-local-db.mjs <path-db>
 */
import path from "node:path";
import { PrismaClient } from "../node_modules/@serbabisa/prisma-local/index.js";

const dbPath = process.argv[2] ?? "./probe.db";
const db = new PrismaClient({
  datasources: { db: { url: `file:${path.resolve(dbPath).replace(/\\/g, "/")}` } },
});

async function main() {
  const t = await db.tenant.create({
    data: { businessName: "Toko Offline", slug: `tokoff-${Date.now()}` },
  });
  const u = await db.user.create({
    data: {
      email: `k${Date.now()}@toko.local`,
      passwordHash: "scrypt:salt:hash",
      fullName: "Kasir Offline",
      tenantId: t.id,
    },
  });
  const item = await db.catalogItem.create({
    data: {
      tenantId: t.id,
      type: "PRODUCT",
      name: "Kopi Susu",
      sellingPrice: 15000,
      stockQty: 10,
      sku: "K-1",
    },
  });
  const dev = await db.device.create({ data: { tenantId: t.id, name: "KASIR-PC-01" } });
  const blk = await db.invoiceBlock.create({
    data: { tenantId: t.id, deviceId: dev.id, year: 2026, startSeq: 1, endSeq: 50 },
  });
  const st = await db.syncState.create({
    data: { entity: "CatalogItem", entityId: item.id, dirty: true },
  });

  console.log("tenant   :", t.businessName, t.id.slice(0, 8));
  console.log("user     :", u.email);
  console.log("item     :", item.name, "stok", item.stockQty);
  console.log("device   :", dev.name);
  console.log("blok nota:", `${blk.startSeq}..${blk.endSeq}`);
  console.log("syncState:", st.entity, "dirty=" + st.dirty);
  console.log("\nOK â€” Prisma Client SQLite bekerja penuh (semua model baru termasuk).");
}

main()
  .catch((e) => {
    console.error("GAGAL:", e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
