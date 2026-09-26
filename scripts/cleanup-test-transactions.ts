/**
 * Bersihkan seluruh data uji yang dibuat oleh skrip verifikasi.
 *
 * Menghapus seluruh transaksi non-seed beserta item nota dan movement stoknya,
 * lalu menghitung ulang stok dari ledger. Transaksi hasil `prisma/seed.ts`
 * (4 nota pertama) tidak disentuh.
 *
 * Usage:
 *   bun scripts/cleanup-test-transactions.ts           # dry-run
 *   bun scripts/cleanup-test-transactions.ts --yes
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--yes");

/** Jumlah transaksi hasil seed yang harus tersisa. */
const SEED_COUNT = 4;

const db = new PrismaClient();

/** Transaksi uji = semua di luar 4 nota seed, atau yang punya idempotencyKey. */
async function findTestTransactions() {
  const all = await db.transaction.findMany({
    select: {
      id: true,
      invoiceNumber: true,
      createdAt: true,
      tenant: { select: { businessName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  // Buang 4 nota seed (paling awal per tenant).
  const seen = new Map<string, number>();
  const keep = new Set<string>();
  for (const t of all) {
    const n = (seen.get(t.tenant.businessName) ?? 0) + 1;
    seen.set(t.tenant.businessName, n);
    if (n <= SEED_COUNT) keep.add(t.id);
  }
  return all.filter((t) => !keep.has(t.id));
}

/** Hitung ulang stok satu tenant dari ledger (hanya item bertanda ADJUSTMENT). */
async function recomputeStockFor(tenantId: string, label: string) {
  const anchored = new Set<string>();
  for (const a of await db.inventoryMovement.findMany({
    where: { tenantId, movementType: "ADJUSTMENT" },
    select: { catalogItemId: true },
    distinct: ["catalogItemId"],
  })) {
    anchored.add(a.catalogItemId);
  }
  if (anchored.size === 0) return;

  const items = await db.catalogItem.findMany({
    where: { tenantId, id: { in: [...anchored] } },
    select: { id: true, name: true, stockQty: true },
  });
  for (const item of items) {
    const movements = await db.inventoryMovement.findMany({
      where: { catalogItemId: item.id },
      select: { movementType: true, quantity: true },
    });
    const total = movements.reduce((sum, m) => {
      const q = Math.abs(m.quantity);
      return sum + (m.movementType === "SALE" || m.movementType === "REFUND_RETURN" ? -q : q);
    }, 0);
    const next = Math.round(total * 1000) / 1000;
    if (next !== item.stockQty) {
      await db.catalogItem.update({ where: { id: item.id }, data: { stockQty: next } });
      console.log(`  stok ${label} / ${item.name}: ${item.stockQty} -> ${next}`);
    }
  }
}

async function main() {
  const targets = await findTestTransactions();

  console.log(`\nTransaksi uji ditemukan: ${targets.length}`);
  for (const t of targets) {
    console.log(
      `  ${t.invoiceNumber.padEnd(22)} ${t.tenant.businessName.padEnd(14)} ${t._count.items} item  ${t.createdAt.toISOString()}`,
    );
  }
  if (targets.length === 0) {
    console.log("  (tidak ada transaksi yang perlu dihapus)");
  }

  if (!APPLY) {
    console.log("\n  Mode dry-run. Jalankan ulang dengan --yes untuk menghapus.\n");
    return;
  }

  if (targets.length > 0) {
    const ids = targets.map((t) => t.id);
    const tenantIds = [...new Set(targets.map((t) => t.tenant.businessName))];

    // Item nota dulu, lalu movement (FK ke Transaction), lalu transaksinya.
    const itemCount = await db.transactionItem.deleteMany({ where: { transactionId: { in: ids } } });
    const mvCount = await db.inventoryMovement.deleteMany({ where: { transactionId: { in: ids } } });
    const txCount = await db.transaction.deleteMany({ where: { id: { in: ids } } });

    console.log(
      `\n  terhapus: ${txCount.count} transaksi, ${itemCount.count} baris nota, ${mvCount.count} movement stok`,
    );

    for (const label of tenantIds) {
      const t = await db.tenant.findFirst({ where: { businessName: label }, select: { id: true } });
      if (t) await recomputeStockFor(t.id, label);
    }
  }

  // Sisa artefak pengujian: perangkat & blok invoice yang dibuat oleh
  // test-sync (masing-masing simulasikan satu desktop).
  //
  // Aman dihapus: tidak ada Transaction yang menunjuk ke Device, dan
  // InvoiceBlock cascade dari Device. Perangkat nyata akan mendaftar ulang
  // otomatis pada sinkronisasi berikutnya.
  const deviceCount = await db.device.count();
  const blockCount = await db.invoiceBlock.count();
  const syncCount = await db.syncState.count();
  if (deviceCount > 0 || blockCount > 0 || syncCount > 0) {
    await db.invoiceBlock.deleteMany({});
    await db.device.deleteMany({});
    await db.syncState.deleteMany({});
    console.log(
      `  terhapus: ${deviceCount} perangkat, ${blockCount} blok invoice, ${syncCount} state sinkron`,
    );
  }

  // Reset lockout / percobaan gagal supaya akun demo langsung bisa dipakai.
  const reset = await db.user.updateMany({
    where: { OR: [{ failedLoginAttempts: { gt: 0 } }, { lockedUntil: { not: null } }] },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  if (reset.count > 0) {
    console.log(`  direset: ${reset.count} akun (percobaan gagal + lockout)`);
  }

  console.log();
}

main()
  .catch((e) => {
    console.error("GAGAL:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
