/**
 * Bootstrap Super Admin (server-side script) — DEVELOPMENT ONLY default.
 * Kredensial TIDAK di-hardcode di source: dibaca dari environment.
 *   SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 * Jika password tidak disediakan, password acak digenerate dan dicetak SATU KALI.
 *
 * Menjalankan: bun run scripts/bootstrap-super-admin.ts
 */
import { PrismaClient } from '@prisma/client'
import { hashPassword, generateTemporaryPassword } from '../src/lib/auth'

const db = new PrismaClient()

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase()
  const password = process.env.SUPER_ADMIN_PASSWORD ?? ''
  if (!email) {
    console.error('[bootstrap] SUPER_ADMIN_EMAIL wajib diisi (env).')
    process.exitCode = 1
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    console.error('[bootstrap] SUPER_ADMIN_EMAIL tidak valid.')
    process.exitCode = 1
    return
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role === 'SUPER_ADMIN') {
      console.log(`[bootstrap] Super admin sudah ada: ${email} — tidak diubah.`)
      return
    }
    // Promosikan akun existing menjadi SUPER_ADMIN (aksi disengaja, tercatat di audit).
    await db.user.update({ where: { id: existing.id }, data: { role: 'SUPER_ADMIN', status: 'ACTIVE' } })
    await db.auditLog.create({
      data: {
        actorUserId: existing.id,
        action: 'USER_UPDATED',
        resourceType: 'User',
        resourceId: existing.id,
        metadata: JSON.stringify({ promoted: 'SUPER_ADMIN', source: 'bootstrap-script' }),
      },
    })
    console.log(`[bootstrap] Akun ${email} dipromosikan menjadi SUPER_ADMIN.`)
    return
  }

  let finalPassword = password
  if (!password) {
    finalPassword = generateTemporaryPassword() + 'aA' // pastikan memenuhi kebijakan
    console.log('[bootstrap] SUPER_ADMIN_PASSWORD tidak di-set → password acak dibuat.')
    console.log('[bootstrap] PASSWORD SEMENTARA (tampil sekali saja, wajib diganti saat login pertama):')
    console.log(`[bootstrap]   >>> ${finalPassword} <<<`)
  }

  await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(finalPassword),
      fullName: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      mustChangePassword: !password,
      tenantId: null,
    },
  })
  await db.auditLog.create({
    data: {
      action: 'USER_CREATED',
      resourceType: 'User',
      metadata: JSON.stringify({ email, role: 'SUPER_ADMIN', source: 'bootstrap-script' }),
    },
  })
  console.log(`[bootstrap] Super admin dibuat: ${email}`)
}

main()
  .catch((e) => {
    console.error('[bootstrap] GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
