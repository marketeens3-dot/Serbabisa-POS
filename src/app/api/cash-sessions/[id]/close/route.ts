// POST /api/cash-sessions/[id]/close — tutup shift ATOMIC:
//   1. Validasi sesi milik tenant + status masih OPEN
//   2. Hitung expectedCash = kasAwal + Σ penjualan tunai selesai (snapshot di dalam tx)
//   3. Simpan closingCash + selisih + catatan → status CLOSED
//   4. Audit CASH_SESSION_CLOSED
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { closeCashSessionSchema } from '@/lib/validation'
import {
  ApiError,
  assertSameOrigin,
  getClientIp,
  getUserAgent,
  handleApiError,
  requireUser,
} from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { computeSessionTotals } from '@/lib/services/cash-session'
import { toCashSessionDTO } from '@/lib/services/serializers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const { id } = await params
    const body = closeCashSessionSchema.parse(await req.json())

    const result = await db.$transaction(async (tx) => {
      const session = await tx.cashSession.findFirst({
        where: { id, tenantId },
        include: { user: { select: { fullName: true } } },
      })
      if (!session) {
        throw new ApiError('NOT_FOUND', 'Sesi kasir tidak ditemukan.', 404)
      }
      if (session.status !== 'OPEN') {
        throw new ApiError('SESSION_ALREADY_CLOSED', 'Sesi ini sudah ditutup.', 409)
      }

      // Snapshot expected di dalam transaksi yang sama → konsisten.
      const totals = await computeSessionTotals(tx, session.id, session.openingCash)
      const difference = body.closingCash - totals.expectedCash

      const closed = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closingCash: body.closingCash,
          expectedCash: totals.expectedCash,
          difference,
          notes: body.notes ?? null,
          closedAt: new Date(),
        },
        include: { user: { select: { fullName: true } } },
      })

      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.CASH_SESSION_CLOSED,
        resourceType: 'CashSession',
        resourceId: session.id,
        metadata: {
          openingCash: session.openingCash,
          cashSales: totals.cashTotal,
          nonCashSales: totals.nonCashTotal,
          expectedCash: totals.expectedCash,
          closingCash: body.closingCash,
          difference,
          transactionCount: totals.transactionCount,
        },
        ipAddress: ip,
        userAgent: ua,
      })

      return {
        session: toCashSessionDTO(closed),
        summary: {
          transactionCount: totals.transactionCount,
          cashTotal: totals.cashTotal,
          nonCashTotal: totals.nonCashTotal,
          total: totals.total,
          expectedCash: totals.expectedCash,
        },
        byMethod: totals.byMethod,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    return handleApiError(err)
  }
}
