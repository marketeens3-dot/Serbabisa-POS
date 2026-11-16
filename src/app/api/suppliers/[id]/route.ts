// PATCH  /api/suppliers/[id] — ubah / aktif-nonaktif supplier
// DELETE /api/suppliers/[id] — hapus (ditolak bila sudah ada PO)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { supplierUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

async function getSupplierOr404(tenantId: string, id: string) {
  const supplier = await db.supplier.findFirst({ where: { id, tenantId } })
  if (!supplier) throw new ApiError('NOT_FOUND', 'Supplier tidak ditemukan.', 404)
  return supplier
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const supplier = await getSupplierOr404(tenantId, id)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'deactivate' || action === 'activate') {
      const isActive = action === 'activate'
      await db.$transaction(async (tx) => {
        await tx.supplier.update({ where: { id }, data: { isActive } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.SUPPLIER_UPDATED,
          resourceType: 'Supplier', resourceId: id,
          metadata: { name: supplier.name, isActive }, ipAddress: ip, userAgent: ua,
        })
      })
      return NextResponse.json({ ok: true, isActive })
    }

    const body = supplierUpdateSchema.parse(raw)
    await db.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.SUPPLIER_UPDATED,
        resourceType: 'Supplier', resourceId: id,
        metadata: { name: supplier.name, updatedFields: Object.keys(body) }, ipAddress: ip, userAgent: ua,
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const supplier = await getSupplierOr404(tenantId, id)

    const poCount = await db.purchaseOrder.count({ where: { supplierId: id } })
    if (poCount > 0) {
      throw new ApiError('HAS_PURCHASES', `Supplier sudah punya ${poCount} PO — nonaktifkan saja, jangan dihapus.`, 409)
    }

    await db.$transaction(async (tx) => {
      await tx.supplier.delete({ where: { id } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.SUPPLIER_DELETED,
        resourceType: 'Supplier', resourceId: id,
        metadata: { name: supplier.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
