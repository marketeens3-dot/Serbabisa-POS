// PATCH  /api/vouchers/[id] — ubah voucher (aktif/nonaktif, nilai, batas)
// DELETE /api/vouchers/[id] — hapus voucher
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { voucherUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

async function getVoucherOr404(tenantId: string, id: string) {
  const voucher = await db.voucher.findFirst({ where: { id, tenantId } })
  if (!voucher) throw new ApiError('NOT_FOUND', 'Voucher tidak ditemukan.', 404)
  return voucher
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    await getVoucherOr404(tenantId, id)

    const body = voucherUpdateSchema.parse(await req.json())
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.voucher.update({
        where: { id },
        data: {
          ...(body.type !== undefined ? { type: body.type } : {}),
          ...(body.value !== undefined ? { value: body.value } : {}),
          ...(body.minPurchase !== undefined ? { minPurchase: body.minPurchase } : {}),
          ...(body.maxDiscount !== undefined ? { maxDiscount: body.maxDiscount ?? null } : {}),
          ...(body.usageLimit !== undefined ? { usageLimit: body.usageLimit ?? null } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null } : {}),
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.VOUCHER_UPDATED,
        resourceType: 'Voucher', resourceId: id,
        metadata: { code: u.code, updatedFields: Object.keys(body) }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return u
    })
    return NextResponse.json({
      id: updated.id, code: updated.code, type: updated.type, value: updated.value,
      minPurchase: updated.minPurchase, maxDiscount: updated.maxDiscount, usageLimit: updated.usageLimit,
      usageCount: updated.usageCount, isActive: updated.isActive, expiresAt: updated.expiresAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const voucher = await getVoucherOr404(tenantId, id)

    await db.$transaction(async (tx) => {
      await tx.voucher.delete({ where: { id } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.VOUCHER_DELETED,
        resourceType: 'Voucher', resourceId: id,
        metadata: { code: voucher.code }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
