// Kosongkan transaksi tenant Platter Tea (platter-tea-2) — DENGAN BACKUP dulu.
// Hapus: InventoryMovement terkait transaksi → Transaction (items cascade).
// Reset: InvoiceCounter.lastNumber = 0 (aman: tanpa device, tanpa blok nomor).
// KEEP:  produk, kategori, pelanggan, penyesuaian stok manual (movement tanpa tx),
//        template nota, pengaturan toko, audit log, akun user.
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'

const db = new PrismaClient()
const TENANT_ID = 'da160730-b20a-4b8f-a11e-8dd6f7b7d1f1' // Platter Tea (platter-tea-2) — tenant aktif milik user

const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID } })
if (!tenant) throw new Error('Tenant tidak ditemukan')
console.log('Target:', tenant.businessName, `(${tenant.slug})`)

// ---------- 1. BACKUP ----------
const [transactions, movements] = await Promise.all([
  db.transaction.findMany({
    where: { tenantId: TENANT_ID },
    include: { items: true },
    orderBy: { createdAt: 'asc' },
  }),
  db.inventoryMovement.findMany({ where: { tenantId: TENANT_ID, transactionId: { not: null } } }),
])
const backup = {
  exportedAt: new Date().toISOString(),
  purpose: 'Backup sebelum pengosongan transaksi Platter Tea (permintaan user)',
  tenant: { id: tenant.id, businessName: tenant.businessName, slug: tenant.slug },
  transactions,
  transactionLinkedMovements: movements,
}
const out = `/home/z/my-project/download/platter-tea-transactions-backup-${new Date().toISOString().slice(0, 10)}.json`
writeFileSync(out, JSON.stringify(backup, null, 2))
console.log(`Backup tersimpan: ${out} (${transactions.length} transaksi, ${movements.length} mutasi stok)`)

if (transactions.length === 0 && movements.length === 0) {
  console.log('Tidak ada yang perlu dihapus.')
  await db.$disconnect()
  process.exit(0)
}

// ---------- 2. HAPUS (urutan aman FK) ----------
const txIds = transactions.map((t) => t.id)
const delMov = await db.inventoryMovement.deleteMany({ where: { id: { in: movements.map((m) => m.id) } } })
console.log('Mutasi stok terkait transaksi dihapus:', delMov.count)
const delTx = await db.transaction.deleteMany({ where: { id: { in: txIds }, tenantId: TENANT_ID } })
console.log('Transaksi dihapus:', delTx.count)

// ---------- 3. RESET nomor invoice ----------
const counter = await db.invoiceCounter.updateMany({ where: { tenantId: TENANT_ID }, data: { lastNumber: 0 } })
console.log('InvoiceCounter direset:', counter.count, 'baris → lastNumber = 0')

// ---------- 4. VERIFIKASI ----------
const [txAfter, itemAfter, mvAfter, adjAfter, counterAfter] = await Promise.all([
  db.transaction.count({ where: { tenantId: TENANT_ID } }),
  db.transactionItem.count({ where: { transaction: { tenantId: TENANT_ID } } }),
  db.inventoryMovement.count({ where: { tenantId: TENANT_ID, transactionId: { not: null } } }),
  db.inventoryMovement.count({ where: { tenantId: TENANT_ID, transactionId: null } }),
  db.invoiceCounter.findMany({ where: { tenantId: TENANT_ID } }),
])
console.log('VERIFIKASI →', JSON.stringify({ txAfter, itemAfter, mvAfter, adjAfter, counterAfter }))
await db.$disconnect()
