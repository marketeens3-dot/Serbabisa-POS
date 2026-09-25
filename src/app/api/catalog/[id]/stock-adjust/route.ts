// POST /api/catalog/[id]/stock-adjust — penyesuaian stok / opname (atomic):
//   - Hanya PRODUCT milik tenant (IDOR guard).
//   - newQty = hasil hitung fisik; delta dihitung server.
//   - InventoryMovement ADJUSTMENT tercatat (quantity bertanda: + masuk / - keluar)
//     + audit STOCK_ADJUSTED.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stockAdjustSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, STOCK_ADJUST_REASON_LABELS } from '@/lib/constants'
import { toCatalogItemDTO } from '@/lib/services/serializers'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = stockAdjustSchema.parse(await req.json())

    const updated = await db.$transaction(async (tx) => {
      const item = await tx.catalogItem.findFirst({ where: { id, tenantId } })
      if (!item) throw new ApiError('NOT_FOUND', 'Item tidak ditemukan.', 404)
      if (item.type !== 'PRODUCT') throw new ApiError('NOT_PRODUCT', 'Penyesuaian stok hanya untuk produk.', 422)

      const oldQty = item.stockQty
      if (Math.abs(body.newQty - oldQty) < 0.0005) {
        throw new ApiError('NO_CHANGE', 'Stok baru sama dengan stok saat ini.', 422)
      }
      const delta = Math.round((body.newQty - oldQty) * 1000) / 1000

      const u = await tx.catalogItem.update({
        where: { id },
        data: { stockQty: body.newQty },
        include: { category: { select: { name: true } } },
      })

      const noteParts = [STOCK_ADJUST_REASON_LABELS[body.reason], `stok: ${oldQty} → ${body.newQty}`]
      if (body.note) noteParts.push(body.note)

      await tx.inventoryMovement.create({
        data: {
          tenantId,
          catalogItemId: id,
          movementType: 'ADJUSTMENT',
          quantity: delta,
          note: noteParts.join(' · ').slice(0, 200),
        },
      })

      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.STOCK_ADJUSTED,
        resourceType: 'CatalogItem',
        resourceId: id,
        metadata: {
          name: item.name,
          reason: body.reason,
          oldQty,
          newQty: body.newQty,
          delta,
          note: body.note ?? null,
        },
        ipAddress: ip,
        userAgent: ua,
      })

      return u
    })

    return NextResponse.json(toCatalogItemDTO(updated))
  } catch (err) {
    return handleApiError(err)
  }
}
