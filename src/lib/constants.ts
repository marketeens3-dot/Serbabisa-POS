// Konstanta domain Serbabisa — single source of truth untuk nilai enum (SQLite tidak mendukung enum Prisma).

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  USER: 'USER',
} as const
export type Role = keyof typeof ROLES

export const USER_STATUSES = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const
export type UserStatus = keyof typeof USER_STATUSES

export const CATALOG_TYPES = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
} as const
export type CatalogType = keyof typeof CATALOG_TYPES

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  QRIS: 'QRIS',
  OTHER: 'OTHER',
  // Jual tempo (kredit) — checkout TEMPO membuat piutang (Debt RECEIVABLE) otomatis.
  // paidAmount = uang muka (DP); selisih menjadi piutang jatuh tempo.
  TEMPO: 'TEMPO',
} as const
export type PaymentMethod = keyof typeof PAYMENT_METHODS

export const TRANSACTION_STATUSES = {
  COMPLETED: 'COMPLETED',
  VOID: 'VOID',
  REFUNDED: 'REFUNDED',
} as const
export type TransactionStatus = keyof typeof TRANSACTION_STATUSES

// Alasan penyesuaian stok (opname) — label ID ditampilkan di UI.
export const STOCK_ADJUST_REASONS = {
  OPNAME: 'OPNAME',
  RUSAK: 'RUSAK',
  HILANG: 'HILANG',
  RETUR_SUPPLIER: 'RETUR_SUPPLIER',
  KOREKSI: 'KOREKSI',
} as const
export type StockAdjustReason = keyof typeof STOCK_ADJUST_REASONS

export const STOCK_ADJUST_REASON_LABELS: Record<StockAdjustReason, string> = {
  OPNAME: 'Stok Opname (hitung fisik)',
  RUSAK: 'Barang rusak',
  HILANG: 'Barang hilang',
  RETUR_SUPPLIER: 'Retur ke supplier',
  KOREKSI: 'Koreksi data',
}

export const INVENTORY_MOVEMENT_TYPES = {
  SALE: 'SALE',
  VOID_RETURN: 'VOID_RETURN',
  REFUND_RETURN: 'REFUND_RETURN',
  ADJUSTMENT: 'ADJUSTMENT',
  // Penerimaan barang dari PO supplier — menambah stok.
  PURCHASE_RECEIPT: 'PURCHASE_RECEIPT',
} as const
export type InventoryMovementType = keyof typeof INVENTORY_MOVEMENT_TYPES

export const CASH_SESSION_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const
export type CashSessionStatus = keyof typeof CASH_SESSION_STATUSES

// ---------- FINANS & OPERASIONAL (Tier 1 + 2) ----------
export const PROJECT_STATUSES = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const
export type ProjectStatus = keyof typeof PROJECT_STATUSES

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNED: 'Direncanakan',
  ACTIVE: 'Berjalan',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
}

export const CASHFLOW_DIRECTIONS = {
  IN: 'IN',
  OUT: 'OUT',
} as const
export type CashflowDirection = keyof typeof CASHFLOW_DIRECTIONS

export const CASHFLOW_SOURCES = {
  MANUAL: 'MANUAL',
  DEBT_PAYMENT: 'DEBT_PAYMENT',
  PURCHASE_CASH: 'PURCHASE_CASH',
} as const
export type CashflowSource = keyof typeof CASHFLOW_SOURCES

// Preset kategori cashflow — free-form juga boleh (bebas diisi pemilik toko).
export const CASHFLOW_CATEGORY_PRESETS = {
  IN: ['PENJUALAN_LAIN', 'SETORAN_MODAL', 'PELUNASAN_PIUTANG', 'PENDAPATAN_LAIN'],
  OUT: ['GAJI', 'SEWA', 'LISTRIK_AIR', 'BELI_BAHAN', 'TRANSPORT', 'KEMBALI_MODAL', 'PAJAK', 'LAINNYA'],
} as const

export const DEBT_TYPES = {
  RECEIVABLE: 'RECEIVABLE',
  PAYABLE: 'PAYABLE',
} as const
export type DebtType = keyof typeof DEBT_TYPES

export const DEBT_STATUSES = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
} as const
export type DebtStatus = keyof typeof DEBT_STATUSES

export const PO_STATUSES = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const
export type PoStatus = keyof typeof PO_STATUSES

export const VOUCHER_TYPES = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const
export type VoucherType = keyof typeof VOUCHER_TYPES

export const POINTS_LEDGER_TYPES = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUST: 'ADJUST',
} as const
export type PointsLedgerType = keyof typeof POINTS_LEDGER_TYPES

export const RAB_REALIZATION_SOURCES = {
  MANUAL: 'MANUAL',
  SALE: 'SALE',
} as const
export type RabRealizationSource = keyof typeof RAB_REALIZATION_SOURCES

// Loyalty: 1 poin per Rp 10.000 (dibulatkan ke bawah). Nilai tukar poin
// ditentukan pemilik toko saat redeem manual (diinput sebagai penyesuaian).
export const LOYALTY_EARN_DIVISOR = 10_000

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_LOCKED: 'LOGIN_LOCKED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  MUST_CHANGE_PASSWORD_ENFORCED: 'MUST_CHANGE_PASSWORD_ENFORCED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  ACCESS_RESET: 'ACCESS_RESET',
  ROLE_CHANGE_ATTEMPT: 'ROLE_CHANGE_ATTEMPT',
  TENANT_CREATED: 'TENANT_CREATED',
  TENANT_UPDATED: 'TENANT_UPDATED',
  TENANT_ACTIVATED: 'TENANT_ACTIVATED',
  TENANT_DEACTIVATED: 'TENANT_DEACTIVATED',
  STORE_SETTINGS_UPDATED: 'STORE_SETTINGS_UPDATED',
  STORE_LOGO_UPDATED: 'STORE_LOGO_UPDATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  CATEGORY_CREATED: 'CATEGORY_CREATED',
  CATEGORY_UPDATED: 'CATEGORY_UPDATED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_IMAGE_UPDATED: 'PRODUCT_IMAGE_UPDATED',
  PRODUCT_IMAGE_DELETED: 'PRODUCT_IMAGE_DELETED',
  PRODUCT_DEACTIVATED: 'PRODUCT_DEACTIVATED',
  PRODUCT_ACTIVATED: 'PRODUCT_ACTIVATED',
  SERVICE_CREATED: 'SERVICE_CREATED',
  SERVICE_UPDATED: 'SERVICE_UPDATED',
  SERVICE_DEACTIVATED: 'SERVICE_DEACTIVATED',
  SERVICE_ACTIVATED: 'SERVICE_ACTIVATED',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',
  CUSTOMER_DEACTIVATED: 'CUSTOMER_DEACTIVATED',
  CUSTOMER_ACTIVATED: 'CUSTOMER_ACTIVATED',
  TRANSACTION_CREATED: 'TRANSACTION_CREATED',
  TRANSACTION_VOIDED: 'TRANSACTION_VOIDED',
  TRANSACTION_REFUNDED: 'TRANSACTION_REFUNDED',
  STOCK_ADJUSTED: 'STOCK_ADJUSTED',
  CASH_SESSION_OPENED: 'CASH_SESSION_OPENED',
  CASH_SESSION_CLOSED: 'CASH_SESSION_CLOSED',
  INVOICE_TEMPLATE_CREATED: 'INVOICE_TEMPLATE_CREATED',
  INVOICE_TEMPLATE_UPDATED: 'INVOICE_TEMPLATE_UPDATED',
  INVOICE_TEMPLATE_DELETED: 'INVOICE_TEMPLATE_DELETED',
  INVOICE_DEFAULT_CHANGED: 'INVOICE_DEFAULT_CHANGED',
  WHATSAPP_MESSAGE_GENERATED: 'WHATSAPP_MESSAGE_GENERATED',
  ADMIN_SETTINGS_UPDATED: 'ADMIN_SETTINGS_UPDATED',
  CSV_EXPORTED: 'CSV_EXPORTED',
  EXPORT_XLSX: 'EXPORT_XLSX',
  EXPORT_PDF: 'EXPORT_PDF',
  // ---------- FINANS & OPERASIONAL (Tier 1 + 2) ----------
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  RAB_ITEM_ADDED: 'RAB_ITEM_ADDED',
  RAB_ITEM_UPDATED: 'RAB_ITEM_UPDATED',
  RAB_ITEM_DELETED: 'RAB_ITEM_DELETED',
  RAB_REALIZATION_ADDED: 'RAB_REALIZATION_ADDED',
  RAB_REALIZATION_DELETED: 'RAB_REALIZATION_DELETED',
  CASHFLOW_CREATED: 'CASHFLOW_CREATED',
  CASHFLOW_UPDATED: 'CASHFLOW_UPDATED',
  CASHFLOW_DELETED: 'CASHFLOW_DELETED',
  SUPPLIER_CREATED: 'SUPPLIER_CREATED',
  SUPPLIER_UPDATED: 'SUPPLIER_UPDATED',
  SUPPLIER_DELETED: 'SUPPLIER_DELETED',
  PO_CREATED: 'PO_CREATED',
  PO_UPDATED: 'PO_UPDATED',
  PO_SENT: 'PO_SENT',
  PO_RECEIVED: 'PO_RECEIVED',
  PO_CANCELLED: 'PO_CANCELLED',
  PO_DELETED: 'PO_DELETED',
  DEBT_CREATED: 'DEBT_CREATED',
  DEBT_PAYMENT_ADDED: 'DEBT_PAYMENT_ADDED',
  STOCK_OPNAME_CREATED: 'STOCK_OPNAME_CREATED',
  VOUCHER_CREATED: 'VOUCHER_CREATED',
  VOUCHER_UPDATED: 'VOUCHER_UPDATED',
  VOUCHER_DELETED: 'VOUCHER_DELETED',
  POINTS_ADJUSTED: 'POINTS_ADJUSTED',
} as const
export type AuditAction = keyof typeof AUDIT_ACTIONS

// Batas panjang field — payload tidak boleh arbitrarily besar.
export const FIELD_LIMITS = {
  name: 150,
  email: 254,
  phone: 30,
  address: 500,
  description: 1000,
  notes: 2000,
  sku: 50,
  barcode: 64,
  unit: 20,
  invoiceNumber: 40,
  whatsappTemplate: 1500,
  password: 128,
  code: 40,
  category: 50,
} as const

export const MAX_TRANSACTION_ITEMS = 200
// Batas logo SETELAH diproses sharp (disimpan sbg data URL di DB — jaga kuota Supabase free).
export const MAX_LOGO_BYTES = 300 * 1024
// Batas file logo YANG DIUNGGAH user (SEBELUM kompresi). Foto HP/logo desain umumnya 1-8MB;
// sharp akan resize 512x512 + re-encode WebP sehingga output selalu jauh di bawah MAX_LOGO_BYTES.
export const MAX_LOGO_UPLOAD_BYTES = 10 * 1024 * 1024

// ---------- GAMBAR PRODUK (Supabase Storage, selalu WebP) ----------
export const PRODUCT_IMAGE_BUCKET = "product-images"
// Sisi maksimal hasil resize (kartu kasir kecil; 800px cukup untuk dialog detail juga).
export const PRODUCT_IMAGE_SIZE = 800
// Batas hasil WebP SETELAH kompresi (jaga kuota bucket & kecepatan muat kasir).
export const PRODUCT_IMAGE_MAX_BYTES = 200 * 1024
// Batas file YANG DIUNGGAH user (SEBELUM kompresi sharp).
export const PRODUCT_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
