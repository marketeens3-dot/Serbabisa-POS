// PATCH  /api/invoice-templates/[id] — update config / set default
// DELETE /api/invoice-templates/[id] — hapus template (bukan default, minimal tersisa 1)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoiceTemplateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toInvoiceTemplateDTO } from '@/lib/services/serializers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    const template = await db.invoiceTemplate.findFirst({ where: { id, tenantId } })
    if (!template) throw new ApiError('NOT_FOUND', 'Template tidak ditemukan.', 404)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'set_default') {
      const updated = await db.$transaction(async (tx) => {
        await tx.invoiceTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } })
        const u = await tx.invoiceTemplate.update({ where: { id }, data: { isDefault: true } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.INVOICE_DEFAULT_CHANGED,
          resourceType: 'InvoiceTemplate', resourceId: id,
          metadata: { name: u.name }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json(toInvoiceTemplateDTO(updated))
    }

    const body = invoiceTemplateSchema.parse(raw)
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.invoiceTemplate.update({
        where: { id },
        data: { name: body.name, config: JSON.stringify(body.config) },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.INVOICE_TEMPLATE_UPDATED,
        resourceType: 'InvoiceTemplate', resourceId: id,
        metadata: { name: u.name, paperSize: body.config.paperSize }, ipAddress: ip, userAgent: ua,
      })
      return u
    })
    return NextResponse.json(toInvoiceTemplateDTO(updated))
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params

    const template = await db.invoiceTemplate.findFirst({ where: { id, tenantId } })
    if (!template) throw new ApiError('NOT_FOUND', 'Template tidak ditemukan.', 404)
    if (template.isDefault) throw new ApiError('CANNOT_DELETE_DEFAULT', 'Template default tidak dapat dihapus. Pilih template default lain dulu.', 400)

    const count = await db.invoiceTemplate.count({ where: { tenantId } })
    if (count <= 1) throw new ApiError('MINIMUM_TEMPLATE', 'Minimal harus ada satu template nota.', 400)

    await db.$transaction(async (tx) => {
      await tx.invoiceTemplate.delete({ where: { id } })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.INVOICE_TEMPLATE_DELETED,
        resourceType: 'InvoiceTemplate', resourceId: id,
        metadata: { name: template.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
