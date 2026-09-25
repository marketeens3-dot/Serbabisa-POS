// GET /api/catalog/stock-alerts — ringkasan produk stok menipis untuk badge
// navigasi (bottom nav "Menu" + item Produk di drawer + dashboard). Jauh lebih
// ringan daripada /api/dashboard (tanpa agregasi transaksi). Cache in-memory
// per tenant 2 menit — endpoint ini dimuat setiap kali app dibuka.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'

const CACHE_TTL_MS = 2 * 60 * 1000
const TAKE = 30

/** Entri ringkas untuk badge & kartu peringatan stok. */
export type StockAlertEntry = {
  id: string
  name: string
  stockQty: number
  minStockQty: number
  unit: string
}

type CacheEntry = { at: number; payload: { data: StockAlertEntry[]; count: number } }
const cache = new Map<string, CacheEntry>()

export async function GET() {
  try {
    const { tenantId } = await requireUser()

    const hit = cache.get(tenantId)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload)
    }

    // Produk aktif dengan stok <= ambang minimum, paling kritis di atas.
    const [rows, count] = await Promise.all([
      db.catalogItem.findMany({
        where: {
          tenantId,
          type: 'PRODUCT',
          isActive: true,
          stockQty: { lte: db.catalogItem.fields.minStockQty },
        },
        select: { id: true, name: true, stockQty: true, minStockQty: true, unit: true },
        orderBy: [{ stockQty: 'asc' }, { name: 'asc' }],
        take: TAKE,
      }),
      db.catalogItem.count({
        where: {
          tenantId,
          type: 'PRODUCT',
          isActive: true,
          stockQty: { lte: db.catalogItem.fields.minStockQty },
        },
      }),
    ])

    const payload = { data: rows, count }
    cache.set(tenantId, { at: Date.now(), payload })
    return NextResponse.json(payload)
  } catch (err) {
    return handleApiError(err)
  }
}
