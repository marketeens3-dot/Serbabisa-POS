/**
 * Seed DEVELOPMENT ONLY — data demo fiktif untuk Serbabisa.
 * Idempoten: dilewati bila super admin / demo tenant sudah ada.
 * Password demo TIDAK untuk production — ganti via env.
 *
 * Menjalankan: bun run prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { hashPassword } from '../src/lib/password'
import { createTenantWithTemplates, parseInvoiceSettings } from '../src/lib/services/tenant'
import { BUILTIN_TEMPLATE_PRESETS } from '../src/lib/invoice'

const db = new PrismaClient()

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL ?? 'admin@serbabisa.local').toLowerCase()
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'Serbabisa#2026'
const DEMO_KASIR_EMAIL = 'kasir@demo.local'
const DEMO_KASIR_PASSWORD = process.env.DEMO_KASIR_PASSWORD ?? 'Kasir#2026'

async function main() {
  // 1) Super Admin
  const existingAdmin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  if (existingAdmin) {
    console.log(`[seed] Super admin sudah ada: ${existingAdmin.email} — dilewati.`)
  } else {
    await db.user.create({
      data: {
        email: SUPER_ADMIN_EMAIL,
        passwordHash: hashPassword(SUPER_ADMIN_PASSWORD),
        fullName: 'Super Admin Serbabisa',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        tenantId: null,
      },
    })
    await db.auditLog.create({
      data: {
        action: 'USER_CREATED',
        resourceType: 'User',
        metadata: JSON.stringify({ email: SUPER_ADMIN_EMAIL, role: 'SUPER_ADMIN', source: 'seed' }),
      },
    })
    console.log(`[seed] Super admin dibuat: ${SUPER_ADMIN_EMAIL} (DEVELOPMENT ONLY)`)
  }

  // 2) Demo tenant + kasir
  const existingKasir = await db.user.findUnique({ where: { email: DEMO_KASIR_EMAIL } })
  if (existingKasir) {
    console.log(`[seed] Demo kasir sudah ada: ${DEMO_KASIR_EMAIL} — dilewati.`)
  } else {
    const tenant = await db.$transaction(async (tx) => {
      const created = await createTenantWithTemplates(tx, {
        businessName: 'Demo Store',
        phone: '628123456000',
        whatsappNumber: '628123456000',
        address: 'Jl. Contoh Alamat No. 1, Jakarta',
      })
      await tx.user.create({
        data: {
          email: DEMO_KASIR_EMAIL,
          passwordHash: hashPassword(DEMO_KASIR_PASSWORD),
          fullName: 'Kasir Demo',
          phone: '628123456001',
          role: 'USER',
          status: 'ACTIVE',
          tenantId: created.id,
          mustChangePassword: false,
        },
      })
      await tx.auditLog.create({
        data: {
          action: 'TENANT_CREATED',
          resourceType: 'Tenant',
          resourceId: created.id,
          metadata: JSON.stringify({ businessName: 'Demo Store', source: 'seed' }),
        },
      })
      await tx.auditLog.create({
        data: {
          action: 'USER_CREATED',
          resourceType: 'User',
          tenantId: created.id,
          metadata: JSON.stringify({ email: DEMO_KASIR_EMAIL, role: 'USER', source: 'seed' }),
        },
      })
      return created
    })
    console.log(`[seed] Demo tenant dibuat: Demo Store (id ${tenant.id})`)
    console.log(`[seed] Kasir demo dibuat: ${DEMO_KASIR_EMAIL} (DEVELOPMENT ONLY)`)

    // 3) Kategori, produk, jasa, pelanggan demo (data fiktif)
    const catMinuman = await db.category.create({
      data: { tenantId: tenant.id, name: 'Minuman', normalizedName: 'minuman' },
    })
    const catMakanan = await db.category.create({
      data: { tenantId: tenant.id, name: 'Makanan', normalizedName: 'makanan' },
    })
    const catJasa = await db.category.create({
      data: { tenantId: tenant.id, name: 'Jasa Bengkel', normalizedName: 'jasa bengkel' },
    })

    const airMineral = await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'PRODUCT', name: 'Air Mineral 600ml', sku: 'AIR-600',
        barcode: '8991002101234', categoryId: catMinuman.id, costPrice: 2000, sellingPrice: 5000,
        stockQty: 100, minStockQty: 20, unit: 'pcs',
      },
    })
    const kopi = await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'PRODUCT', name: 'Kopi Susu Botol', sku: 'KPI-250',
        barcode: '8991002200117',
        categoryId: catMinuman.id, costPrice: 12000, sellingPrice: 18000,
        stockQty: 40, minStockQty: 10, unit: 'pcs',
      },
    })
    const snack = await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'PRODUCT', name: 'Snack Kentang', sku: 'SNK-100',
        barcode: '8991003300220',
        categoryId: catMakanan.id, costPrice: 6500, sellingPrice: 10000,
        stockQty: 8, minStockQty: 10, unit: 'pcs',
      },
    })
    await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'SERVICE', name: 'Jasa Servis Ringan', sku: 'JSA-SRV',
        categoryId: catJasa.id, sellingPrice: 50000, stockQty: 0, minStockQty: 0, unit: 'jasa',
      },
    })
    await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'SERVICE', name: 'Jasa Cuci Motor', sku: 'JSA-CUCI',
        categoryId: catJasa.id, sellingPrice: 25000, stockQty: 0, minStockQty: 0, unit: 'jasa',
      },
    })
    await db.catalogItem.create({
      data: {
        tenantId: tenant.id, type: 'SERVICE', name: 'Jasa Konsultasi', sellingPrice: 75000,
        stockQty: 0, minStockQty: 0, unit: 'sesi',
      },
    })

    const demoCustomer = await db.customer.create({
      data: {
        tenantId: tenant.id, name: 'Pelanggan Demo', phone: '628123456789',
        email: 'pelanggan.demo@example.local', address: 'Jl. Pelanggan No. 9, Jakarta',
        notes: 'Pelanggan contoh untuk demo.',
      },
    })

    // 4) Contoh transaksi (3 nota: hari ini, kemarin, 2 hari lalu)
    const kasir = (await db.user.findUnique({ where: { email: DEMO_KASIR_EMAIL } }))!
    const t = tenant.id
    const samples: { daysAgo: number; lines: { item: string; qty: number }[]; payment: string }[] = [
      { daysAgo: 2, lines: [{ item: airMineral.id, qty: 2 }, { item: snack.id, qty: 1 }], payment: 'CASH' },
      { daysAgo: 1, lines: [{ item: kopi.id, qty: 3 }, { item: snack.id, qty: 2 }], payment: 'QRIS' },
      { daysAgo: 0, lines: [{ item: airMineral.id, qty: 5 }, { item: kopi.id, qty: 2 }], payment: 'CASH' },
    ]
    const year = new Date().getFullYear()
    let lastNumber = 0
    for (const sample of samples) {
      lastNumber += 1
      const items = await Promise.all(
        sample.lines.map(async (line) => {
          const item = await db.catalogItem.findUniqueOrThrow({ where: { id: line.item } })
          const subtotal = Math.round(line.qty * item.sellingPrice)
          return {
            catalogItemId: item.id,
            itemType: item.type,
            itemNameSnapshot: item.name,
            skuSnapshot: item.sku,
            quantity: line.qty,
            unitPrice: item.sellingPrice,
            subtotal,
          }
        })
      )
      const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
      const createdAt = new Date(Date.now() - sample.daysAgo * 24 * 3600 * 1000 - 3600 * 1000)
      const created = await db.transaction.create({
        data: {
          tenantId: t,
          customerId: lastNumber === 1 ? demoCustomer.id : null,
          cashierId: kasir.id,
          invoiceNumber: `INV-${year}-${String(lastNumber).padStart(6, '0')}`,
          subtotal,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount: subtotal,
          paidAmount: subtotal,
          changeAmount: 0,
          paymentMethod: sample.payment,
          status: 'COMPLETED',
          createdAt,
          items: { create: items },
        },
      })
      // Kurangi stok produk + catat mutasi (konsisten dengan perilaku kasir).
      for (const line of sample.lines) {
        const item = await db.catalogItem.findUniqueOrThrow({ where: { id: line.item } })
        if (item.type === 'PRODUCT') {
          await db.catalogItem.update({ where: { id: item.id }, data: { stockQty: { decrement: line.qty } } })
          await db.inventoryMovement.create({
            data: {
              tenantId: t, catalogItemId: item.id, transactionId: created.id,
              movementType: 'SALE', quantity: line.qty,
            },
          })
        }
      }
      await db.auditLog.create({
        data: {
          actorUserId: kasir.id, tenantId: t, action: 'TRANSACTION_CREATED',
          resourceType: 'Transaction', resourceId: created.id,
          metadata: JSON.stringify({ invoiceNumber: created.invoiceNumber, totalAmount: subtotal, source: 'seed' }),
        },
      })
    }
    await db.invoiceCounter.create({ data: { tenantId: t, year, lastNumber } })
    console.log(`[seed] ${samples.length} transaksi contoh dibuat.`)
  }

  const counts = {
    users: await db.user.count(),
    tenants: await db.tenant.count(),
    catalogItems: await db.catalogItem.count(),
    transactions: await db.transaction.count(),
    invoiceTemplates: await db.invoiceTemplate.count(),
  }
  console.log('[seed] Ringkasan database:', counts)
  console.log('[seed] Login demo (DEVELOPMENT ONLY):')
  console.log(`        Super Admin → ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`)
  console.log(`        Kasir       → ${DEMO_KASIR_EMAIL} / ${DEMO_KASIR_PASSWORD}`)
  void parseInvoiceSettings
  void BUILTIN_TEMPLATE_PRESETS
  void randomUUID
}

main()
  .catch((e) => {
    console.error('[seed] GAGAL:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
