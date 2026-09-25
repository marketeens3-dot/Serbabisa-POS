// Layanan tenant: pembuatan tenant + template nota bawaan + pengaturan invoice default.
// Dipakai oleh seed & API admin (single source of truth).

import type { Prisma } from '@prisma/client'
import { BUILTIN_TEMPLATE_PRESETS } from '@/lib/invoice'
import { DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/whatsapp'

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'toko'
  )
}

export async function generateUniqueSlug(
  tx: Prisma.TransactionClient,
  businessName: string
): Promise<string> {
  const base = slugify(businessName)
  let slug = base
  let i = 1
  while (await tx.tenant.findUnique({ where: { slug } })) {
    i += 1
    slug = `${base}-${i}`.slice(0, 48)
    if (i > 50) slug = `${base}-${Date.now().toString(36)}`
  }
  return slug
}

export type InvoiceSettings = {
  whatsappTemplate: string
  defaultPaymentMethod: 'CASH' | 'TRANSFER' | 'QRIS' | 'OTHER'
  defaultTemplateId: string | null
  /** Wajib shift aktif sebelum checkout kasir (default false — perilaku lama). */
  requireActiveShift: boolean
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
  defaultPaymentMethod: 'CASH',
  defaultTemplateId: null,
  requireActiveShift: false,
}

export function parseInvoiceSettings(raw: string | null | undefined): InvoiceSettings {
  if (!raw) return { ...DEFAULT_INVOICE_SETTINGS }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      whatsappTemplate:
        typeof parsed.whatsappTemplate === 'string' && parsed.whatsappTemplate.length <= 1500
          ? parsed.whatsappTemplate
          : DEFAULT_WHATSAPP_TEMPLATE,
      defaultPaymentMethod:
        parsed.defaultPaymentMethod === 'CASH' ||
        parsed.defaultPaymentMethod === 'TRANSFER' ||
        parsed.defaultPaymentMethod === 'QRIS' ||
        parsed.defaultPaymentMethod === 'OTHER'
          ? parsed.defaultPaymentMethod
          : 'CASH',
      defaultTemplateId: typeof parsed.defaultTemplateId === 'string' ? parsed.defaultTemplateId : null,
      requireActiveShift: parsed.requireActiveShift === true,
    }
  } catch {
    return { ...DEFAULT_INVOICE_SETTINGS }
  }
}

/** Buat 4 template nota bawaan untuk tenant baru (Default/Minimal/Thermal/A4). */
export async function createDefaultInvoiceTemplates(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  let defaultId = ''
  for (const preset of BUILTIN_TEMPLATE_PRESETS) {
    const created = await tx.invoiceTemplate.create({
      data: {
        tenantId,
        name: preset.name,
        config: JSON.stringify(preset.config),
        isDefault: preset.isDefault,
      },
    })
    if (preset.isDefault) defaultId = created.id
  }
  return defaultId
}

/** Data tenant baru lengkap: tenant + template nota + invoice settings terisi. */
export async function createTenantWithTemplates(
  tx: Prisma.TransactionClient,
  data: {
    businessName: string
    phone?: string | null
    whatsappNumber?: string | null
    address?: string | null
  }
): Promise<{ id: string; slug: string; defaultTemplateId: string }> {
  const slug = await generateUniqueSlug(tx, data.businessName)
  const tenant = await tx.tenant.create({
    data: {
      businessName: data.businessName,
      slug,
      phone: data.phone ?? null,
      whatsappNumber: data.whatsappNumber ?? null,
      address: data.address ?? null,
      invoiceSettings: JSON.stringify(DEFAULT_INVOICE_SETTINGS),
    },
  })
  const defaultTemplateId = await createDefaultInvoiceTemplates(tx, tenant.id)
  return { id: tenant.id, slug: tenant.slug, defaultTemplateId }
}
