// POST /api/projects/[id]/items — tambah item anggaran (budgetTotal dihitung ulang)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rabItemSchema } from '@/lib/validation'
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
    if (project.status === 'CANCELLED') {
      throw new ApiError('PROJECT_CANCELLED', 'Proyek sudah dibatalkan — item tidak bisa ditambahkan.', 409)
    }

    const body = rabItemSchema.parse(await req.json())
    const budgetAmount = Math.round(body.quantity * body.unitPrice)

    const item = await db.$transaction(async (tx) => {
      const created = await tx.rabItem.create({
        data: {
          projectId: id,
          tenantId,
          name: body.name,
          quantity: body.quantity,
          unit: body.unit,
          unitPrice: body.unitPrice,
          budgetAmount,
          note: body.note ?? null,
        },
      })
      // budgetTotal proyek = Σ budgetAmount item (server hitung ulang).
      const agg = await tx.rabItem.aggregate({ where: { projectId: id }, _sum: { budgetAmount: true } })
      await tx.project.update({ where: { id }, data: { budgetTotal: agg._sum.budgetAmount ?? 0 } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.RAB_ITEM_ADDED,
        resourceType: 'Project', resourceId: id,
        metadata: { itemName: created.name, budgetAmount }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      { id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, budgetAmount: item.budgetAmount, note: item.note },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
