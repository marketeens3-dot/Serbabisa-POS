/**
 * Backfill ledger stok untuk katalog yang sudah ada.
 *
 * MASALAH: item produk yang dibuat SEBELUM ledger stok diperkenalkan hanya
 * punya angka di kolom `stockQty`, tanpa movement ADJUSTMENT._since aplikasi
 * local-first, stok dihitung ulang dari InventoryMovement — sehingga item-item
 * itu akan terlihat seperti "stok habis" (atau negatif) setelah sinkronisasi.
 *
 * SOLUSI: catat satu movement ADJUSTMENT sebesar stok saat ini sebagai titik
 * awal. Sesudah itu, ledger item lengkap dan stok aman dihitung ulang.
 *
 * Script ini idempoten: item yang sudah punya ADJUSTMENT dilewati.
 * Aman dijalankan pada database lokal maupun cloud.
 *
 * Usage:
 *   bun scripts/backfill-stock-ledger.ts            # dry-run, tampilkan rencana
 *   bun scripts/backfill-stock-ledger.ts --yes      # eksekusi
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--yes");
const prisma = new PrismaClient();

async function main() {
  const items = await prisma.catalogItem.findMany({
    where: { type: "PRODUCT" },
    select: {
      id: true,
      name: true,
      stockQty: true,
      tenantId: true,
      tenant: { select: { businessName: true } },
      _count: { select: { inventoryMovements: true } },
    },
    orderBy: { name: "asc" },
  });

  // Item yang sudah punya movement ADJUSTMENT tidak perlu apa-apa.
  const anchored = new Set<string>();
  const adjustments = await prisma.inventoryMovement.findMany({
    where: { movementType: "ADJUSTMENT" },
    select: { catalogItemId: true },
    distinct: ["catalogItemId"],
  });
  for (const a of adjustments) anchored.add(a.catalogItemId);

  const targets = items.filter((i) => !anchored.has(i.id));

  console.log(
    `\nTotal item produk: ${items.length}  |  sudah punya ADJUSTMENT: ${anchored.size}  |  perlu backfill: ${targets.length}\n`,
  );

  if (targets.length === 0) {
    console.log("Tidak ada yang perlu dibenahi.\n");
    return;
  }

  let created = 0;
  for (const item of targets) {
    // Titik awal ledger harus stok SEBELUM seluruh movement yang sudah ada.
    //
    // Rumus:  initial = stokSekarang - (jumlah seluruh movement bertanda)
    // Contoh: stok sekarang 92, sudah terjual 8 → initial = 92 + 8 = 100.
    //
    // Kalau anchor diisi dengan stok sekarang (92), penjualan yang sudah
    // tercatat akan DIhitung dua kali dan stok akhirnya salah 8. Versi pertama
    // skrip ini memang begitu, dan langsung terlihat: Air Mineral 600ml
    // seharusnya 92 tapi terbaca 84.
    const movements = await prisma.inventoryMovement.findMany({
      where: { catalogItemId: item.id },
      select: { movementType: true, quantity: true },
    });
    const signed = movements.reduce((sum, m) => {
      const q = Math.abs(m.quantity);
      const delta = m.movementType === "SALE" || m.movementType === "REFUND_RETURN" ? -q : q;
      return sum + delta;
    }, 0);
    const opening = Math.round((item.stockQty - signed) * 1000) / 1000;

    console.log(
      `  ${item.name} (${item.tenant.businessName}) stok=${item.stockQty} ` +
        `movement=${movements.length} (bersih ${signed}) → anchor ${opening}`,
    );
    if (!APPLY) continue;
    if (opening <= 0) continue; // tidak ada stok awal yang perlu dicatat
    await prisma.inventoryMovement.create({
      data: {
        tenantId: item.tenantId,
        catalogItemId: item.id,
        movementType: "ADJUSTMENT",
        quantity: opening,
        note: "Backfill titik awal ledger (scripts/backfill-stock-ledger.ts)",
      },
    });
    created++;
  }

  if (APPLY) {
    console.log(`\n  ${created} movement ADJUSTMENT dibuat.\n`);
  } else {
    console.log("\n  Mode dry-run. Jalankan ulang dengan --yes untuk menerapkan.\n");
  }
}

main()
  .catch((e) => {
    console.error("GAGAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
