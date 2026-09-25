// GET /api/cash-sessions/[id] — detail sesi + laporan lengkap (transaksi, per metode, selisih).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, requireUser } from '@/lib/api'
import { computeSessionTotals } from '@/lib/services/cash-session'
import { toCashSessionDTO, toTransactionDTO } from '@/lib/services/serializers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params

    // Scoped tenantId → sesi tenant lain = 404 (anti-IDOR).
    const session = await db.cashSession.findFirst({
      where: { id, tenantId },
      include: { user: { select: { fullName: true } } },
    })
    if (!session) {
      throw new ApiError('NOT_FOUND', 'Sesi kasir tidak ditemukan.', 404)
    }

    const totals = await computeSessionTotals(db, session.id, session.openingCash)
    const transactions = await db.transaction.findMany({
      where: { cashSessionId: session.id },
      include: {
        cashier: { select: { fullName: true } },
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({
      session: {
        ...toCashSessionDTO(session),
        summary: {
          transactionCount: totals.transactionCount,
          cashTotal: totals.cashTotal,
          nonCashTotal: totals.nonCashTotal,
          total: totals.total,
          expectedCash: totals.expectedCash,
        },
        byMethod: totals.byMethod,
        transactions: transactions.map(toTransactionDTO),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
