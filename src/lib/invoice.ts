// Konfigurasi template nota — typed + Zod (server memvalidasi ulang; BUKAN raw HTML dari user,
// sehingga builder nota bukan jalur XSS — renderer membaca config object, bukan string HTML).

import { z } from 'zod'

export type PaperSize = '58mm' | '80mm' | 'A4'

export type InvoiceTemplateConfig = {
  paperSize: PaperSize
  showLogo: boolean
  showAddress: boolean
  showPhone: boolean
  showCustomer: boolean
  showCustomerPhone: boolean
  showSku: boolean
  showPaymentMethod: boolean
  showTax: boolean
  headerText: string
  footerText: string
  accentColor: string
  fontSize: number
  lineSpacing: number
  invoiceTitle: string
}

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Warna harus kode hex, mis. #111827')

export const invoiceConfigSchema = z.object({
  paperSize: z.enum(['58mm', '80mm', 'A4']).default('80mm'),
  showLogo: z.boolean().default(true),
  showAddress: z.boolean().default(true),
  showPhone: z.boolean().default(true),
  showCustomer: z.boolean().default(true),
  showCustomerPhone: z.boolean().default(false),
  showSku: z.boolean().default(false),
  showPaymentMethod: z.boolean().default(true),
  showTax: z.boolean().default(true),
  headerText: z.string().max(200).default(''),
  footerText: z.string().max(300).default('Terima kasih telah berbelanja'),
  accentColor: hexColor.default('#111827'),
  fontSize: z.number().min(8).max(18).default(12),
  lineSpacing: z.number().min(1).max(1.8).default(1.2),
  invoiceTitle: z.string().max(60).default('NOTA PENJUALAN'),
})

export const DEFAULT_INVOICE_CONFIG: InvoiceTemplateConfig = {
  paperSize: '80mm',
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showCustomer: true,
  showCustomerPhone: false,
  showSku: false,
  showPaymentMethod: true,
  showTax: true,
  headerText: '',
  footerText: 'Terima kasih telah berbelanja',
  accentColor: '#111827',
  fontSize: 12,
  lineSpacing: 1.2,
  invoiceTitle: 'NOTA PENJUALAN',
}

/** Parse aman JSON config dari DB — fallback ke default jika rusak. */
export function parseInvoiceConfig(raw: string | null | undefined): InvoiceTemplateConfig {
  if (!raw) return { ...DEFAULT_INVOICE_CONFIG }
  try {
    const parsed = invoiceConfigSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data as InvoiceTemplateConfig
  } catch {
    // abaikan — fallback default
  }
  return { ...DEFAULT_INVOICE_CONFIG }
}

/** Template bawaan yang dibuat otomatis untuk setiap tenant baru. */
export const BUILTIN_TEMPLATE_PRESETS: { name: string; isDefault: boolean; config: InvoiceTemplateConfig }[] = [
  {
    name: 'Default',
    isDefault: true,
    config: { ...DEFAULT_INVOICE_CONFIG },
  },
  {
    name: 'Minimal',
    isDefault: false,
    config: {
      ...DEFAULT_INVOICE_CONFIG,
      paperSize: '58mm',
      showLogo: false,
      showAddress: false,
      showPhone: false,
      showCustomer: false,
      showSku: false,
      showTax: false,
      fontSize: 10,
      invoiceTitle: 'NOTA',
      footerText: 'Terima kasih',
    },
  },
  {
    name: 'Thermal',
    isDefault: false,
    config: {
      ...DEFAULT_INVOICE_CONFIG,
      paperSize: '80mm',
      showCustomer: true,
      showCustomerPhone: true,
      showSku: true,
      fontSize: 11,
      lineSpacing: 1.15,
      invoiceTitle: 'STRUK PENJUALAN',
    },
  },
  {
    name: 'A4',
    isDefault: false,
    config: {
      ...DEFAULT_INVOICE_CONFIG,
      paperSize: 'A4',
      fontSize: 14,
      lineSpacing: 1.4,
      invoiceTitle: 'INVOICE',
      footerText: 'Terima kasih atas kepercayaan Anda',
    },
  },
]
