// GET /api/reports — laporan periode (Laporan): ringkasan + item terlaris + metode pembayaran.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, requireUser } from '@/lib/api'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const dateFrom = url.searchParams.get('dateFrom')?.trim()
    const dateTo = url.searchParams.get('dateTo')?.trim()
    if (!dateFrom || !dateTo) throw new ApiError('INVALID_INPUT', 'Rentang tanggal wajib dipilih.', 422)
    if (dateFrom > dateTo) throw new ApiError('INVALID_INPUT', 'Tanggal awal melebihi tanggal akhir.', 422)

    const gte = new Date(`${dateFrom}T00:00:00+07:00`)
    const lte = new Date(`${dateTo}T23:59:59.999+07:00`)
    const where = { tenantId, createdAt: { gte, lte } }

    const [agg, voidAgg, refundedAgg, byMethod, topItems, daily] = await Promise.all([
      db.transaction.aggregate({ where: { ...where, status: 'COMPLETED' }, _count: true, _sum: { totalAmount: true, discountAmount: true, refundedAmount: true } }),
      db.transaction.count({ where: { ...where, status: 'VOID' } }),
      db.transaction.count({ where: { ...where, status: 'REFUNDED' } }),
      db.transaction.groupBy({ by: ['paymentMethod'], where: { ...where, status: 'COMPLETED' }, _count: true, _sum: { totalAmount: true, refundedAmount: true } }),
      db.transactionItem.groupBy({
        by: ['catalogItemId', 'itemType', 'itemNameSnapshot'],
        where: { transaction: { ...where, status: 'COMPLETED' } },
        _sum: { quantity: true, subtotal: true, refundedQty: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
      // Raw SQL Postgres-native: to_char utk grup harian (SQLite substr tidak ada di PG);
      // parameter tanggal dikirim sebagai Date (Prisma encode → timestamp), bukan string.
      // CAST ::int — SUM()/COUNT() PG mengembalikan bigint (BigInt di JS → gagal di JSON).
      db.$queryRaw<{ ymd: string; total: number; count: number }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD') as ymd, COALESCE(SUM("totalAmount" - "refundedAmount"), 0)::int as total, COUNT(*)::int as count
        FROM "Transaction"
        WHERE "tenantId" = ${tenantId} AND "status" = 'COMPLETED'
          AND "createdAt" >= ${gte} AND "createdAt" <= ${lte}
        GROUP BY to_char("createdAt", 'YYYY-MM-DD')
        ORDER BY ymd ASC`,
    ])

    // Net revenue = total - refund (transaksi REFUNDED penuh otomatis keluar karena status bukan COMPLETED).
    const completedTotal = (agg._sum.totalAmount ?? 0) - (agg._sum.refundedAmount ?? 0)

    return NextResponse.json({
      period: { dateFrom, dateTo },
      summary: {
        completedCount: agg._count,
        completedTotal,
        totalDiscount: agg._sum.discountAmount ?? 0,
        voidCount: voidAgg,
        refundedCount: refundedAgg,
        average: agg._count > 0 ? Math.round(completedTotal / agg._count) : 0,
      },
      byMethod: byMethod.map((m) => ({ method: m.paymentMethod, count: m._count, total: (m._sum.totalAmount ?? 0) - (m._sum.refundedAmount ?? 0) })),
      topItems: topItems.map((t) => ({
        id: t.catalogItemId ?? '',
        name: t.itemNameSnapshot,
        type: t.itemType,
        qty: Math.round(((t._sum.quantity ?? 0) - (t._sum.refundedQty ?? 0)) * 1000) / 1000,
        revenue: t._sum.subtotal ?? 0,
      })),
      daily: daily.map((d) => ({ ymd: d.ymd, total: d.total, count: d.count })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
