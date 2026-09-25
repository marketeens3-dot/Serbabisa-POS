// POST /api/whatsapp — buat pesan + tautan wa.me untuk transaksi milik tenant.
// MVP: WaLinkProvider (deep-link) — TIDAK mengklaim pengiriman otomatis.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { whatsappRequestSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { renderMessageTemplate, buildWaLink, DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/whatsapp'
import { buildMessageItems } from '@/lib/whatsapp-items'
import { parseInvoiceSettings } from '@/lib/services/tenant'
import { formatDateTimeID, formatIDR, formatQty } from '@/lib/format'
import { isValidWhatsappNumber } from '@/lib/phone'
import { toTransactionDTO } from '@/lib/services/serializers'
import { PAYMENT_METHODS } from '@/lib/constants'

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
  QRIS: 'QRIS',
  OTHER: 'Lainnya',
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = whatsappRequestSchema.parse(await req.json())

    // Transaksi WAJIB milik tenant — transaksi tenant lain → 404.
    const tx = await db.transaction.findFirst({
      where: { id: body.transactionId, tenantId },
      include: { items: true, customer: true, tenant: true },
    })
    if (!tx) throw new ApiError('NOT_FOUND', 'Transaksi tidak ditemukan.', 404)
    if (tx.status === 'VOID') throw new ApiError('VOIDED', 'Transaksi yang dibatalkan tidak dapat dikirim.', 400)

    const customerPhone = tx.customer?.phone ?? null
    if (!customerPhone || !isValidWhatsappNumber(customerPhone)) {
      throw new ApiError('NO_WHATSAPP', 'Pelanggan tidak memiliki nomor WhatsApp yang valid.', 400)
    }

    const settings = parseInvoiceSettings(tx.tenant.invoiceSettings)
    const message = renderMessageTemplate(settings.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE, {
      customer_name: tx.customer?.name ?? 'Pelanggan',
      store_name: tx.tenant.businessName,
      invoice_number: tx.invoiceNumber,
      date: formatDateTimeID(tx.createdAt),
      items: buildMessageItems(
        tx.items.map((i) => ({
          name: i.itemNameSnapshot,
          qty: formatQty(i.quantity),
          price: formatIDR(i.subtotal),
        }))
      ),
      subtotal: formatIDR(tx.subtotal),
      discount: formatIDR(tx.discountAmount),
      tax: formatIDR(tx.taxAmount),
      total: formatIDR(tx.totalAmount),
      payment_method: PAYMENT_LABELS[tx.paymentMethod] ?? tx.paymentMethod,
    })

    const url = buildWaLink(customerPhone, message)
    await logAudit(undefined, {
      actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.WHATSAPP_MESSAGE_GENERATED,
      resourceType: 'Transaction', resourceId: tx.id,
      metadata: { invoiceNumber: tx.invoiceNumber, provider: 'wa.me' },
      ipAddress: getClientIp(req), userAgent: getUserAgent(req),
    })
    void PAYMENT_METHODS

    return NextResponse.json({ url, phone: customerPhone, message, transaction: toTransactionDTO(tx) })
  } catch (err) {
    return handleApiError(err)
  }
}
