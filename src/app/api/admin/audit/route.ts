// GET /api/admin/audit — audit log global, paginated, filterable. Super Admin only (read-only).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, parsePagination, requireSuperAdmin } from '@/lib/api'
import { toAuditLogDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 20)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const action = url.searchParams.get('action')?.trim() ?? ''
    const tenantId = url.searchParams.get('tenantId')?.trim() ?? ''

    const where = {
      ...(action ? { action } : {}),
      ...(tenantId ? { tenantId } : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search } },
              { actor: { fullName: { contains: search } } },
              { actor: { email: { contains: search } } },
            ],
          }
        : {}),
    }

    const [total, rows, actionGroups] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        include: {
          actor: { select: { fullName: true, email: true } },
          tenant: { select: { businessName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      db.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } }, take: 40 }),
    ])

    return NextResponse.json({
      data: rows.map(toAuditLogDTO),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      availableActions: actionGroups.map((g) => ({ action: g.action, count: g._count })),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
