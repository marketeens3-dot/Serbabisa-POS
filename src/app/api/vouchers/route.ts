// GET  /api/vouchers — daftar voucher (termasuk nonaktif)
// POST /api/vouchers — buat voucher
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { voucherSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const rows = await db.voucher.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 })
    return NextResponse.json({
      data: rows.map(serializeVoucher),
      total: rows.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export function serializeVoucher(v: {
  id: string; code: string; type: string; value: number; minPurchase: number; maxDiscount: number | null
  usageLimit: number | null; usageCount: number; isActive: boolean; expiresAt: Date | null; createdAt: Date
}) {
  return {
    id: v.id, code: v.code, type: v.type, value: v.value, minPurchase: v.minPurchase,
    maxDiscount: v.maxDiscount, usageLimit: v.usageLimit, usageCount: v.usageCount,
    isActive: v.isActive, expiresAt: v.expiresAt?.toISOString() ?? null, createdAt: v.createdAt.toISOString(),
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = voucherSchema.parse(await req.json())

    const exists = await db.voucher.findFirst({ where: { tenantId, code: body.code }, select: { id: true } })
    if (exists) throw new ApiError('ALREADY_EXISTS', `Kode voucher ${body.code} sudah digunakan.`, 409)

    const voucher = await db.$transaction(async (tx) => {
      const created = await tx.voucher.create({
        data: {
          tenantId,
          code: body.code,
          type: body.type,
          value: body.value,
          minPurchase: body.minPurchase,
          maxDiscount: body.maxDiscount ?? null,
          usageLimit: body.usageLimit ?? null,
          isActive: body.isActive,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.VOUCHER_CREATED,
        resourceType: 'Voucher', resourceId: created.id,
        metadata: { code: created.code, type: created.type, value: created.value },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(serializeVoucher(voucher), { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
