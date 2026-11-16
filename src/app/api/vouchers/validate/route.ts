// POST /api/vouchers/validate — cek kode voucher untuk kasir (preview diskon).
// Dipanggil sebelum checkout; checkout melakukan validasi ulang penuh (atomic).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { voucherValidateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, handleApiError, requireUser } from '@/lib/api'
import { computeVoucherDiscount } from '@/lib/voucher'

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { tenantId } = await requireUser()
    const body = voucherValidateSchema.parse(await req.json())

    const voucher = await db.voucher.findFirst({ where: { tenantId, code: body.code } })
    if (!voucher) throw new ApiError('NOT_FOUND', 'Kode voucher tidak ditemukan.', 404)
    if (!voucher.isActive) throw new ApiError('VOUCHER_INACTIVE', 'Voucher tidak aktif.', 400)
    if (voucher.expiresAt && voucher.expiresAt.getTime() < Date.now()) {
      throw new ApiError('VOUCHER_EXPIRED', 'Voucher sudah kedaluwarsa.', 400)
    }
    if (voucher.usageLimit !== null && voucher.usageCount >= voucher.usageLimit) {
      throw new ApiError('VOUCHER_EXHAUSTED', 'Kuota pemakaian voucher sudah habis.', 400)
    }
    if (body.subtotal < voucher.minPurchase) {
      throw new ApiError(
        'MIN_PURCHASE',
        `Minimal belanja Rp ${voucher.minPurchase.toLocaleString('id-ID')} untuk pakai voucher ini.`,
        400
      )
    }

    const discount = computeVoucherDiscount(voucher.type, voucher.value, voucher.maxDiscount, body.subtotal)
    return NextResponse.json({
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      discount,
      minPurchase: voucher.minPurchase,
    })
  } catch (err) {
    return handleApiError(err)
  }
}
