// GET   /api/customers/[id] — detail + riwayat transaksi (paginated)
// PATCH /api/customers/[id] — update / aktif-nonaktif
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customerUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCustomerDTO, toTransactionDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    // Tenant-scoped lookup — IDOR menghasilkan 404 tanpa membocorkan keberadaan data.
    const customer = await db.customer.findFirst({
      where: { id, tenantId },
      include: { transactions: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { totalAmount: true, createdAt: true } } },
    })
    if (!customer) throw new ApiError('NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)

    const [agg, txs] = await Promise.all([
      db.transaction.aggregate({ where: { customerId: id, status: 'COMPLETED' }, _count: true, _sum: { totalAmount: true } }),
      db.transaction.findMany({
        where: { customerId: id },
        include: { cashier: { select: { fullName: true } }, customer: { select: { name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    return NextResponse.json({
      customer: { ...toCustomerDTO(customer), transactionCount: agg._count, totalSpent: agg._sum.totalAmount ?? 0 },
      transactions: txs.map(toTransactionDTO),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    const customer = await db.customer.findFirst({ where: { id, tenantId } })
    if (!customer) throw new ApiError('NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'deactivate' || action === 'activate') {
      const isActive = action === 'activate'
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.customer.update({ where: { id }, data: { isActive } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId,
          action: isActive ? AUDIT_ACTIONS.CUSTOMER_ACTIVATED : AUDIT_ACTIONS.CUSTOMER_DEACTIVATED,
          resourceType: 'Customer', resourceId: id,
          metadata: { name: customer.name }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json(toCustomerDTO({ ...updated, _count: { transactions: 0 }, transactions: [] }))
    }

    const body = customerUpdateSchema.parse(raw)
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.customer.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
        resourceType: 'Customer', resourceId: id,
        metadata: { name: u.name, updatedFields: Object.keys(body) }, ipAddress: ip, userAgent: ua,
      })
      return u
    })
    return NextResponse.json(toCustomerDTO({ ...updated, _count: { transactions: 0 }, transactions: [] }))
  } catch (err) {
    return handleApiError(err)
  }
}
