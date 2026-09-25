// GET /api/admin/dashboard — statistik agregat (Super Admin tidak membaca transaksi mentah tenant).
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError } from '@/lib/api'
import { requireSuperAdmin } from '@/lib/api'
import { jakartaDayRange, jakartaMonthRange, lastNDayRanges } from '@/lib/format'
import { toAdminUserDTO, toAuditLogDTO } from '@/lib/services/serializers'
import type { AdminDashboardDTO } from '@/lib/types'
import { ROLES } from '@/lib/constants'

export async function GET() {
  try {
    await requireSuperAdmin()
    const today = jakartaDayRange()
    const month = jakartaMonthRange()

    const [
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalTenants,
      activeTenants,
      txTodayAgg,
      txMonthAgg,
      recentUsers,
      recentAuditEvents,
      activeSessions,
    ] = await Promise.all([
      db.user.count({ where: { role: ROLES.USER } }),
      db.user.count({ where: { role: ROLES.USER, status: 'ACTIVE' } }),
      db.user.count({ where: { role: ROLES.USER, status: { not: 'ACTIVE' } } }),
      db.tenant.count(),
      db.tenant.count({ where: { isActive: true } }),
      db.transaction.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: today.startUtc, lte: today.endUtc } },
        _count: true,
        _sum: { totalAmount: true },
      }),
      db.transaction.aggregate({
        where: { status: 'COMPLETED', createdAt: { gte: month.startUtc, lte: month.endUtc } },
        _count: true,
        _sum: { totalAmount: true },
      }),
      db.user.findMany({
        where: { role: ROLES.USER },
        include: { tenant: true, _count: { select: { transactions: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      db.auditLog.findMany({
        include: { actor: { select: { fullName: true, email: true } }, tenant: { select: { businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      db.session.count({ where: { expiresAt: { gt: new Date() } } }),
    ])

    // Transaksi 7 hari terakhir (agregat global, 7 query terindeks — bukan fetch mentah).
    const ranges = lastNDayRanges(7)
    const salesLast7Days = await Promise.all(
      ranges.map(async (r) => {
        const agg = await db.transaction.aggregate({
          where: { status: 'COMPLETED', createdAt: { gte: r.startUtc, lte: r.endUtc } },
          _count: true,
          _sum: { totalAmount: true },
        })
        return { ymd: r.ymd, label: r.label, total: agg._sum.totalAmount ?? 0, count: agg._count }
      })
    )

    const dto: AdminDashboardDTO = {
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalTenants,
      activeTenants,
      transactionsToday: txTodayAgg._count,
      transactionsThisMonth: txMonthAgg._count,
      salesToday: txTodayAgg._sum.totalAmount ?? 0,
      salesThisMonth: txMonthAgg._sum.totalAmount ?? 0,
      transactionsLast7Days: salesLast7Days,
      recentUsers: recentUsers.map(toAdminUserDTO),
      recentAuditEvents: recentAuditEvents.map(toAuditLogDTO),
      health: { database: 'OK', activeSessions },
    }
    return NextResponse.json(dto)
  } catch (err) {
    return handleApiError(err)
  }
}
