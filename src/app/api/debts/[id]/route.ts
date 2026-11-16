// GET  /api/debts/[id] — detail hutang/piutang + riwayat cicilan
// POST /api/debts/[id]/payments dibuat di file terpisah (payments/route.ts)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, requireUser } from '@/lib/api'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    const debt = await db.debt.findFirst({
      where: { id, tenantId },
      include: {
        customer: { select: { name: true, phone: true } },
        supplier: { select: { name: true, phone: true } },
        transaction: { select: { invoiceNumber: true } },
        purchase: { select: { code: true } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })
    if (!debt) throw new ApiError('NOT_FOUND', 'Hutang/piutang tidak ditemukan.', 404)

    const now = Date.now()
    return NextResponse.json({
      debt: {
        id: debt.id,
        type: debt.type,
        amount: debt.amount,
        paidAmount: debt.paidAmount,
        remaining: debt.amount - debt.paidAmount,
        status: debt.status,
        dueDate: debt.dueDate?.toISOString() ?? null,
        isOverdue: !!debt.dueDate && debt.status !== 'PAID' && debt.dueDate.getTime() < now,
        customerId: debt.customerId,
        customerName: debt.customer?.name ?? null,
        customerPhone: debt.customer?.phone ?? null,
        supplierId: debt.supplierId,
        supplierName: debt.supplier?.name ?? null,
        invoiceNumber: debt.transaction?.invoiceNumber ?? null,
        purchaseCode: debt.purchase?.code ?? null,
        note: debt.note,
        createdAt: debt.createdAt.toISOString(),
      },
      payments: debt.payments.map((p) => ({
        id: p.id, amount: p.amount, method: p.method, note: p.note,
        paidAt: p.paidAt.toISOString(),
      })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
