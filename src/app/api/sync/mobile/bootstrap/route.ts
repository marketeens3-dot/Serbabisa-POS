// GET /api/sync/mobile/bootstrap — paket data awal untuk perangkat HP.
//
// Satu permintaan untuk semua data yang dibutuhkan layar kasir. Alasannya HP
// sering berada di jaringan seluler yang mahal dan lambat; mengambilnya satu
// per satu berarti belasan round-trip saat kasir sedang menunggu.
//
// Mengembalikan: profil pengguna, tenant, kategori, produk, pelanggan, dan
// template nota — semuanya tenant-scoped dari session, tidak pernah lintas toko.
//
// Klien mengambil halaman penuh setelah ini.
import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { requireUser, handleApiError, ApiError } from '@/lib/api'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Batas baris per koleksi — cukup untuk Toko Ritel; di atas ini pakai paginasi. */
const LIMIT = 2000

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sesi berakhir.' }, { status: 401 })
    }
    // Hanya kasir (USER) yang punya toko. Super Admin tidak punya data transaksi.
    const { tenantId } = await requireUser()

    const [tenant, categories, products, customers, templates, transactions] = await Promise.all([
      db.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true, businessName: true, slug: true, phone: true, whatsappNumber: true,
          address: true, logoUrl: true, currency: true, timezone: true, invoiceSettings: true,
        },
      }),
      db.category.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        take: LIMIT,
        select: { id: true, name: true, isActive: true },
      }),
      db.catalogItem.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        take: LIMIT,
        select: {
          id: true, type: true, name: true, sku: true, barcode: true, categoryId: true,
          costPrice: true, sellingPrice: true, stockQty: true, minStockQty: true,
          unit: true, isActive: true, updatedAt: true,
          category: { select: { name: true } },
        },
      }),
      db.customer.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
        take: LIMIT,
        select: { id: true, name: true, phone: true, address: true, isActive: true, updatedAt: true },
      }),
      db.invoiceTemplate.findMany({
        where: { tenantId },
        orderBy: { isDefault: 'desc' },
        take: 20,
        select: { id: true, name: true, config: true, isDefault: true },
      }),
      // Transaksi terbaru. Tanpa ini tab Riwayat di HP akan selalu kosong,
      // karena cache lokal hanya berisi nota yang dibuat di perangkat itu.
      // Batas 200 nota: cukup untuk kebutuhan kasir, dan payload tetap wajar
      // untuk jaringan seluler.
      db.transaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true, invoiceNumber: true, subtotal: true, discountAmount: true, taxAmount: true,
          totalAmount: true, paidAmount: true, changeAmount: true, paymentMethod: true,
          status: true, refundedAmount: true, createdAt: true, customerId: true, notes: true,
          items: {
            select: {
              id: true, itemNameSnapshot: true, skuSnapshot: true,
              quantity: true, unitPrice: true, subtotal: true,
            },
            orderBy: { itemNameSnapshot: 'asc' },
          },
        },
      }),
    ])

    if (!tenant) {
      throw new ApiError('NO_TENANT', 'Data toko tidak ditemukan.', 404)
    }

    return NextResponse.json({
      serverTime: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      tenant,
      categories,
      products: products.map((p) => ({ ...p, categoryName: p.category?.name ?? null })),
      customers,
      templates,
      // Cache lokal di perangkat memakai bentuk yang sudah diratakan di sini;
      // kolom snake_case dari database tidak pernah sampai ke perangkat.
      transactions: transactions.map((t) => ({
        id: t.id,
        invoiceNumber: t.invoiceNumber,
        subtotal: t.subtotal,
        discountAmount: t.discountAmount,
        taxAmount: t.taxAmount,
        totalAmount: t.totalAmount,
        paidAmount: t.paidAmount,
        changeAmount: t.changeAmount,
        paymentMethod: t.paymentMethod,
        status: t.status,
        refundedAmount: t.refundedAmount,
        createdAt: t.createdAt.toISOString(),
        customerId: t.customerId,
        notes: t.notes,
        items: t.items.map((i) => ({
          id: i.id,
          name: i.itemNameSnapshot,
          sku: i.skuSnapshot,
          quantity: i.quantity,
          price: i.unitPrice,
          subtotal: i.subtotal,
        })),
      })),
      truncated: {
        categories: categories.length >= LIMIT,
        products: products.length >= LIMIT,
        customers: customers.length >= LIMIT,
        transactions: transactions.length >= 200,
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
