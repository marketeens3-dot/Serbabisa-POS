// GET  /api/categories — kategori milik tenant (+ jumlah item)
// POST /api/categories — tambah (nama unik per tenant, case-insensitive)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { categorySchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCategoryDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const includeInactive = url.searchParams.get('all') === '1'
    const rows = await db.category.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ data: rows.map(toCategoryDTO) })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = categorySchema.parse(await req.json())
    const normalizedName = body.name.toLowerCase().replace(/\s+/g, ' ').trim()

    const existing = await db.category.findFirst({ where: { tenantId, normalizedName } })
    if (existing) throw new ApiError('ALREADY_EXISTS', 'Nama kategori sudah digunakan.', 409)

    const category = await db.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: { tenantId, name: body.name, normalizedName, description: body.description ?? null },
        include: { _count: { select: { items: true } } },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CATEGORY_CREATED,
        resourceType: 'Category', resourceId: created.id,
        metadata: { name: created.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })
    return NextResponse.json(toCategoryDTO(category), { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
