// GET  /api/cashflow — daftar arus kas (filter arah/kategori/periode + ringkasan)
// POST /api/cashflow — catat kas masuk/keluar manual
// CATATAN: entri otomatis (DEBT_PAYMENT / PURCHASE_CASH) dibuat oleh modul lain
// dan hanya bisa diubah lewat sumbernya — tidak lewat PATCH/DELETE di sini.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cashflowSchema } from '@/lib/validation'
import { assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const direction = url.searchParams.get('direction')?.trim() ?? ''
    const category = url.searchParams.get('category')?.trim() ?? ''
    const search = url.searchParams.get('search')?.trim() ?? ''
    const dateFrom = url.searchParams.get('dateFrom')?.trim() ?? ''
    const dateTo = url.searchParams.get('dateTo')?.trim() ?? ''

    let entryDate: { gte?: Date; lte?: Date } | undefined
    if (dateFrom) entryDate = { ...entryDate, gte: new Date(`${dateFrom}T00:00:00+07:00`) }
    if (dateTo) entryDate = { ...entryDate, lte: new Date(`${dateTo}T23:59:59.999+07:00`) }

    const where = {
      tenantId,
      ...(direction === 'IN' || direction === 'OUT' ? { direction } : {}),
      ...(category ? { category: { contains: category } } : {}),
      ...(entryDate ? { entryDate } : {}),
      ...(search ? { OR: [{ category: { contains: search } }, { note: { contains: search } }] } : {}),
    }

    const [total, rows, sumIn, sumOut] = await Promise.all([
      db.cashflowEntry.count({ where }),
      db.cashflowEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      db.cashflowEntry.aggregate({ where: { ...where, direction: 'IN' }, _sum: { amount: true } }),
      db.cashflowEntry.aggregate({ where: { ...where, direction: 'OUT' }, _sum: { amount: true } }),
    ])

    return NextResponse.json({
      data: rows.map((r) => ({
        id: r.id,
        direction: r.direction,
        category: r.category,
        amount: r.amount,
        note: r.note,
        entryDate: r.entryDate.toISOString(),
        source: r.source,
        refType: r.refType,
        refId: r.refId,
        createdAt: r.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      summary: { totalIn: sumIn._sum.amount ?? 0, totalOut: sumOut._sum.amount ?? 0, net: (sumIn._sum.amount ?? 0) - (sumOut._sum.amount ?? 0) },
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = cashflowSchema.parse(await req.json())

    const entry = await db.$transaction(async (tx) => {
      const created = await tx.cashflowEntry.create({
        data: {
          tenantId,
          direction: body.direction,
          category: body.category.toUpperCase(),
          amount: body.amount,
          note: body.note ?? null,
          entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
          source: 'MANUAL',
          createdById: user.id,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CASHFLOW_CREATED,
        resourceType: 'CashflowEntry', resourceId: created.id,
        metadata: { direction: body.direction, category: created.category, amount: body.amount },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      {
        id: entry.id, direction: entry.direction, category: entry.category, amount: entry.amount,
        note: entry.note, entryDate: entry.entryDate.toISOString(), source: entry.source,
        refType: entry.refType, refId: entry.refId, createdAt: entry.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
