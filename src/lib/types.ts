// Tipe DTO yang dikirim server → client (bentuk JSON). Field internal sensitif
// (passwordHash, tokenHash, costPrice untuk kasir) TIDAK dilewatkan ke client.

import type { InvoiceTemplateConfig } from '@/lib/invoice'

export type Role = 'SUPER_ADMIN' | 'USER'
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type CatalogType = 'PRODUCT' | 'SERVICE'
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'QRIS' | 'OTHER'
export type TransactionStatus = 'COMPLETED' | 'VOID' | 'REFUNDED'
export type CashSessionStatus = 'OPEN' | 'CLOSED'

export type SessionUserDTO = {
  id: string
  email: string
  fullName: string
  phone: string | null
  role: Role
  mustChangePassword: boolean
  tenant: TenantDTO | null
}

export type TenantDTO = {
  id: string
  businessName: string
  slug: string
  phone: string | null
  whatsappNumber: string | null
  address: string | null
  logoUrl: string | null
  currency: string
  timezone: string
}

export type TenantInvoiceSettings = {
  whatsappTemplate?: string
  defaultPaymentMethod?: PaymentMethod
  defaultTemplateId?: string | null
  /** Wajib shift aktif sebelum checkout kasir (default false). */
  requireActiveShift?: boolean
}

export type CategoryDTO = {
  id: string
  name: string
  description: string | null
  isActive: boolean
  itemCount?: number
  createdAt: string
}

export type CatalogItemDTO = {
  id: string
  type: CatalogType
  name: string
  sku: string | null
  barcode: string | null
  description: string | null
  categoryId: string | null
  categoryName?: string | null
  sellingPrice: number
  /** Diskon per unit (Rp) — harga jadi = sellingPrice − discountAmount. */
  discountAmount: number
  stockQty: number
  minStockQty: number
  unit: string
  isActive: boolean
  isLowStock?: boolean
  createdAt: string
}

/** Entri ringkas produk stok menipis (badge navigasi & kartu peringatan). */
export type StockAlertDTO = {
  id: string
  name: string
  stockQty: number
  minStockQty: number
  unit: string
}

export type StockAlertsDTO = {
  data: StockAlertDTO[]
  count: number
}

export type CustomerDTO = {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  transactionCount?: number
  totalSpent?: number
  lastTransactionAt?: string | null
  createdAt: string
}

export type TransactionItemDTO = {
  id: string
  catalogItemId: string | null
  itemType: CatalogType
  itemNameSnapshot: string
  skuSnapshot: string | null
  quantity: number
  unitPrice: number
  /** NET baris: round(qty × unitPrice) − discountAmount. */
  subtotal: number
  /** Diskon Rp untuk baris ini (0 = tanpa diskon item). */
  discountAmount: number
  /** Persen diskon baris (0 = nominal manual / tanpa diskon) — untuk nota. */
  discountPercent: number
  refundedQty: number
}

export type TransactionDTO = {
  id: string
  invoiceNumber: string
  subtotal: number
  discountAmount: number
  discountPercent: number
  taxAmount: number
  totalAmount: number
  paidAmount: number
  changeAmount: number
  paymentMethod: PaymentMethod
  status: TransactionStatus
  notes: string | null
  voidReason: string | null
  voidedAt: string | null
  refundedAmount: number
  refundReason: string | null
  refundedAt: string | null
  createdAt: string
  cashierId: string
  cashierName?: string | null
  customerId: string | null
  customerName?: string | null
  customerPhone?: string | null
  items?: TransactionItemDTO[]
}

export type InventoryMovementDTO = {
  id: string
  movementType: string
  quantity: number
  note: string | null
  createdAt: string
  transactionId: string | null
  invoiceNumber: string | null
}

export type InvoiceTemplateDTO = {
  id: string
  name: string
  config: InvoiceTemplateConfig
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export type CashSessionSummaryDTO = {
  transactionCount: number
  cashTotal: number
  nonCashTotal: number
  total: number
  expectedCash: number
}

export type CashSessionDTO = {
  id: string
  status: CashSessionStatus
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  difference: number | null
  notes: string | null
  openedAt: string
  closedAt: string | null
  userName: string | null
}

export type CashSessionReportDTO = CashSessionDTO & {
  summary: CashSessionSummaryDTO
  byMethod: { method: PaymentMethod; count: number; total: number }[]
  transactions: TransactionDTO[]
}

/** Respons GET /api/cash-sessions/current — flag toko ikut dibawa agar POS tahu tanpa fetch tambahan. */
export type CurrentCashSessionDTO = {
  session: CashSessionDTO | null
  live: CashSessionSummaryDTO | null
  requireActiveShift: boolean
}

export type AuditLogDTO = {
  id: string
  action: string
  resourceType: string | null
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  actorName: string | null
  actorEmail: string | null
  tenantName?: string | null
}

export type AdminUserDTO = {
  id: string
  fullName: string
  email: string
  phone: string | null
  role: Role
  status: UserStatus
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  tenant: {
    id: string
    businessName: string
    slug: string
    phone: string | null
    whatsappNumber: string | null
    address: string | null
    isActive: boolean
    createdAt: string
  } | null
  transactionCount?: number
}

export type Paginated<T> = {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type DashboardMetricsDTO = {
  salesToday: number
  transactionsToday: number
  averageTransaction: number
  itemsSoldToday: number
  salesThisMonth: number
  transactionsThisMonth: number
  lowStockCount: number
  lowStockItems: { id: string; name: string; stockQty: number; minStockQty: number; unit: string }[]
  recentTransactions: TransactionDTO[]
  salesLast7Days: { ymd: string; label: string; total: number; count: number }[]
  topItems: { id: string; name: string; type: CatalogType; qty: number; revenue: number }[]
}

export type AdminDashboardDTO = {
  totalUsers: number
  activeUsers: number
  inactiveUsers: number
  totalTenants: number
  activeTenants: number
  transactionsToday: number
  transactionsThisMonth: number
  salesToday: number
  salesThisMonth: number
  transactionsLast7Days: { ymd: string; label: string; total: number; count: number }[]
  recentUsers: AdminUserDTO[]
  recentAuditEvents: AuditLogDTO[]
  health: { database: 'OK' | 'ERROR'; activeSessions: number }
}

export type WaLinkResult = {
  url: string
  phone: string
  message: string
}
