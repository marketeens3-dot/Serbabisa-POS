// Hardening lanjutan: RLS untuk _prisma_migrations + audit function search_path
// Keamanan: kredensial TIDAK di-hardcode — wajib lewat env DATABASE_URL:
//   bash scripts/with-env.sh node scripts/harden-supabase.js
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL wajib diset. Jalankan: bash scripts/with-env.sh node scripts/harden-supabase.js");
  process.exit(1);
}
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  // 1. _prisma_migrations (tabel internal Prisma di public — juga ter-expose API)
  await db.$executeRawUnsafe(`ALTER TABLE IF EXISTS public."_prisma_migrations" ENABLE ROW LEVEL SECURITY`);
  console.log("RLS AKTIF → _prisma_migrations");

  // 2. Cek function di schema public yang punya search_path mutable (Advisor: "Function search_path mutable")
  const fns = await db.$queryRaw`
    SELECT p.proname AS name, p.prosecdef AS security_definer, l.lanname AS lang,
           COALESCE(p.proconfig, '{}') AS config
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'`;
  if (fns.length === 0) {
    console.log("Tidak ada function custom di schema public ✓");
  } else {
    for (const f of fns) {
      const hasFixedPath = JSON.stringify(f.config).includes("search_path");
      console.log(
        `function ${f.name}() | security_definer=${f.security_definer} | lang=${f.lang} | search_path=${hasFixedPath ? "FIXED ✓" : "MUTABLE ✗"}`
      );
    }
  }

  // 3. Cek schema public: extension/mtv yang biasa masuk daftar Advisor
  const exts = await db.$queryRaw`
    SELECT e.extname AS name FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE n.nspname = 'public'`;
  console.log(exts.length ? "Extension di public: " + exts.map((e) => e.name).join(", ") : "Tidak ada extension di public ✓");
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
