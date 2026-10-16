// Serializer DB row → DTO client. Menyembunyikan field internal (passwordHash, tokenHash,
// costPrice untuk kasir) agar data sensitif tidak pernah sampai ke browser.

import type { SessionUser } from '@/lib/auth'
import type {
  AdminUserDTO,
  AuditLogDTO,
  CashSessionDTO,
  CatalogItemDTO,
  CategoryDTO,
  CustomerDTO,
  InvoiceTemplateDTO,
  SessionUserDTO,
  TransactionDTO,
  TransactionItemDTO,
} from '@/lib/types'
import { parseInvoiceConfig } from '@/lib/invoice'

export function toCategoryDTO(row: {
  id: string
  name: string
  description: string | null
  isActive: boolean
  createdAt: Date
  _count?: { items: number }
}): CategoryDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    itemCount: row._count?.items ?? 0,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toSessionUserDTO(u: SessionUser): SessionUserDTO {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    tenant: u.tenant
      ? {
          id: u.tenant.id,
          businessName: u.tenant.businessName,
          slug: u.tenant.slug,
          phone: u.tenant.phone,
          whatsappNumber: u.tenant.whatsappNumber,
          address: u.tenant.address,
          logoUrl: u.tenant.logoUrl,
          currency: u.tenant.currency,
          timezone: u.tenant.timezone,
        }
      : null,
  }
}

type ItemRow = {
  id: string
  type: string
  name: string
  sku: string | null
  barcode: string | null
  description: string | null
  categoryId: string | null
  category?: { name: string } | null
  sellingPrice: number
  stockQty: number
  minStockQty: number
  unit: string
  isActive: boolean
  createdAt: Date
}

export function toCatalogItemDTO(row: ItemRow): CatalogItemDTO {
  return {
    id: row.id,
    type: row.type as CatalogItemDTO['type'],
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    description: row.description,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    sellingPrice: row.sellingPrice,
    stockQty: row.stockQty,
    minStockQty: row.minStockQty,
    unit: row.unit,
    isActive: row.isActive,
    isLowStock: row.type === 'PRODUCT' && row.isActive && row.stockQty <= row.minStockQty,
    createdAt: row.createdAt.toISOString(),
  }
}

type CustomerRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  _count?: { transactions: number }
  transactions?: { totalAmount: number; createdAt: Date }[]
}

export function toCustomerDTO(row: CustomerRow): CustomerDTO {
  const recent = row.transactions ?? []
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    isActive: row.isActive,
    transactionCount: row._count?.transactions ?? recent.length,
    totalSpent: recent.reduce((s, t) => s + t.totalAmount, 0),
    lastTransactionAt: recent[0]?.createdAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

type TxItemRow = {
  id: string
  catalogItemId: string | null
  itemType: string
  itemNameSnapshot: string
  skuSnapshot: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  refundedQty?: number
}

export function toTransactionItemDTO(row: TxItemRow): TransactionItemDTO {
  return {
    id: row.id,
    catalogItemId: row.catalogItemId,
    itemType: row.itemType as TransactionItemDTO['itemType'],
    itemNameSnapshot: row.itemNameSnapshot,
    skuSnapshot: row.skuSnapshot,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    subtotal: row.subtotal,
    refundedQty: row.refundedQty ?? 0,
  }
}

type TxRow = {
  id: string
  invoiceNumber: string
  subtotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  changeAmount: number
  paymentMethod: string
  status: string
  notes: string | null
  voidReason: string | null
  voidedAt: Date | null
  refundedAmount: number
  refundReason: string | null
  refundedAt: Date | null
  createdAt: Date
  cashierId: string
  cashier?: { fullName: string } | null
  customerId: string | null
  customer?: { name: string; phone: string | null } | null
  items?: TxItemRow[]
}

export function toTransactionDTO(row: TxRow): TransactionDTO {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    discountPercent: row.discountPercent ?? 0,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    changeAmount: row.changeAmount,
    paymentMethod: row.paymentMethod as TransactionDTO['paymentMethod'],
    status: row.status as TransactionDTO['status'],
    notes: row.notes,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    refundedAmount: row.refundedAmount ?? 0,
    refundReason: row.refundReason ?? null,
    refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    cashierId: row.cashierId,
    cashierName: row.cashier?.fullName ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    customerPhone: row.customer?.phone ?? null,
    items: row.items?.map(toTransactionItemDTO),
  }
}

type TemplateRow = {
  id: string
  name: string
  config: string
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

export function toInvoiceTemplateDTO(row: TemplateRow): InvoiceTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    config: parseInvoiceConfig(row.config),
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type CashSessionRow = {
  id: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  difference: number | null
  status: string
  notes: string | null
  openedAt: Date
  closedAt: Date | null
  user?: { fullName: string } | null
}

export function toCashSessionDTO(row: CashSessionRow): CashSessionDTO {
  return {
    id: row.id,
    status: row.status as CashSessionDTO['status'],
    openingCash: row.openingCash,
    closingCash: row.closingCash,
    expectedCash: row.expectedCash,
    difference: row.difference,
    notes: row.notes,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    userName: row.user?.fullName ?? null,
  }
}

type AuditRow = {
  id: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: string | null
  ipAddress: string | null
  createdAt: Date
  actor?: { fullName: string; email: string } | null
  tenant?: { businessName: string } | null
}

export function toAuditLogDTO(row: AuditRow): AuditLogDTO {
  let metadata: Record<string, unknown> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata)
    } catch {
      metadata = null
    }
  }
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    metadata,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
    actorName: row.actor?.fullName ?? null,
    actorEmail: row.actor?.email ?? null,
    tenantName: row.tenant?.businessName ?? null,
  }
}

type AdminUserRow = {
  id: string
  fullName: string
  email: string
  phone: string | null
  role: string
  status: string
  mustChangePassword: boolean
  lastLoginAt: Date | null
  createdAt: Date
  tenant?: {
    id: string
    businessName: string
    slug: string
    phone: string | null
    whatsappNumber: string | null
    address: string | null
    isActive: boolean
    createdAt: Date
  } | null
  _count?: { transactions: number }
}

export function toAdminUserDTO(row: AdminUserRow): AdminUserDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role as AdminUserDTO['role'],
    status: row.status as AdminUserDTO['status'],
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    tenant: row.tenant
      ? {
          id: row.tenant.id,
          businessName: row.tenant.businessName,
          slug: row.tenant.slug,
          phone: row.tenant.phone ?? null,
          whatsappNumber: row.tenant.whatsappNumber ?? null,
          address: row.tenant.address ?? null,
          isActive: row.tenant.isActive,
          createdAt: row.tenant.createdAt.toISOString(),
        }
      : null,
    transactionCount: row._count?.transactions ?? 0,
  }
}
