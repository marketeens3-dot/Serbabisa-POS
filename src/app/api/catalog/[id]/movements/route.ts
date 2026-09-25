// GET /api/catalog/[id]/movements — riwayat pergerakan stok satu item (paginated, tenant-scoped).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, handleApiError, parsePagination, requireUser } from '@/lib/api'
import type { InventoryMovementDTO } from '@/lib/types'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 10)

    const item = await db.catalogItem.findFirst({ where: { id, tenantId }, select: { id: true, name: true } })
    if (!item) throw new ApiError('NOT_FOUND', 'Item tidak ditemukan.', 404)

    const where = { tenantId, catalogItemId: id }

    const [total, rows] = await Promise.all([
      db.inventoryMovement.count({ where }),
      db.inventoryMovement.findMany({
        where,
        include: { transaction: { select: { invoiceNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    const data: InventoryMovementDTO[] = rows.map((r) => ({
      id: r.id,
      movementType: r.movementType,
      quantity: r.quantity,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      transactionId: r.transactionId,
      invoiceNumber: r.transaction?.invoiceNumber ?? null,
    }))

    return NextResponse.json({
      item: { id: item.id, name: item.name },
      data,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
