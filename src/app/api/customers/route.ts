// GET  /api/customers — pelanggan (search, pagination)
// POST /api/customers — tambah (phone dinormalisasi 62xxx)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { customerSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCustomerDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''

    const where = {
      tenantId,
      ...(status === 'ACTIVE' ? { isActive: true } : status === 'INACTIVE' ? { isActive: false } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : {}),
    }

    const [total, rows] = await Promise.all([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        include: {
          _count: { select: { transactions: true } },
          transactions: { where: { status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { totalAmount: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    // Ringkasan belanja per pelanggan (agregat, bukan N+1 fetch transaksi).
    const ids = rows.map((r) => r.id)
    const aggs = await db.transaction.groupBy({
      by: ['customerId'],
      where: { customerId: { in: ids }, status: 'COMPLETED' },
      _count: true,
      _sum: { totalAmount: true },
    })
    const aggByCustomer = new Map(aggs.map((a) => [a.customerId, a]))

    return NextResponse.json({
      data: rows.map((r) => {
        const agg = aggByCustomer.get(r.id)
        const dto = toCustomerDTO(r)
        return { ...dto, transactionCount: agg?._count ?? 0, totalSpent: agg?._sum.totalAmount ?? 0 }
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = customerSchema.parse(await req.json())

    const customer = await db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          tenantId,
          name: body.name,
          phone: body.phone,
          email: body.email,
          address: body.address ?? null,
          notes: body.notes ?? null,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CUSTOMER_CREATED,
        resourceType: 'Customer', resourceId: created.id,
        metadata: { name: created.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      toCustomerDTO({ ...customer, _count: { transactions: 0 }, transactions: [] }),
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
