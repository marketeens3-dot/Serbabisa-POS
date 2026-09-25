// POST /api/transactions/[id]/void — batalkan transaksi (atomic):
//   hanya COMPLETED, alasan wajib, stok produk dikembalikan + mutasi tercatat,
//   status VOID (bukan delete), audit log.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { voidSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toTransactionDTO } from '@/lib/services/serializers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = voidSchema.parse(await req.json())

    const result = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id, tenantId },
        include: { items: true },
      })
      if (!transaction) throw new ApiError('NOT_FOUND', 'Transaksi tidak ditemukan.', 404)
      if (transaction.status === 'VOID') {
        throw new ApiError('TRANSACTION_ALREADY_VOID', 'Transaksi ini sudah dibatalkan sebelumnya.', 409)
      }
      if (transaction.status === 'REFUNDED' || transaction.refundedAmount > 0) {
        throw new ApiError('TRANSACTION_REFUNDED', 'Transaksi yang sudah direfund tidak dapat dibatalkan — gunakan refund.', 409)
      }

      await tx.transaction.update({
        where: { id },
        data: {
          status: 'VOID',
          voidReason: body.reason,
          voidedAt: new Date(),
          voidedById: user.id,
        },
      })

      // Kembalikan stok HANYA untuk item produk yang tercatat di transaksi ini.
      for (const item of transaction.items) {
        if (item.itemType === 'PRODUCT' && item.catalogItemId) {
          await tx.catalogItem.update({
            where: { id: item.catalogItemId },
            data: { stockQty: { increment: item.quantity } },
          })
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              catalogItemId: item.catalogItemId,
              transactionId: transaction.id,
              movementType: 'VOID_RETURN',
              quantity: item.quantity,
              note: body.reason.slice(0, 200),
            },
          })
        }
      }

      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.TRANSACTION_VOIDED,
        resourceType: 'Transaction',
        resourceId: transaction.id,
        metadata: { invoiceNumber: transaction.invoiceNumber, totalAmount: transaction.totalAmount, reason: body.reason },
        ipAddress: ip,
        userAgent: ua,
      })

      return tx.transaction.findUnique({
        where: { id },
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
