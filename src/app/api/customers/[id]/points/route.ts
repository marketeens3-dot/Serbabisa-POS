// POST /api/customers/[id]/points — sesuaikan poin (redeem kasir / koreksi manual).
// Earn otomatis terjadi di checkout; endpoint ini untuk REDEEM & ADJUST saja.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pointsAdjustSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const body = pointsAdjustSchema.parse(await req.json())

    const customer = await db.customer.findFirst({ where: { id, tenantId } })
    if (!customer) throw new ApiError('NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)

    const newPoints = customer.points + body.points
    if (newPoints < 0) {
      throw new ApiError(
        'INSUFFICIENT_POINTS',
        `Poin tidak cukup. Poin saat ini: ${customer.points}, diminta kurangi ${Math.abs(body.points)}.`,
        400
      )
    }

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { points: newPoints } })
      await tx.pointsLedger.create({
        data: {
          tenantId,
          customerId: id,
          points: body.points,
          type: body.type,
          note: body.note ?? null,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.POINTS_ADJUSTED,
        resourceType: 'Customer', resourceId: id,
        metadata: { points: body.points, type: body.type, newPoints, customer: customer.name },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return updated
    })

    return NextResponse.json({ ok: true, points: result.points })
  } catch (err) {
    return handleApiError(err)
  }
}
