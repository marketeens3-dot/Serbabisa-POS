// PATCH /api/catalog/[id] — update item / aktif-nonaktif (soft delete, bukan hard delete).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { catalogItemSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCatalogItemDTO } from '@/lib/services/serializers'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    // Item WAJIB milik tenant session — IDOR diblokir di sini.
    const item = await db.catalogItem.findFirst({ where: { id, tenantId } })
    if (!item) throw new ApiError('NOT_FOUND', 'Item tidak ditemukan.', 404)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'deactivate' || action === 'activate') {
      const isActive = action === 'activate'
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.catalogItem.update({ where: { id }, data: { isActive }, include: { category: { select: { name: true } } } })
        await logAudit(tx, {
          actorUserId: user.id,
          tenantId,
          action: item.type === 'PRODUCT'
            ? (isActive ? AUDIT_ACTIONS.PRODUCT_ACTIVATED : AUDIT_ACTIONS.PRODUCT_DEACTIVATED)
            : (isActive ? AUDIT_ACTIONS.SERVICE_ACTIVATED : AUDIT_ACTIONS.SERVICE_DEACTIVATED),
          resourceType: 'CatalogItem',
          resourceId: id,
          metadata: { name: item.name, type: item.type },
          ipAddress: ip,
          userAgent: ua,
        })
        return u
      })
      return NextResponse.json(toCatalogItemDTO(updated))
    }

    // Update penuh — harga, stok, dsb.
    const body = catalogItemSchema.parse({ ...raw, type: raw.type ?? item.type })
    if (body.categoryId) {
      const cat = await db.category.findFirst({ where: { id: body.categoryId, tenantId, isActive: true } })
      if (!cat) throw new ApiError('CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.', 404)
    }
    // Jika item sudah dipakai transaksi & bernama sama tetap boleh update; harga boleh berubah
    // karena transaction_items menyimpan snapshot.

    const updated = await db.$transaction(async (tx) => {
      const u = await tx.catalogItem.update({
        where: { id },
        data: {
          name: body.name,
          sku: body.sku,
          barcode: body.barcode,
          description: body.description ?? null,
          categoryId: body.categoryId ?? null,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          discountAmount: body.discountAmount,
          ...(item.type === 'PRODUCT'
            ? { stockQty: body.stockQty, minStockQty: body.minStockQty, unit: body.unit }
            : { unit: body.unit }),
        },
        include: { category: { select: { name: true } } },
      })
      if (item.type === 'PRODUCT' && body.stockQty !== item.stockQty) {
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            catalogItemId: id,
            movementType: 'ADJUSTMENT',
            quantity: Math.round((body.stockQty - item.stockQty) * 1000) / 1000,
            note: 'Penyesuaian stok manual',
          },
        })
      }
      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: item.type === 'PRODUCT' ? AUDIT_ACTIONS.PRODUCT_UPDATED : AUDIT_ACTIONS.SERVICE_UPDATED,
        resourceType: 'CatalogItem',
        resourceId: id,
        metadata: { name: body.name, sellingPrice: body.sellingPrice },
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
