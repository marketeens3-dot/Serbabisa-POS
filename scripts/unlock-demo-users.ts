/**
 * Buka lockout & reset rate-limit untuk akun demo.
 *
 * Diperlukan setelah pengujian keamanan (lockout 8 gagal / 15 menit), agar
 * akun demo bisa langsung dipakai lagi.
 *
 * Usage: bun scripts/unlock-demo-users.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMAILS = ["kasir@demo.local", "admin@serbabisa.local"];

try {
  const users = await prisma.user.findMany({
    where: { email: { in: EMAILS } },
    select: { id: true, email: true, failedLoginAttempts: true, lockedUntil: true },
  });
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    console.log(
      `  ${u.email}: gagal=${u.failedLoginAttempts} locked=${u.lockedUntil?.toISOString() ?? "-"} -> dibuka`,
    );
  }
  if (users.length === 0) console.log("  (user demo tidak ditemukan)");
} finally {
  await prisma.$disconnect();
}
