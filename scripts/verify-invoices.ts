/**
 * Verifikasi invoice & integritas data di cloud.
 *
 * Dipakai setelah menjalankan skrip review / desktop smoke test, karena
 * pengujian itu membuat transaksi sungguhan di database cloud.
 *
 * Yang diperiksa:
 *   1. Nomor nota duplikat (halaman yang tidak boleh terjadi)
 *   2. Stok = jumlah movement (ledger konsisten)
 *   3. Transaksi tanpa item / item tanpa transaksi
 *
 * Usage: bun scripts/verify-invoices.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Transaksi hasil `prisma/seed.ts`. */
const SEED_COUNT = 4;

try {
  // 1. Nomor nota duplikat.
  const dupes = await db.$queryRawUnsafe<Array<{ invoiceNumber: string; c: bigint }>>(
    `SELECT "invoiceNumber", COUNT(*)::bigint AS c
       FROM "Transaction"
      GROUP BY "invoiceNumber"
     HAVING COUNT(*) > 1
      ORDER BY c DESC`,
  );
  if (dupes.length === 0) {
    console.log("OK  tidak ada nomor nota duplikat");
  } else {
    console.log(`GAGAL ada ${dupes.length} nomor nota duplikat:`);
    for (const d of dupes.slice(0, 10)) console.log(`  ${d.invoiceNumber} x${d.c}`);
  }

  // 2. Konsistensi stok terhadap ledger.
  // Hanya item bertanda ADJUSTMENT yang dihitung ulang: item tanpa anchor
  // tidak punya titik awal yang bisa dipercaya.
  const anchored = await db.inventoryMovement.findMany({
    where: { movementType: "ADJUSTMENT" },
    select: { catalogItemId: true },
    distinct: ["catalogItemId"],
  });
  const ids = anchored.map((a) => a.catalogItemId);
  if (ids.length === 0) {
    console.log("OK  tidak ada item bertanda ADJUSTMENT untuk diperiksa");
  } else {
    const items = await db.catalogItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, stockQty: true },
    });
    let bad = 0;
    for (const item of items) {
      const movements = await db.inventoryMovement.findMany({
        where: { catalogItemId: item.id },
        select: { movementType: true, quantity: true },
      });
      const total = movements.reduce((sum, m) => {
        const q = Math.abs(m.quantity);
        return sum + (m.movementType === "SALE" || m.movementType === "REFUND_RETURN" ? -q : q);
      }, 0);
      const expected = Math.round(total * 1000) / 1000;
      if (Math.abs(expected - item.stockQty) > 0.001) {
        console.log(`  GAGAL stok ${item.name}: tercatat ${item.stockQty}, ledger ${expected}`);
        bad++;
      }
    }
    if (bad === 0) console.log(`OK  stok ${items.length} item cocok dengan ledger`);
  }

  // 3. Transaksi tanpa item (indikasi sinkronisasi terpotong).
  // `createdAt` harus masuk GROUP BY: PostgreSQL menolak kolom non-aggregate
  // di ORDER BY hasil agregasi.
  const empty = await db.$queryRawUnsafe<Array<{ invoiceNumber: string; createdAt: Date }>>(
    `SELECT t."invoiceNumber", MAX(t."createdAt") AS "createdAt"
       FROM "Transaction" t
       LEFT JOIN "TransactionItem" i ON i."transactionId" = t.id
      GROUP BY t."invoiceNumber"
     HAVING COUNT(i.id) = 0
      ORDER BY MAX(t."createdAt") DESC`,
  );
  if (empty.length === 0) {
    console.log("OK  semua transaksi punya minimal satu item");
  } else {
    console.log(`PERHATIAN ${empty.length} transaksi tanpa item:`);
    for (const e of empty.slice(0, 10)) console.log(`  ${e.invoiceNumber}`);
  }

  // 4. Ringkasan.
  const tenants = await db.tenant.findMany({
    select: { businessName: true, _count: { select: { transactions: true } } },
  });
  console.log(`\nRingkasan: ${tenants.length} tenant`);
  for (const t of tenants) {
    const extra = t._count.transactions - SEED_COUNT;
    console.log(
      `  ${t.businessName}: ${t._count.transactions} nota` +
        (extra > 0 ? ` (${extra} di atas ${SEED_COUNT} seed -> sisa pengujian)` : ""),
    );
  }

  const devices = await db.device.count();
  const blocks = await db.invoiceBlock.count();
  console.log(`  perangkat: ${devices}   blok invoice: ${blocks}`);

  const blockOverlap = await db.$queryRawUnsafe<Array<{ a: string; b: string }>>(
    `SELECT x."deviceId" AS a, y."deviceId" AS b
       FROM "InvoiceBlock" x, "InvoiceBlock" y
      WHERE x."tenantId" = y."tenantId"
        AND x.year = y.year
        AND x.id <> y.id
        AND x."startSeq" <= y."endSeq"
        AND y."startSeq" <= x."endSeq"
      LIMIT 5`,
  );
  console.log(
    blockOverlap.length === 0
      ? "  blok invoice: tidak ada yang saling tumpang tindih"
      : `  PERHATIAN: ${blockOverlap.length} blok invoice tumpang tindih!`,
  );
  console.log();
} finally {
  await db.$disconnect();
}
