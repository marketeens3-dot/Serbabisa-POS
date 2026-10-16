// Validasi Zod — server TIDAK mempercayai input client; semua divalidasi ulang di sini.
// Strategi API: hanya pakai API stabil yang identik di Zod 3/4 (string/number/object/array).

import { z } from 'zod'
import { normalizeIndonesianPhone } from '@/lib/phone'
import { FIELD_LIMITS, MAX_LOGO_BYTES, MAX_TRANSACTION_ITEMS } from '@/lib/constants'
import { invoiceConfigSchema } from '@/lib/invoice'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// 300KB base64 ≈ 300 * 1024 * 4/3
const MAX_LOGO_DATA_URL_LENGTH = Math.ceil(MAX_LOGO_BYTES * 1.4) + 64

const emailField = z
  .string()
  .trim()
  .min(5, 'Email tidak valid')
  .max(FIELD_LIMITS.email, 'Email terlalu panjang')
  .regex(EMAIL_REGEX, 'Email tidak valid')
  .transform((v) => v.toLowerCase())

const nameField = z
  .string()
  .trim()
  .min(2, 'Nama minimal 2 karakter')
  .max(FIELD_LIMITS.name, 'Nama terlalu panjang')

// Telepon: tidak dikirim → undefined (JANGAN sentuh data lama); eksplisit null/'' → null (hapus);
// terisi → validasi lalu dinormalisasi (628xxx).
// PENTING: transform TIDAK BOLEH mengembalikan null untuk input yang absen — guard
// `!== undefined` di route memakai undefined untuk membedakan "tidak dikirim" vs "hapus".
// (Bug lama: .optional().transform(→null) membuat setiap PATCH parsial menghapus data.)
const phoneField = z
  .union([z.string().trim().max(FIELD_LIMITS.phone, 'Nomor HP terlalu panjang'), z.null()])
  .optional()
  .refine((v) => v === undefined || v === null || v === '' || normalizeIndonesianPhone(v) !== null, 'Nomor HP tidak valid')
  .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : normalizeIndonesianPhone(v)))

const moneyField = z
  .number({ message: 'Nilai harus berupa angka' })
  .int('Nilai harus bilangan bulat rupiah')
  .min(0, 'Nilai tidak boleh negatif')
  .max(1_000_000_000, 'Nilai terlalu besar')

const qtyField = z
  .number({ message: 'Jumlah harus berupa angka' })
  .min(0, 'Jumlah tidak boleh negatif')
  .max(100_000, 'Jumlah terlalu besar')
  .refine((v) => Math.round(v * 1000) === v * 1000, 'Jumlah maksimal 3 desimal')

// Enum helper dengan pesan Indonesia (aman lintas versi Zod).
function enumField<const T extends readonly string[]>(values: T, message: string) {
  return z.string().refine((v) => (values as readonly string[]).includes(v), message)
}

const passwordPolicy = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(FIELD_LIMITS.password, 'Password terlalu panjang')
  .regex(/[a-zA-Z]/, 'Password harus mengandung huruf')
  .regex(/[0-9]/, 'Password harus mengandung angka')

// ---------- AUTH ----------
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password wajib diisi').max(FIELD_LIMITS.password),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password saat ini wajib diisi').max(FIELD_LIMITS.password),
  newPassword: passwordPolicy,
})

// ---------- ADMIN ----------
export const createUserSchema = z.object({
  fullName: nameField,
  email: emailField,
  phone: phoneField,
  businessName: z.string().trim().min(2, 'Nama toko minimal 2 karakter').max(FIELD_LIMITS.name, 'Nama toko terlalu panjang'),
  whatsappNumber: phoneField,
  address: z.string().trim().max(FIELD_LIMITS.address, 'Alamat terlalu panjang').nullish(),
  password: passwordPolicy.optional(), // kosong → server generate password sementara
  status: enumField(['ACTIVE', 'INACTIVE'] as const, 'Status tidak valid').default('ACTIVE'),
})

export const updateUserSchema = z.object({
  fullName: nameField.optional(),
  email: emailField.optional(),
  phone: phoneField.optional(),
  businessName: z.string().trim().min(2, 'Nama toko minimal 2 karakter').max(FIELD_LIMITS.name).optional(),
  whatsappNumber: phoneField.optional(),
  address: z.string().trim().max(FIELD_LIMITS.address).nullish(),
})

export const adminSettingsSchema = z.object({
  appName: z.string().trim().min(2, 'Nama aplikasi minimal 2 karakter').max(60).optional(),
  systemNotice: z.string().trim().max(300, 'Notifikasi maksimal 300 karakter').nullish(),
})

// ---------- CATALOG ----------
export const catalogItemSchema = z.object({
  type: enumField(['PRODUCT', 'SERVICE'] as const, 'Jenis item tidak valid'),
  name: nameField,
  sku: z
    .union([z.string().trim().max(FIELD_LIMITS.sku, 'SKU terlalu panjang'), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? null : v.toUpperCase())),
  barcode: z
    .union([z.string().trim().regex(/^[0-9A-Za-z-]+$/, 'Barcode hanya boleh huruf/angka').max(FIELD_LIMITS.barcode, 'Barcode terlalu panjang'), z.null()])
    .optional()
    .transform((v) => (v == null || v === '' ? null : v)),
  description: z.string().trim().max(FIELD_LIMITS.description, 'Deskripsi terlalu panjang').nullish(),
  categoryId: z.union([z.string().min(1), z.null()]).optional(),
  costPrice: moneyField.default(0),
  sellingPrice: moneyField,
  stockQty: qtyField.default(0),
  minStockQty: qtyField.default(0),
  unit: z.string().trim().max(FIELD_LIMITS.unit, 'Satuan terlalu panjang').default('pcs'),
})

export const categorySchema = z.object({
  name: nameField,
  description: z.string().trim().max(FIELD_LIMITS.description, 'Deskripsi terlalu panjang').nullish(),
})

export const categoryUpdateSchema = categorySchema.partial()

// ---------- CUSTOMER ----------
export const customerSchema = z.object({
  name: nameField,
  phone: phoneField,
  email: z
    .union([z.string().trim().max(FIELD_LIMITS.email), z.null()])
    .optional()
    .refine((v) => v === undefined || v === null || v === '' || EMAIL_REGEX.test(v), 'Email tidak valid')
    .transform((v) => (v === undefined ? undefined : v === '' || v === null ? null : v.toLowerCase())),
  address: z.string().trim().max(FIELD_LIMITS.address, 'Alamat terlalu panjang').nullish(),
  notes: z.string().trim().max(FIELD_LIMITS.notes, 'Catatan terlalu panjang').nullish(),
})

export const customerUpdateSchema = customerSchema.partial()

// ---------- TRANSAKSI ----------
export const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.string().min(1, 'Item tidak valid'),
        quantity: z
          .number({ message: 'Jumlah harus berupa angka' })
          .min(0.001, 'Jumlah minimal 0.001')
          .max(100_000, 'Jumlah terlalu besar')
          .refine((v) => Math.round(v * 1000) === v * 1000, 'Jumlah maksimal 3 desimal'),
      })
    )
    .min(1, 'Keranjang masih kosong')
    .max(MAX_TRANSACTION_ITEMS, `Maksimal ${MAX_TRANSACTION_ITEMS} item per transaksi`),
  customerId: z.union([z.string().min(1), z.null()]).optional(),
  discountAmount: moneyField.default(0),
  taxAmount: moneyField.default(0),
  paymentMethod: enumField(['CASH', 'TRANSFER', 'QRIS', 'OTHER'] as const, 'Metode pembayaran tidak valid'),
  paidAmount: z
    .number({ message: 'Jumlah bayar harus berupa angka' })
    .int('Jumlah bayar harus bilangan bulat rupiah')
    .min(0, 'Jumlah bayar tidak boleh negatif')
    .max(1_000_000_000_000, 'Jumlah bayar terlalu besar'),
  notes: z.string().trim().max(500, 'Catatan terlalu panjang').nullish(),
  idempotencyKey: z.union([z.string().min(8).max(64), z.null()]).optional(),
  /**
   * Total yang benar-benar dibayar pelanggan di toko, diisi HANYA oleh klien
   * native yang mencatat transaksi saat offline lalu mengirimkannya nanti.
   *
   * Gunanya: server tetap menghitung totalnya sendiri dari harga terkini (anti
   * price tampering), tapi kalau hasilnya berbeda dari yang terjadi di toko,
   * transaksi harus DITOLAK dengan pesan yang bisa ditindaklanjuti kasir —
   * bukan diam-diam disimpan dengan angka lain, dan bukan juga sekadar
   * "pembayaran kurang" yang tidak menjelaskan apa pun.
   */
  clientTotal: moneyField.optional(),
})

export const voidSchema = z.object({
  reason: z.string().trim().min(3, 'Alasan pembatalan wajib diisi (minimal 3 karakter)').max(500, 'Alasan terlalu panjang'),
})

// ---------- REFUND ----------
export const refundSchema = z.object({
  items: z
    .array(
      z.object({
        transactionItemId: z.string().min(1, 'Item transaksi tidak valid'),
        quantity: z
          .number({ message: 'Jumlah refund harus berupa angka' })
          .min(0.001, 'Jumlah refund minimal 0.001')
          .max(100_000, 'Jumlah refund terlalu besar')
          .refine((v) => Math.round(v * 1000) === v * 1000, 'Jumlah maksimal 3 desimal'),
      })
    )
    .min(1, 'Pilih minimal satu item untuk direfund'),
  reason: z.string().trim().min(3, 'Alasan refund wajib diisi (minimal 3 karakter)').max(500, 'Alasan terlalu panjang'),
})

// ---------- PENYESUAIAN STOK (OPNAME) ----------
export const stockAdjustSchema = z.object({
  newQty: z
    .number({ message: 'Stok baru harus berupa angka' })
    .min(0, 'Stok tidak boleh negatif')
    .max(10_000_000, 'Stok terlalu besar')
    .refine((v) => Math.round(v * 1000) === v * 1000, 'Stok maksimal 3 desimal'),
  reason: enumField(['OPNAME', 'RUSAK', 'HILANG', 'RETUR_SUPPLIER', 'KOREKSI'] as const, 'Alasan penyesuaian tidak valid'),
  note: z.string().trim().max(200, 'Catatan terlalu panjang (maksimal 200 karakter)').nullish(),
})

// ---------- NOTA ----------
export const invoiceTemplateSchema = z.object({
  name: z.string().trim().min(2, 'Nama template minimal 2 karakter').max(60, 'Nama template terlalu panjang'),
  config: invoiceConfigSchema,
})

// ---------- PENGATURAN ----------
const DATA_URL_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

export const settingsSchema = z
  .object({
    businessName: z.string().trim().min(2, 'Nama toko minimal 2 karakter').max(FIELD_LIMITS.name).optional(),
    phone: phoneField.optional(),
    whatsappNumber: phoneField.optional(),
    address: z.string().trim().max(FIELD_LIMITS.address, 'Alamat terlalu panjang').nullish(),
    logoUrl: z
      .string()
      .max(MAX_LOGO_DATA_URL_LENGTH, 'Logo terlalu besar (maksimal 300KB)')
      .regex(DATA_URL_IMAGE, 'Logo harus gambar PNG/JPG/WEBP')
      .nullish(),
    whatsappTemplate: z.string().max(FIELD_LIMITS.whatsappTemplate, 'Template terlalu panjang (maksimal 1500 karakter)').optional(),
    defaultPaymentMethod: enumField(['CASH', 'TRANSFER', 'QRIS', 'OTHER'] as const, 'Metode pembayaran tidak valid').optional(),
    defaultTemplateId: z.string().min(1).nullish(),
    requireActiveShift: z.boolean().optional(),
  })
  .partial()

export const profileSchema = z.object({
  fullName: nameField,
  phone: phoneField,
})

export const whatsappRequestSchema = z.object({
  transactionId: z.string().min(1, 'ID transaksi wajib diisi'),
})

// ---------- SESI KASIR (SHIFT) ----------
export const openCashSessionSchema = z.object({
  openingCash: z
    .number({ message: 'Kas awal harus berupa angka' })
    .int('Kas awal harus bilangan bulat rupiah')
    .min(0, 'Kas awal tidak boleh negatif')
    .max(1_000_000_000, 'Kas awal terlalu besar'),
})

export const closeCashSessionSchema = z.object({
  closingCash: z
    .number({ message: 'Hasil hitung kas harus berupa angka' })
    .int('Hasil hitung kas harus bilangan bulat rupiah')
    .min(0, 'Hasil hitung kas tidak boleh negatif')
    .max(2_000_000_000, 'Hasil hitung kas terlalu besar'),
  notes: z.string().trim().max(FIELD_LIMITS.notes, 'Catatan terlalu panjang').nullish(),
})

// ---------- TYPE INFERENCE ----------
export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type CatalogItemInput = z.infer<typeof catalogItemSchema>
export type CustomerInput = z.infer<typeof customerSchema>
export type CheckoutInput = z.infer<typeof checkoutSchema>
export type RefundInput = z.infer<typeof refundSchema>
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>
export type SettingsInput = z.infer<typeof settingsSchema>
export type InvoiceTemplateInput = z.infer<typeof invoiceTemplateSchema>
