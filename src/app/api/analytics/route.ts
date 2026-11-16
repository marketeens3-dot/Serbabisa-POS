// GET /api/analytics — analitik penjualan (Tier 2):
//   - Best seller: per produk (qty, revenue, margin estimasi dari HPP)
//   - Slow moving: produk berstok yang tidak terjual dalam periode
//   - Jam ramai: distribusi transaksi & pendapatan per jam (30 hari terakhir)
//   - Mix metode pembayaran
// Query param: days (default 30).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'
import { JAKARTA_TZ, lastNDayRanges } from '@/lib/format'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const days = Math.min(180, Math.max(7, Number(url.searchParams.get('days')) || 30))
    const ranges = lastNDayRanges(days)
    const periodStart = ranges[0].startUtc
    const periodEnd = ranges[ranges.length - 1].endUtc
    const completedWhere = { tenantId, status: 'COMPLETED', createdAt: { gte: periodStart, lte: periodEnd } }

    const [items, catalogRows, txRows, paymentMix] = await Promise.all([
      db.transactionItem.findMany({
        where: { transaction: completedWhere },
        select: {
          catalogItemId: true,
          itemNameSnapshot: true,
          itemType: true,
          quantity: true,
          subtotal: true,
          catalogItem: { select: { costPrice: true, sellingPrice: true } },
        },
      }),
      db.catalogItem.findMany({
        where: { tenantId, type: 'PRODUCT', isActive: true },
        select: { id: true, name: true, stockQty: true, sellingPrice: true, costPrice: true, unit: true },
      }),
      db.transaction.findMany({
        where: completedWhere,
        select: { createdAt: true, paymentMethod: true, totalAmount: true },
      }),
      db.transaction.groupBy({
        by: ['paymentMethod'],
        where: completedWhere,
        _count: true,
        _sum: { totalAmount: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
      }),
    ])

    // ---------- BEST SELLER & MARGIN ----------
    const byItem = new Map<string, { name: string; qty: number; revenue: number; cost: number; type: string }>()
    for (const it of items) {
      const key = it.catalogItemId ?? it.itemNameSnapshot
      const prev = byItem.get(key) ?? { name: it.itemNameSnapshot, qty: 0, revenue: 0, cost: 0, type: it.itemType }
      prev.qty += it.quantity
      prev.revenue += it.subtotal
      prev.cost += Math.round(it.quantity * (it.catalogItem?.costPrice ?? 0))
      byItem.set(key, prev)
    }
    const bestSellers = [...byItem.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((v) => ({ ...v, margin: v.revenue - v.cost }))

    // ---------- SLOW MOVING ----------
    const soldIds = new Set(items.map((i) => i.catalogItemId).filter(Boolean) as string[])
    const slowMovers = catalogRows
      .filter((c) => !soldIds.has(c.id))
      .sort((a, b) => b.stockQty * b.costPrice - a.stockQty * a.costPrice)
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        name: c.name,
        stockQty: c.stockQty,
        unit: c.unit,
        stockValue: Math.round(c.stockQty * c.costPrice),
      }))

    // ---------- JAM RAMAI (timezone Jakarta) ----------
    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }))
    for (const tx of txRows) {
      const hour = Number(new Intl.DateTimeFormat('en-CA', { timeZone: JAKARTA_TZ, hour: '2-digit', hour12: false }).format(tx.createdAt))
      const bucket = hourBuckets[hour % 24]
      bucket.count += 1
      bucket.revenue += tx.totalAmount
    }

    return NextResponse.json({
      period: { days, start: periodStart.toISOString(), end: periodEnd.toISOString() },
      bestSellers,
      slowMovers,
      peakHours: hourBuckets.filter((b) => b.count > 0 || (b.hour >= 7 && b.hour <= 23)),
      paymentMix: paymentMix.map((p) => ({
        method: p.paymentMethod,
        count: p._count,
        total: p._sum.totalAmount ?? 0,
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
