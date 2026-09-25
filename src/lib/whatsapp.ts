// WhatsApp MVP: provider berbasis deep-link wa.me (BUKAN API resmi — UI tidak mengklaim
// "terkirim otomatis", hanya membuka WhatsApp dengan pesan yang sudah disiapkan).
// Struktur siap di-adapter: tambahkan OfficialWhatsAppApiProvider di masa depan.

import { buildMessageItems } from '@/lib/whatsapp-items'

export const WA_PROVIDER = 'WaLinkProvider' as const

export const DEFAULT_WHATSAPP_TEMPLATE = `Halo {{customer_name}},

Terima kasih telah bertransaksi di {{store_name}}.

No. Nota: {{invoice_number}}
Tanggal: {{date}}

{{items}}

Subtotal: {{subtotal}}
Diskon: {{discount}}
Total: {{total}}
Pembayaran: {{payment_method}}

Terima kasih.`

/**
 * Token replacement sederhana dan aman — TANPA eval / arbitrary template engine.
 * Token yang tidak dikenal dibiarkan apa adanya.
 */
export function renderMessageTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(context, key) ? context[key] : match
  )
}

export function buildWaLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export { buildMessageItems }

export const WHATSAPP_TEMPLATE_TOKENS = [
  'customer_name',
  'store_name',
  'invoice_number',
  'date',
  'items',
  'subtotal',
  'discount',
  'tax',
  'total',
  'payment_method',
] as const
