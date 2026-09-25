// GET  /api/invoice-templates — daftar template nota milik tenant
// POST /api/invoice-templates — buat template (config tervalidasi Zod — bukan raw HTML)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { invoiceTemplateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toInvoiceTemplateDTO } from '@/lib/services/serializers'

export async function GET() {
  try {
    const { tenantId } = await requireUser()
    const templates = await db.invoiceTemplate.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] })
    return NextResponse.json({ data: templates.map(toInvoiceTemplateDTO) })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = invoiceTemplateSchema.parse(await req.json())

    const count = await db.invoiceTemplate.count({ where: { tenantId } })
    if (count >= 20) throw new ApiError('LIMIT_REACHED', 'Maksimal 20 template nota.', 400)

    const template = await db.$transaction(async (tx) => {
      const created = await tx.invoiceTemplate.create({
        data: {
          tenantId,
          name: body.name,
          config: JSON.stringify(body.config),
          isDefault: false,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.INVOICE_TEMPLATE_CREATED,
        resourceType: 'InvoiceTemplate', resourceId: created.id,
        metadata: { name: created.name, paperSize: body.config.paperSize },
        ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })
    return NextResponse.json(toInvoiceTemplateDTO(template), { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
