// GET /api/dashboard — metrik kasir (agregat SQL, bukan fetch mentah transaksi).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'
import { jakartaDayRange, jakartaMonthRange, lastNDayRanges } from '@/lib/format'
import { toTransactionDTO } from '@/lib/services/serializers'
import type { DashboardMetricsDTO } from '@/lib/types'

export async function GET() {
  try {
    const { tenantId } = await requireUser()
    const today = jakartaDayRange()
    const month = jakartaMonthRange()

    const [todayAgg, todayItemsAgg, monthAgg, lowStockItems, recentTransactions, monthTxCount] = await Promise.all([
      db.transaction.aggregate({
        where: { tenantId, status: 'COMPLETED', createdAt: { gte: today.startUtc, lte: today.endUtc } },
        _count: true,
        _sum: { totalAmount: true, refundedAmount: true },
      }),
      db.transactionItem.aggregate({
        where: {
          transaction: { tenantId, status: 'COMPLETED', createdAt: { gte: today.startUtc, lte: today.endUtc } },
        },
        _sum: { quantity: true, refundedQty: true },
      }),
      db.transaction.aggregate({
        where: { tenantId, status: 'COMPLETED', createdAt: { gte: month.startUtc, lte: month.endUtc } },
        _sum: { totalAmount: true, refundedAmount: true },
      }),
      // Low stock: perbandingan antar-kolom via SQL parameterized (stockQty <= minStockQty).
      // PostgreSQL: boolean literal TRUE (bukan 1) — kompatibel PG & SQLite 3.23+.
      db.$queryRaw<{ id: string; name: string; stockQty: number; minStockQty: number; unit: string }[]>`
        SELECT "id", "name", "stockQty", "minStockQty", "unit" FROM "CatalogItem"
        WHERE "tenantId" = ${tenantId} AND "type" = 'PRODUCT' AND "isActive" = TRUE
          AND "stockQty" <= "minStockQty"
        ORDER BY "stockQty" ASC LIMIT 12`,
      db.transaction.findMany({
        where: { tenantId },
        include: {
          cashier: { select: { fullName: true } },
          customer: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      db.transaction.count({ where: { tenantId, status: 'COMPLETED', createdAt: { gte: month.startUtc, lte: month.endUtc } } }),
    ])

    // Penjualan 7 hari (7 aggregate terindeks, bukan fetch baris) — net-of-refund.
    const ranges = lastNDayRanges(7)
    const salesLast7Days = await Promise.all(
      ranges.map(async (r) => {
        const agg = await db.transaction.aggregate({
          where: { tenantId, status: 'COMPLETED', createdAt: { gte: r.startUtc, lte: r.endUtc } },
          _count: true,
          _sum: { totalAmount: true, refundedAmount: true },
        })
        return { ymd: r.ymd, label: r.label, total: (agg._sum.totalAmount ?? 0) - (agg._sum.refundedAmount ?? 0), count: agg._count }
      })
    )

    // Item terlaris bulan ini (agregat transaction_items per catalog item).
    const monthRanges = jakartaMonthRange()
    const topItemGroups = await db.transactionItem.groupBy({
      by: ['catalogItemId', 'itemType', 'itemNameSnapshot'],
      where: {
        transaction: { tenantId, status: 'COMPLETED', createdAt: { gte: monthRanges.startUtc, lte: monthRanges.endUtc } },
      },
      _sum: { quantity: true, subtotal: true, refundedQty: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    })
    const topItems = topItemGroups.map((g) => ({
      id: g.catalogItemId ?? '',
      name: g.itemNameSnapshot,
      type: g.itemType as 'PRODUCT' | 'SERVICE',
      qty: Math.round(((g._sum.quantity ?? 0) - (g._sum.refundedQty ?? 0)) * 1000) / 1000,
      revenue: g._sum.subtotal ?? 0,
    }))

    const salesTodayNet = (todayAgg._sum.totalAmount ?? 0) - (todayAgg._sum.refundedAmount ?? 0)
    const txToday = todayAgg._count
    const dto: DashboardMetricsDTO = {
      salesToday: salesTodayNet,
      transactionsToday: txToday,
      averageTransaction: txToday > 0 ? Math.round(salesTodayNet / txToday) : 0,
      itemsSoldToday: Math.round(((todayItemsAgg._sum.quantity ?? 0) - (todayItemsAgg._sum.refundedQty ?? 0)) * 1000) / 1000,
      salesThisMonth: (monthAgg._sum.totalAmount ?? 0) - (monthAgg._sum.refundedAmount ?? 0),
      transactionsThisMonth: monthTxCount,
      lowStockCount: lowStockItems.length,
      lowStockItems: lowStockItems.map((i) => ({
        id: i.id,
        name: i.name,
        stockQty: i.stockQty,
        minStockQty: i.minStockQty,
        unit: i.unit,
      })),
      recentTransactions: recentTransactions.map(toTransactionDTO),
      salesLast7Days,
      topItems,
    }
    return NextResponse.json(dto)
  } catch (err) {
    return handleApiError(err)
  }
}
