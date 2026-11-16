// GET /api/finance-dashboard — agregat keuangan untuk dashboard Tier 1:
//   - Kas masuk/keluar periode (POS tunai + cashflow manual/otomatis) + grafik 14 hari
//   - RAB aktif: anggaran vs realisasi
//   - Piutang & hutang beredar + jatuh tempo
//   - Laba kotor estimasi (penjualan − HPP) per periode
//   - Top pengeluaran per kategori
// Query param: days (default 30) untuk rentang periode.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'
import { jakartaDayRange, lastNDayRanges } from '@/lib/format'
import { DEBT_TYPES } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days')) || 30))
    const now = new Date()

    // Periode = N hari terakhir versi Jakarta.
    const ranges = lastNDayRanges(days, now)
    const periodStart = ranges[0].startUtc
    const periodEnd = jakartaDayRange(now).endUtc
    const chartDays = ranges.slice(-14)

    const completedWhere = { tenantId, status: 'COMPLETED', createdAt: { gte: periodStart, lte: periodEnd } }

    const [
      posSalesAgg,
      posCashAgg,
      cfInAgg,
      cfOutAgg,
      cfByCategory,
      chartRows,
      activeProjects,
      recAgg,
      recOverdue,
      payAgg,
      profitRows,
      todaySales,
    ] = await Promise.all([
      // Penjualan POS periode ini (semua metode, sudah dikurangi refund)
      db.transaction.aggregate({
        where: completedWhere,
        _sum: { totalAmount: true, refundedAmount: true },
        _count: true,
      }),
      // Penjualan tunai (uang riil di kas)
      db.transaction.aggregate({
        where: { ...completedWhere, paymentMethod: 'CASH' },
        _sum: { totalAmount: true, refundedAmount: true },
      }),
      db.cashflowEntry.aggregate({
        where: { tenantId, direction: 'IN', entryDate: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
      }),
      db.cashflowEntry.aggregate({
        where: { tenantId, direction: 'OUT', entryDate: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
      }),
      db.cashflowEntry.groupBy({
        by: ['category'],
        where: { tenantId, direction: 'OUT', entryDate: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Grafik harian: penjualan tunai + cashflow masuk/keluar per hari (14 hari)
      Promise.all(
        chartDays.map(async (d) => {
          const [cashAgg, inAgg, outAgg] = await Promise.all([
            db.transaction.aggregate({
              where: { tenantId, status: 'COMPLETED', paymentMethod: 'CASH', createdAt: { gte: d.startUtc, lte: d.endUtc } },
              _sum: { totalAmount: true },
            }),
            db.cashflowEntry.aggregate({
              where: { tenantId, direction: 'IN', entryDate: { gte: d.startUtc, lte: d.endUtc } },
              _sum: { amount: true },
            }),
            db.cashflowEntry.aggregate({
              where: { tenantId, direction: 'OUT', entryDate: { gte: d.startUtc, lte: d.endUtc } },
              _sum: { amount: true },
            }),
          ])
          return {
            label: d.label,
            in: (cashAgg._sum.totalAmount ?? 0) + (inAgg._sum.amount ?? 0),
            out: outAgg._sum.amount ?? 0,
          }
        })
      ),
      db.project.findMany({
        where: { tenantId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, code: true, name: true, budgetTotal: true },
      }),
      db.debt.aggregate({
        where: { tenantId, type: DEBT_TYPES.RECEIVABLE, status: { not: 'PAID' } },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      db.debt.count({
        where: { tenantId, type: DEBT_TYPES.RECEIVABLE, status: { not: 'PAID' }, dueDate: { lt: now } },
      }),
      db.debt.aggregate({
        where: { tenantId, type: DEBT_TYPES.PAYABLE, status: { not: 'PAID' } },
        _sum: { amount: true, paidAmount: true },
        _count: true,
      }),
      // Estimasi laba kotor: Σ (subtotal item − qty × costPrice) untuk item katalog PRODUCT.
      // SERVICE & item manual tanpa katalog dianggap tanpa HPP (margin penuh) —
      // disebut "estimasi" karena HPP memakai harga beli saat ini, bukan snapshot.
      db.transactionItem.findMany({
        where: { transaction: completedWhere, itemType: 'PRODUCT', catalogItemId: { not: null } },
        select: { quantity: true, subtotal: true, catalogItem: { select: { costPrice: true } } },
      }),
      db.transaction.aggregate({
        where: { ...completedWhere, createdAt: { gte: jakartaDayRange(now).startUtc } },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ])

    const realizationTotals = activeProjects.length
      ? await db.rabRealization.groupBy({
          by: ['projectId'],
          where: { projectId: { in: activeProjects.map((p) => p.id) } },
          _sum: { amount: true },
        })
      : []
    const realByProject = new Map(realizationTotals.map((r) => [r.projectId, r._sum.amount ?? 0]))

    const grossProfit = profitRows.reduce((s, it) => s + (it.subtotal - Math.round(it.quantity * (it.catalogItem?.costPrice ?? 0))), 0)

    return NextResponse.json({
      period: { days, start: periodStart.toISOString(), end: periodEnd.toISOString() },
      sales: {
        total: (posSalesAgg._sum.totalAmount ?? 0) - (posSalesAgg._sum.refundedAmount ?? 0),
        count: posSalesAgg._count,
        today: todaySales._sum.totalAmount ?? 0,
        todayCount: todaySales._count,
      },
      cash: {
        posCashIn: (posCashAgg._sum.totalAmount ?? 0) - (posCashAgg._sum.refundedAmount ?? 0),
        otherIn: cfInAgg._sum.amount ?? 0,
        out: cfOutAgg._sum.amount ?? 0,
        net: (posCashAgg._sum.totalAmount ?? 0) - (posCashAgg._sum.refundedAmount ?? 0) + (cfInAgg._sum.amount ?? 0) - (cfOutAgg._sum.amount ?? 0),
      },
      chart: chartRows,
      topExpenses: cfByCategory.map((c) => ({ category: c.category, total: c._sum.amount ?? 0 })),
      projects: {
        activeCount: activeProjects.length,
        items: activeProjects.map((p) => {
          const realization = realByProject.get(p.id) ?? 0
          return {
            id: p.id,
            code: p.code,
            name: p.name,
            budgetTotal: p.budgetTotal,
            realizationTotal: realization,
            remaining: p.budgetTotal - realization,
          }
        }),
        budgetTotal: activeProjects.reduce((s, p) => s + p.budgetTotal, 0),
        realizationTotal: activeProjects.reduce((s, p) => s + (realByProject.get(p.id) ?? 0), 0),
      },
      receivables: {
        outstanding: (recAgg._sum.amount ?? 0) - (recAgg._sum.paidAmount ?? 0),
        count: recAgg._count,
        overdueCount: recOverdue,
      },
      payables: {
        outstanding: (payAgg._sum.amount ?? 0) - (payAgg._sum.paidAmount ?? 0),
        count: payAgg._count,
      },
      grossProfitEstimate: grossProfit,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
