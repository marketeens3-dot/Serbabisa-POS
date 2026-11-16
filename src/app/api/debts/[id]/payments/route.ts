// POST /api/debts/[id]/payments — catat cicilan/pelunasan (atomik):
//   1. Validasi nominal ≤ sisa hutang
//   2. paidAmount & status diupdate (UNPAID → PARTIAL → PAID)
//   3. method CASH → cashflow IN otomatis (source DEBT_PAYMENT)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { debtPaymentSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, DEBT_STATUSES } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = debtPaymentSchema.parse(await req.json())

    const debt = await db.debt.findFirst({ where: { id, tenantId } })
    if (!debt) throw new ApiError('NOT_FOUND', 'Hutang/piutang tidak ditemukan.', 404)
    if (debt.status === DEBT_STATUSES.PAID) {
      throw new ApiError('ALREADY_PAID', 'Hutang/piutang ini sudah lunas.', 409)
    }
    const remaining = debt.amount - debt.paidAmount
    if (body.amount > remaining) {
      throw new ApiError('AMOUNT_TOO_LARGE', `Nominal melebihi sisa hutang (sisa: Rp ${remaining.toLocaleString('id-ID')}).`, 400)
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          debtId: id,
          tenantId,
          amount: body.amount,
          method: body.method,
          note: body.note ?? null,
          receivedById: user.id,
        },
      })
      const newPaid = debt.paidAmount + body.amount
      const newStatus = newPaid >= debt.amount ? DEBT_STATUSES.PAID : DEBT_STATUSES.PARTIAL
      await tx.debt.update({ where: { id }, data: { paidAmount: newPaid, status: newStatus } })

      // Cicilan tunai = uang riil masuk/keluar kas → cashflow otomatis.
      // Transfer/QRIS tidak dicatat kas (bukan kas fisik) — tetap tercatat di cicilan.
      if (body.method === 'CASH') {
        await tx.cashflowEntry.create({
          data: {
            tenantId,
            direction: debt.type === 'RECEIVABLE' ? 'IN' : 'OUT',
            category: debt.type === 'RECEIVABLE' ? 'PELUNASAN_PIUTANG' : 'PEMBAYARAN_HUTANG',
            amount: body.amount,
            note: `Cicilan hutang/piutang${debt.note ? ` — ${debt.note}` : ''}`,
            entryDate: new Date(),
            source: 'DEBT_PAYMENT',
            refType: 'DebtPayment',
            refId: payment.id,
            createdById: user.id,
          },
        })
      }

      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.DEBT_PAYMENT_ADDED,
        resourceType: 'Debt', resourceId: id,
        metadata: { amount: body.amount, method: body.method, newPaid, newStatus },
        ipAddress: ip, userAgent: ua,
      })
      return { payment, newPaid, newStatus }
    })

    return NextResponse.json(
      {
        ok: true,
        paymentId: result.payment.id,
        paidAmount: result.newPaid,
        remaining: debt.amount - result.newPaid,
        status: result.newStatus,
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
