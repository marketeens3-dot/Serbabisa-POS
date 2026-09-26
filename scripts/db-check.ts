/**
 * Cek konektivitas database (ringkas) — dipakai pre-flight sebelum dev/build/packaging.
 * Usage: bun scripts/db-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const counts = await prisma.$transaction([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.catalogItem.count(),
  ]);
  console.log("OK — database terhubung dalam", Date.now() - started, "ms");
  console.log(
    `tenant=${counts[0]} user=${counts[1]} catalogItem=${counts[2]}`,
  );
}

main()
  .catch((e) => {
    console.error("GAGAL konek:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
