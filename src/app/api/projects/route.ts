// GET  /api/projects — daftar proyek/RAB (search, filter status, agregat realisasi)
// POST /api/projects — buat proyek (kode otomatis RAB-YYYY-NNNN bila kosong)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { jakartaYear } from '@/lib/format'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''

    const where = {
      tenantId,
      ...(status
        ? { status }
        : {}),
      ...(search
        ? { OR: [{ name: { contains: search } }, { code: { contains: search } }, { description: { contains: search } }] }
        : {}),
    }

    const [total, rows] = await Promise.all([
      db.project.count({ where }),
      db.project.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    // Agregat realisasi + jumlah item anggaran untuk semua proyek di halaman ini
    // (dua groupBy — bukan N+1 query per baris).
    const ids = rows.map((r) => r.id)
    const [realAggs, itemAggs] = await Promise.all([
      ids.length
        ? db.rabRealization.groupBy({
            by: ['projectId'],
            where: { projectId: { in: ids } },
            _sum: { amount: true },
          })
        : Promise.resolve([] as { projectId: string; _sum: { amount: number | null } }[]),
      ids.length
        ? db.rabItem.groupBy({
            by: ['projectId'],
            where: { projectId: { in: ids } },
            _count: true,
          })
        : Promise.resolve([] as { projectId: string; _count: number }[]),
    ])
    const realByProject = new Map(realAggs.map((a) => [a.projectId, a._sum.amount ?? 0] as const))
    const itemsByProject = new Map(itemAggs.map((a) => [a.projectId, a._count] as const))

    return NextResponse.json({
      data: rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        status: p.status,
        budgetTotal: p.budgetTotal,
        realizationTotal: realByProject.get(p.id) ?? 0,
        itemCount: itemsByProject.get(p.id) ?? 0,
        customerId: p.customerId,
        customerName: p.customer?.name ?? null,
        customerPhone: p.customer?.phone ?? null,
        startDate: p.startDate?.toISOString() ?? null,
        endDate: p.endDate?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
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
    const body = projectSchema.parse(await req.json())

    if (body.customerId) {
      const customer = await db.customer.findFirst({ where: { id: body.customerId, tenantId } })
      if (!customer) throw new ApiError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)
    }

    // Kode otomatis RAB-YYYY-NNNN — cek keunikan loop pendek (kode bisa dihapus
    // sehingga count tidak menjamin bebas tabrakan).
    let code = body.code?.toUpperCase()
    if (!code) {
      const year = jakartaYear()
      const count = await db.project.count({ where: { tenantId, code: { startsWith: `RAB-${year}-` } } })
      for (let n = count + 1; ; n++) {
        const candidate = `RAB-${year}-${String(n).padStart(4, '0')}`
        const exists = await db.project.findFirst({ where: { tenantId, code: candidate }, select: { id: true } })
        if (!exists) {
          code = candidate
          break
        }
      }
    } else {
      const exists = await db.project.findFirst({ where: { tenantId, code }, select: { id: true } })
      if (exists) throw new ApiError('ALREADY_EXISTS', `Kode proyek ${code} sudah digunakan.`, 409)
    }

    const project = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          tenantId,
          code: code!,
          name: body.name,
          customerId: body.customerId ?? null,
          description: body.description ?? null,
          status: body.status,
          startDate: body.startDate ? new Date(body.startDate) : null,
          endDate: body.endDate ? new Date(body.endDate) : null,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PROJECT_CREATED,
        resourceType: 'Project', resourceId: created.id,
        metadata: { code: created.code, name: created.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        status: project.status,
        budgetTotal: 0,
        realizationTotal: 0,
        itemCount: 0,
        customerId: project.customerId,
        customerName: null,
        customerPhone: null,
        startDate: project.startDate?.toISOString() ?? null,
        endDate: project.endDate?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
