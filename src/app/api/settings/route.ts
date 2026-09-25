// GET   /api/settings — info toko + pengaturan nota/WhatsApp/preferensi (tenant session)
// PATCH /api/settings — update info toko / template WhatsApp / preferensi
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { settingsSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { parseInvoiceSettings } from '@/lib/services/tenant'
import type { SessionUserDTO } from '@/lib/types'

export async function GET() {
  try {
    const { tenantId } = await requireUser()
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
    return NextResponse.json({ settings: parseInvoiceSettings(tenant?.invoiceSettings) })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = settingsSchema.parse(await req.json())
    if (Object.keys(body).length === 0) throw new ApiError('INVALID_INPUT', 'Tidak ada perubahan.', 422)
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    // Validasi kepemilikan template default.
    if (body.defaultTemplateId) {
      const tpl = await db.invoiceTemplate.findFirst({ where: { id: body.defaultTemplateId, tenantId } })
      if (!tpl) throw new ApiError('TEMPLATE_NOT_FOUND', 'Template nota tidak ditemukan.', 404)
    }

    const tenantRow = await db.tenant.findUnique({ where: { id: tenantId } })
    const current = parseInvoiceSettings(tenantRow?.invoiceSettings)
    const nextSettings = {
      whatsappTemplate: body.whatsappTemplate ?? current.whatsappTemplate,
      defaultPaymentMethod: body.defaultPaymentMethod ?? current.defaultPaymentMethod,
      defaultTemplateId: body.defaultTemplateId !== undefined ? body.defaultTemplateId : current.defaultTemplateId,
      requireActiveShift: body.requireActiveShift !== undefined ? body.requireActiveShift : current.requireActiveShift,
    }

    const tenant = await db.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          ...(body.businessName !== undefined ? { businessName: body.businessName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
          ...(body.whatsappNumber !== undefined ? { whatsappNumber: body.whatsappNumber } : {}),
          ...(body.address !== undefined ? { address: body.address ?? null } : {}),
          ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl ?? null } : {}),
          invoiceSettings: JSON.stringify(nextSettings),
        },
      })
      // Sinkronkan flag default di tabel template.
      if (body.defaultTemplateId) {
        await tx.invoiceTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } })
        await tx.invoiceTemplate.update({ where: { id: body.defaultTemplateId }, data: { isDefault: true } })
      }
      const fields = Object.keys(body)
      await logAudit(tx, {
        actorUserId: user.id, tenantId,
        action: body.logoUrl !== undefined && fields.length === 1 ? AUDIT_ACTIONS.STORE_LOGO_UPDATED : AUDIT_ACTIONS.STORE_SETTINGS_UPDATED,
        resourceType: 'Tenant', resourceId: tenantId,
        metadata: { updatedFields: fields }, ipAddress: ip, userAgent: ua,
      })
      return updated
    })

    const userDTO: SessionUserDTO['tenant'] = {
      id: tenant.id,
      businessName: tenant.businessName,
      slug: tenant.slug,
      phone: tenant.phone,
      whatsappNumber: tenant.whatsappNumber,
      address: tenant.address,
      logoUrl: tenant.logoUrl,
      currency: tenant.currency,
      timezone: tenant.timezone,
    }
    return NextResponse.json({ tenant: userDTO, settings: parseInvoiceSettings(tenant.invoiceSettings) })
  } catch (err) {
    return handleApiError(err)
  }
}
