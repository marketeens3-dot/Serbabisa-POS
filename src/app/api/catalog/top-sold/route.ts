// GET /api/catalog/top-sold — item terlaris 30 hari terakhir (untuk baris cepat
// "Sering dijual" di katalog POS). Hanya item AKTIF & masih ada stok (produk).
// Cache in-memory per tenant 5 menit — data gaya ini tidak butuh segar per detik,
// dan endpoint ini di-poll setiap kali POS dibuka.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'
import { toCatalogItemDTO } from '@/lib/services/serializers'

const CACHE_TTL_MS = 5 * 60 * 1000
const WINDOW_DAYS = 30
const TAKE = 10

type CatalogItemDTO = ReturnType<typeof toCatalogItemDTO>
/** Entri baris "Sering dijual": item + qty terjual bersih 30 hari (untuk badge "N×"). */
type TopSoldEntry = { item: CatalogItemDTO; soldQty: number }
type CacheEntry = { at: number; payload: { data: TopSoldEntry[] } }
const cache = new Map<string, CacheEntry>()

export async function GET() {
  try {
    const { tenantId } = await requireUser()

    const hit = cache.get(tenantId)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return NextResponse.json(hit.payload)
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Qty terjual bersih (dikurangi refund) per item, 30 hari, transaksi selesai.
    const grouped = await db.transactionItem.groupBy({
      by: ['catalogItemId'],
      where: {
        catalogItemId: { not: null },
        transaction: { tenantId, status: 'COMPLETED', createdAt: { gte: since } },
      },
      _sum: { quantity: true, refundedQty: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: TAKE * 2, // ambi lebih banyak sebelum disaring stok/aktif
    })

    const ids = grouped.map((g) => g.catalogItemId).filter((id): id is string => !!id)
    if (!ids.length) {
      const payload = { data: [] as TopSoldEntry[] }
      cache.set(tenantId, { at: Date.now(), payload })
      return NextResponse.json(payload)
    }

    // Hanya item yang masih aktif; produk habis otomatis tersaring (stok > 0).
    const items = await db.catalogItem.findMany({
      where: { tenantId, id: { in: ids }, isActive: true },
      include: { category: { select: { name: true } } },
    })
    const byId = new Map(items.map((i) => [i.id, i]))
    const soldByItem = new Map(grouped.map((g) => [g.catalogItemId as string, g._sum]))

    const data = ids
      .filter((id) => byId.has(id))
      .sort((a, b) => (soldByItem.get(b)?.quantity ?? 0) - (soldByItem.get(a)?.quantity ?? 0))
      .map((id) => byId.get(id)!)
      .filter((item) => item.type === 'SERVICE' || item.stockQty > 0)
      .slice(0, TAKE)
      .map((item) => ({
        item: toCatalogItemDTO(item),
        soldQty: Math.round(((soldByItem.get(item.id)?.quantity ?? 0) - (soldByItem.get(item.id)?.refundedQty ?? 0)) * 1000) / 1000,
      }))

    const payload = { data }
    cache.set(tenantId, { at: Date.now(), payload })
    return NextResponse.json(payload)
  } catch (err) {
    return handleApiError(err)
  }
}
