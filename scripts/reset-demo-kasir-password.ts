/**
 * Reset password kasir demo (kasir@demo.local) ke nilai DEMO_KASIR_PASSWORD
 * dari .env — mengembalikan konsistensi dengan konfigurasi seed.
 * Hanya menyentuh akun demo; password tidak pernah dicetak ke output.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();
const EMAIL = "kasir@demo.local";

try {
  const pw = process.env.DEMO_KASIR_PASSWORD?.replace(/^["']|["']$/g, "");
  if (!pw) {
    console.error("DEMO_KASIR_PASSWORD tidak ada di env — batal.");
    process.exit(1);
  }
  const u = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (!u) {
    console.error(`${EMAIL} tidak ditemukan.`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: hashPassword(pw), failedLoginAttempts: 0, lockedUntil: null },
  });
  console.log(`${EMAIL}: password direset ke nilai DEMO_KASIR_PASSWORD (panjang ${pw.length} karakter) + lockout dibuka.`);
} finally {
  await prisma.$disconnect();
}
