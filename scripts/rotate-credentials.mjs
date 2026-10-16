// Rotasi password akun demo/seed di database CLOUD + cabut semua sesi aktifnya.
// Password baru dibaca dari env (SUPER_ADMIN_PASSWORD / DEMO_KASIR_PASSWORD) —
// nilai tidak pernah di-hardcode atau di-log.
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password.ts'

const db = new PrismaClient()

const targets = [
  { email: 'admin@serbabisa.local', envKey: 'SUPER_ADMIN_PASSWORD' },
  { email: 'kasir@demo.local', envKey: 'DEMO_KASIR_PASSWORD' },
]

for (const t of targets) {
  const password = process.env[t.envKey]
  if (!password || password.length < 12) {
    console.error(`[rotate] ENV ${t.envKey} wajib diisi (min 12 karakter).`)
    process.exit(1)
  }
  const user = await db.user.findUnique({ where: { email: t.email } })
  if (!user) {
    console.log(`[rotate] ${t.email} tidak ditemukan — lewati.`)
    continue
  }
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(password), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
  })
  const revoked = await db.session.deleteMany({ where: { userId: user.id } })
  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      tenantId: user.tenantId,
      action: 'PASSWORD_ROTATED',
      resourceType: 'User',
      metadata: JSON.stringify({ email: user.email, source: 'security-hardening', revokedSessions: revoked.count }),
    },
  })
  console.log(`[rotate] ${t.email} → password diperbarui, sesi dicabut: ${revoked.count}`)
}

await db.$disconnect()
