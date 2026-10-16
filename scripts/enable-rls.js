// Aktifkan RLS di SEMUA tabel public Supabase (menutup Advisor "RLS Disabled in Public")
//
// Latar: aplikasi TIDAK PERNAH memakai PostgREST/anon key — akses data hanya lewat
// Prisma sebagai role `postgres` (pemilik tabel, melewati RLS kecuali FORCE RLS).
// Karena itu mengaktifkan RLS TANPA policy = aman untuk aplikasi (pemilik tetap
// akses penuh) sekaligus menutup total akses anon/authenticated via REST API.
// JANGAN pakai FORCE RLS (akan membuat pemilik ikut terkena policy → app rusak).
process.env.DATABASE_URL =
  "postgresql://postgres.ckraoqmhpjcferjdcdrm:Ihsanneo%40_78@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=disable";
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  // 1. Daftar semua tabel base di schema public (kecuali tabel internal Supabase)
  const tables = await db.$queryRaw`
    SELECT tablename AS name
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma_migrations%'
    ORDER BY tablename`;
  console.log(`Ditemukan ${tables.length} tabel di schema public:`);
  tables.forEach((t) => console.log("  -", t.name));

  // 2. Aktifkan RLS satu per satu (idempoten: IF NOT supported → cek dulu statusnya)
  let enabled = 0;
  let already = 0;
  for (const t of tables) {
    const status = await db.$queryRaw`
      SELECT c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ${t.name}`;
    if (status[0]?.rls) {
      already++;
      continue;
    }
    await db.$executeRawUnsafe(
      `ALTER TABLE public."${t.name.replace(/"/g, '""')}" ENABLE ROW LEVEL SECURITY`
    );
    enabled++;
    console.log("  RLS AKTIF →", t.name);
  }
  console.log(`\nRingkasan: ${enabled} tabel baru diaktifkan RLS, ${already} sudah aktif.`);

  // 3. Verifikasi akhir: tidak ada lagi tabel public tanpa RLS
  const remaining = await db.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = false`;
  console.log(
    remaining.length === 0
      ? "VERIFIKASI: SEMUA tabel public kini RLS-enabled ✓ (Advisor issue teratasi)"
      : `MASIH TANPA RLS: ${remaining.map((r) => r.tablename).join(", ")}`
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
