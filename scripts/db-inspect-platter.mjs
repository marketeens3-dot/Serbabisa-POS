// Inspeksi data per tenant (hanya baca) — siap-siap kosongkan transaksi Platter Tea.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const tenants = await db.tenant.findMany({
  select: { id: true, businessName: true, slug: true, isActive: true, createdAt: true },
})
console.log('=== TENANTS ===')
console.log(JSON.stringify(tenants, null, 2))

for (const t of tenants) {
  const [txCount, itemCount, mvTxCount, mvAdjCount, openSessions, closedSessions, userCount, deviceCount] =
    await Promise.all([
      db.transaction.count({ where: { tenantId: t.id } }),
      db.transactionItem.count({ where: { transaction: { tenantId: t.id } } }),
      db.inventoryMovement.count({ where: { tenantId: t.id, transactionId: { not: null } } }),
      db.inventoryMovement.count({ where: { tenantId: t.id, transactionId: null } }),
      db.cashSession.count({ where: { tenantId: t.id, status: 'OPEN' } }),
      db.cashSession.count({ where: { tenantId: t.id, status: 'CLOSED' } }),
      db.user.count({ where: { tenantId: t.id } }),
      db.device.count({ where: { tenantId: t.id } }),
    ])
  const last3 = await db.transaction.findMany({
    where: { tenantId: t.id },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { invoiceNumber: true, createdAt: true, status: true, totalAmount: true },
  })
  console.log(`\n=== ${t.businessName} (${t.slug}) ===`)
  console.log(JSON.stringify({ txCount, itemCount, mvTxCount, mvAdjCount, openSessions, closedSessions, userCount, deviceCount, last3 }, null, 2))
}

console.log('\n=== USERS (tanpa hash) ===')
const users = await db.user.findMany({
  select: { email: true, role: true, status: true, tenantId: true, mustChangePassword: true, lockedUntil: true, lastLoginAt: true },
})
console.log(JSON.stringify(users, null, 2))

const counters = await db.invoiceCounter.findMany()
console.log('\n=== INVOICE COUNTERS ===')
console.log(JSON.stringify(counters, null, 2))

await db.$disconnect()
