// GET /api/transactions/[id] — detail transaksi (tenant-scoped → IDOR = 404).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, requireUser } from '@/lib/api'
import { toTransactionDTO } from '@/lib/services/serializers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    const tx = await db.transaction.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        cashier: { select: { fullName: true } },
        customer: { select: { name: true, phone: true } },
        tenant: { select: { businessName: true, address: true, phone: true, whatsappNumber: true, logoUrl: true } },
      },
    })
    if (!tx) throw new ApiError('NOT_FOUND', 'Transaksi tidak ditemukan.', 404)
    return NextResponse.json(toTransactionDTO(tx))
  } catch (err) {
    return handleApiError(err)
  }
}
