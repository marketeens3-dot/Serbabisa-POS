// Forensik: siapa yang mengubah Tenant.phone? Cek audit_logs + tenant row
// Keamanan: kredensial TIDAK di-hardcode — wajib lewat env DATABASE_URL:
//   bash scripts/with-env.sh node scripts/forensic-tenant.js
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL wajib diset. Jalankan: bash scripts/with-env.sh node scripts/forensic-tenant.js");
  process.exit(1);
}
process.env.SERBABISA_DB = "cloud";
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const tenant = await db.tenant.findFirst({
    select: { id: true, businessName: true, phone: true, whatsappNumber: true, address: true, updatedAt: true },
  });
  console.log("=== TENANT SEKARANG ===");
  console.log(JSON.stringify(tenant, null, 2));

  const logs = await db.auditLog.findMany({
    where: { resourceType: "Tenant", action: { in: ["STORE_SETTINGS_UPDATED", "STORE_LOGO_UPDATED", "TENANT_UPDATED"] } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, createdAt: true, metadata: true, actorUserId: true },
  });
  console.log("\n=== 10 AUDIT TERAKHIR (Tenant) ===");
  for (const l of logs) {
    console.log(l.createdAt.toISOString(), "|", l.action, "|", JSON.stringify(l.metadata).slice(0, 200));
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
