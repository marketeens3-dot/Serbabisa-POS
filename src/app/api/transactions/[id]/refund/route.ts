// POST /api/transactions/[id]/refund — refund parsial/total (atomic):
//   - Hanya COMPLETED (VOID/REFUNDED ditolak).
//   - Item-level: qty refund ≤ (quantity - refundedQty) per item.
//   - Nominal refund dihitung SERVER (client tidak bisa menyetel nilai uang):
//     pro-rata diskon+pajak → round(refundableSubtotal × totalAmount / subtotal).
//   - Stok produk dikembalikan + InventoryMovement REFUND_RETURN.
//   - Seluruh item terrefund → status REFUNDED & refundedAmount dipaksa = totalAmount
//     (menghilangkan drift pembulatan parsial kumulatif).
//   - Audit log TRANSACTION_REFUNDED.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refundSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toTransactionDTO } from '@/lib/services/serializers'

const roundQty = (v: number) => Math.round(v * 1000) / 1000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = refundSchema.parse(await req.json())

    const result = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id, tenantId },
        include: { items: true },
      })
      if (!transaction) throw new ApiError('NOT_FOUND', 'Transaksi tidak ditemukan.', 404)
      if (transaction.status === 'VOID') {
        throw new ApiError('TRANSACTION_VOID', 'Transaksi batal tidak dapat direfund.', 409)
      }
      if (transaction.status === 'REFUNDED') {
        throw new ApiError('TRANSACTION_ALREADY_REFUNDED', 'Transaksi ini sudah direfund penuh.', 409)
      }

      // Validasi item & hitung refundable subtotal (gross) — nominal uang murni server-side.
      const itemMap = new Map(transaction.items.map((it) => [it.id, it]))
      let refundableSubtotal = 0
      const plan: { itemId: string; qty: number; item: (typeof transaction.items)[number] }[] = []

      for (const reqItem of body.items) {
        const item = itemMap.get(reqItem.transactionItemId)
        if (!item) throw new ApiError('ITEM_NOT_FOUND', 'Item transaksi tidak ditemukan.', 404)
        const remaining = roundQty(item.quantity - item.refundedQty)
        if (reqItem.quantity > remaining + 1e-9) {
          throw new ApiError(
            'REFUND_QTY_EXCEEDED',
            `Qty refund ${item.itemNameSnapshot} melebihi sisa yang bisa direfund (${remaining}).`,
            422
          )
        }
        refundableSubtotal += reqItem.quantity * item.unitPrice
        plan.push({ itemId: item.id, qty: reqItem.quantity, item })
      }

      if (refundableSubtotal <= 0) throw new ApiError('INVALID_INPUT', 'Nominal refund harus lebih dari nol.', 422)

      // Pro-rata: rasio total/subtotal membawa diskon & pajak secara proporsional.
      const ratio = transaction.subtotal > 0 ? transaction.totalAmount / transaction.subtotal : 1
      let refundAmount = Math.round(refundableSubtotal * ratio)
      const remainingRefundableMoney = transaction.totalAmount - transaction.refundedAmount
      if (refundAmount > remainingRefundableMoney) refundAmount = remainingRefundableMoney
      if (refundAmount <= 0) throw new ApiError('INVALID_INPUT', 'Sisa nominal refund sudah habis.', 422)

      // Terapkan per item: kumulatif refundedQty + restock produk.
      const isFullRefund = transaction.items.every((it) =>
        plan.some((p) => p.itemId === it.id && roundQty(it.refundedQty + p.qty) >= it.quantity - 1e-9)
      )

      for (const p of plan) {
        const newRefundedQty = roundQty(p.item.refundedQty + p.qty)
        await tx.transactionItem.update({
          where: { id: p.itemId },
          data: { refundedQty: newRefundedQty },
        })
        if (p.item.itemType === 'PRODUCT' && p.item.catalogItemId) {
          await tx.catalogItem.update({
            where: { id: p.item.catalogItemId },
            data: { stockQty: { increment: p.qty } },
          })
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              catalogItemId: p.item.catalogItemId,
              transactionId: transaction.id,
              movementType: 'REFUND_RETURN',
              quantity: p.qty,
              note: `Refund ${transaction.invoiceNumber}: ${body.reason.slice(0, 150)}`,
            },
          })
        }
      }

      const refundedAmount = isFullRefund ? transaction.totalAmount : transaction.refundedAmount + refundAmount

      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          refundedAmount,
          refundReason: body.reason,
          refundedAt: new Date(),
          refundedById: user.id,
          ...(isFullRefund ? { status: 'REFUNDED' } : {}),
        },
      })

      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.TRANSACTION_REFUNDED,
        resourceType: 'Transaction',
        resourceId: transaction.id,
        metadata: {
          invoiceNumber: transaction.invoiceNumber,
          refundAmount,
          refundedAmountTotal: refundedAmount,
          full: isFullRefund,
          items: plan.map((p) => ({ name: p.item.itemNameSnapshot, qty: p.qty })),
          reason: body.reason,
        },
        ipAddress: ip,
        userAgent: ua,
      })

      return tx.transaction.findUnique({
        where: { id: transaction.id },
        include: {
          items: true,
          cashier: { select: { fullName: true } },
          customer: { select: { name: true, phone: true } },
        },
      })
    })

    return NextResponse.json({ transaction: toTransactionDTO(result!) })
  } catch (err) {
    return handleApiError(err)
  }
}
