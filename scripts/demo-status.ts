/**
 * Ringkasan data demo — memastikan isi database tetap seperti semula.
 *
 * Dipakai setelah menjalankan test suite, karena beberapa pengujian membuat dan
 * membatalkan transaksi. Tujuannya: memastikan kasir yang memakai data demo
 * tidak menemukan tumpukan transaksi uji.
 *
 * Usage: bun scripts/demo-status.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Transaksi hasil `prisma/seed.ts`. */
const SEED_COUNT = 4;

try {
  const tenants = await db.tenant.findMany({
    select: {
      id: true,
      businessName: true,
      _count: { select: { users: true, catalogItems: true, customers: true, transactions: true } },
    },
    orderBy: { businessName: "asc" },
  });

  console.log(`\nTenant: ${tenants.length}`);
  for (const t of tenants) {
    console.log(
      `  ${t.businessName.padEnd(16)} user=${t._count.users} item=${t._count.catalogItems} ` +
        `pelanggan=${t._count.customers} nota=${t._count.transactions}` +
        (t._count.transactions > SEED_COUNT
          ? `   <- PERHATIAN: ada ${t._count.transactions - SEED_COUNT} nota di atas ${SEED_COUNT} seed`
          : ""),
    );
  }

  const users = await db.user.findMany({
    select: { email: true, role: true, status: true, failedLoginAttempts: true, lockedUntil: true },
    orderBy: { email: "asc" },
  });
  console.log(`\nUser: ${users.length}`);
  for (const u of users) {
    const locked = u.lockedUntil ? `TERKUNCI s/d ${u.lockedUntil.toISOString().slice(11, 16)}` : "-";
    console.log(
      `  ${u.email.padEnd(26)} ${u.role.padEnd(12)} ${u.status.padEnd(8)} gagal=${u.failedLoginAttempts} ${locked}`,
    );
  }

  const items = await db.catalogItem.findMany({
    where: { type: "PRODUCT" },
    select: { name: true, stockQty: true, minStockQty: true, sellingPrice: true },
    orderBy: { name: "asc" },
  });
  console.log(`\nStok produk: ${items.length}`);
  for (const i of items) {
    const low = i.stockQty <= i.minStockQty ? "  (menipis)" : "";
    console.log(`  ${i.name.padEnd(26)} stok=${String(i.stockQty).padStart(7)} harga=${i.sellingPrice}${low}`);
  }

  // Blok invoice: memastikan tidak ada blok yang bentrok antar perangkat.
  const blocks = await db.invoiceBlock.findMany({
    select: { startSeq: true, endSeq: true, year: true, deviceId: true },
    orderBy: { startSeq: "asc" },
  });
  console.log(`\nBlok invoice: ${blocks.length}`);
  for (const b of blocks) {
    console.log(`  tahun=${b.year} ${b.startSeq}..${b.endSeq}  device=${b.deviceId.slice(0, 8)}`);
  }

  const orphanDevices = await db.device.count();
  const orphanSync = await db.syncState.count();
  console.log(`\nDevice: ${orphanDevices}   SyncState: ${orphanSync}`);
  console.log();
} finally {
  await db.$disconnect();
}
