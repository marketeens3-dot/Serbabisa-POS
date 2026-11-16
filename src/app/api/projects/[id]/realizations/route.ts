// POST /api/projects/[id]/realizations — catat realisasi manual (di luar kasir)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rabRealizationSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const project = await db.project.findFirst({ where: { id, tenantId } })
    if (!project) throw new ApiError('NOT_FOUND', 'Proyek tidak ditemukan.', 404)

    const body = rabRealizationSchema.parse(await req.json())
    if (body.rabItemId) {
      const rabItem = await db.rabItem.findFirst({ where: { id: body.rabItemId, projectId: id, tenantId } })
      if (!rabItem) throw new ApiError('NOT_FOUND', 'Item anggaran tidak ditemukan di proyek ini.', 404)
    }

    const realization = await db.$transaction(async (tx) => {
      const created = await tx.rabRealization.create({
        data: {
          projectId: id,
          tenantId,
          rabItemId: body.rabItemId ?? null,
          description: body.description,
          quantity: body.quantity,
          amount: body.amount,
          source: 'MANUAL',
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.RAB_REALIZATION_ADDED,
        resourceType: 'Project', resourceId: id,
        metadata: { description: created.description, amount: created.amount },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      {
        id: realization.id, rabItemId: realization.rabItemId, description: realization.description,
        quantity: realization.quantity, amount: realization.amount, source: realization.source,
        createdAt: realization.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
