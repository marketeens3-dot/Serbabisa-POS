// GET  /api/debts — daftar hutang/piutang (filter type, status; ringkasan + aging)
// POST /api/debts — catat hutang/piutang manual (mis. hutang modal, piutang luar)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { debtManualSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, DEBT_TYPES } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const type = url.searchParams.get('type')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''
    const search = url.searchParams.get('search')?.trim() ?? ''

    const where = {
      tenantId,
      ...(type === 'RECEIVABLE' || type === 'PAYABLE' ? { type } : {}),
      ...(status === 'UNPAID' || status === 'PARTIAL' || status === 'PAID' ? { status } : {}),
      ...(search ? { OR: [{ note: { contains: search } }, { customer: { name: { contains: search } } }, { supplier: { name: { contains: search } } }] } : {}),
    }

    const [total, rows, recAgg, payAgg] = await Promise.all([
      db.debt.count({ where }),
      db.debt.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
          transaction: { select: { invoiceNumber: true } },
          purchase: { select: { code: true } },
          _count: { select: { payments: true } },
        },
        orderBy: [{ status: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      db.debt.aggregate({
        where: { tenantId, type: DEBT_TYPES.RECEIVABLE, status: { not: 'PAID' } },
        _sum: { amount: true, paidAmount: true },
      }),
      db.debt.aggregate({
        where: { tenantId, type: DEBT_TYPES.PAYABLE, status: { not: 'PAID' } },
        _sum: { amount: true, paidAmount: true },
      }),
    ])

    const now = Date.now()
    return NextResponse.json({
      data: rows.map((d) => ({
        id: d.id,
        type: d.type,
        amount: d.amount,
        paidAmount: d.paidAmount,
        remaining: d.amount - d.paidAmount,
        status: d.status,
        dueDate: d.dueDate?.toISOString() ?? null,
        isOverdue: !!d.dueDate && d.status !== 'PAID' && d.dueDate.getTime() < now,
        daysOverdue: d.dueDate && d.status !== 'PAID' && d.dueDate.getTime() < now
          ? Math.floor((now - d.dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : 0,
        customerId: d.customerId,
        customerName: d.customer?.name ?? null,
        supplierId: d.supplierId,
        supplierName: d.supplier?.name ?? null,
        transactionId: d.transactionId,
        invoiceNumber: d.transaction?.invoiceNumber ?? null,
        purchaseId: d.purchaseId,
        purchaseCode: d.purchase?.code ?? null,
        note: d.note,
        paymentCount: d._count.payments,
        createdAt: d.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: {
        receivableOutstanding: (recAgg._sum.amount ?? 0) - (recAgg._sum.paidAmount ?? 0),
        payableOutstanding: (payAgg._sum.amount ?? 0) - (payAgg._sum.paidAmount ?? 0),
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = debtManualSchema.parse(await req.json())

    if (body.type === DEBT_TYPES.RECEIVABLE && !body.customerId) {
      throw new ApiError('INVALID_INPUT', 'Piutang wajib punya pelanggan.', 422)
    }
    if (body.type === DEBT_TYPES.PAYABLE && !body.supplierId) {
      throw new ApiError('INVALID_INPUT', 'Hutang wajib punya supplier.', 422)
    }
    if (body.customerId) {
      const c = await db.customer.findFirst({ where: { id: body.customerId, tenantId } })
      if (!c) throw new ApiError('NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)
    }
    if (body.supplierId) {
      const s = await db.supplier.findFirst({ where: { id: body.supplierId, tenantId } })
      if (!s) throw new ApiError('NOT_FOUND', 'Supplier tidak ditemukan.', 404)
    }

    const debt = await db.$transaction(async (tx) => {
      const created = await tx.debt.create({
        data: {
          tenantId,
          type: body.type,
          amount: body.amount,
          status: 'UNPAID',
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          customerId: body.customerId ?? null,
          supplierId: body.supplierId ?? null,
          note: body.note ?? null,
          createdById: user.id,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.DEBT_CREATED,
        resourceType: 'Debt', resourceId: created.id,
        metadata: { type: body.type, amount: body.amount }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      { id: debt.id, type: debt.type, amount: debt.amount, paidAmount: 0, remaining: debt.amount, status: debt.status, dueDate: debt.dueDate?.toISOString() ?? null },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
