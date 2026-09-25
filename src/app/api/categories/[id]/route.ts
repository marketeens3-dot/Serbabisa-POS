// PATCH /api/categories/[id] — update / aktif-nonaktif kategori.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { categoryUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCategoryDTO } from '@/lib/services/serializers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    const category = await db.category.findFirst({ where: { id, tenantId } })
    if (!category) throw new ApiError('NOT_FOUND', 'Kategori tidak ditemukan.', 404)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'deactivate' || action === 'activate') {
      const isActive = action === 'activate'
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.category.update({ where: { id }, data: { isActive }, include: { _count: { select: { items: true } } } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CATEGORY_UPDATED,
          resourceType: 'Category', resourceId: id,
          metadata: { name: category.name, isActive }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json(toCategoryDTO(updated))
    }

    const body = categoryUpdateSchema.parse(raw)
    if (body.name) {
      const normalizedName = body.name.toLowerCase().replace(/\s+/g, ' ').trim()
      const clash = await db.category.findFirst({ where: { tenantId, normalizedName, id: { not: id } } })
      if (clash) throw new ApiError('ALREADY_EXISTS', 'Nama kategori sudah digunakan.', 409)
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.category.update({
          where: { id },
          data: {
            name: body.name ?? category.name,
            normalizedName,
            ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          },
          include: { _count: { select: { items: true } } },
        })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.CATEGORY_UPDATED,
          resourceType: 'Category', resourceId: id,
          metadata: { name: u.name }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json(toCategoryDTO(updated))
    }

    const updated = await db.category.update({
      where: { id },
      data: { ...(body.description !== undefined ? { description: body.description ?? null } : {}) },
      include: { _count: { select: { items: true } } },
    })
    return NextResponse.json(toCategoryDTO(updated))
  } catch (err) {
    return handleApiError(err)
  }
}
