// GET  /api/stock-opname — riwayat opname
// POST /api/stock-opname — simpan opname: stok diset ke jumlah fisik + mutasi ADJUSTMENT
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stockOpnameSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, INVENTORY_MOVEMENT_TYPES, STOCK_ADJUST_REASON_LABELS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 10)

    const [total, rows] = await Promise.all([
      db.stockOpname.count({ where: { tenantId } }),
      db.stockOpname.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { items: true } } },
      }),
    ])

    return NextResponse.json({
      data: rows.map((o) => ({
        id: o.id,
        note: o.note,
        itemCount: o._count.items,
        createdAt: o.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = stockOpnameSchema.parse(await req.json())

    // Dedup item (kalau kasir memasukkan produk yang sama dua kali).
    const seen = new Map<string, number>()
    for (const it of body.items) {
      seen.set(it.catalogItemId, it.physicalQty)
    }

    const result = await db.$transaction(
      async (tx) => {
        const ids = [...seen.keys()]
        const catalogRows = await tx.catalogItem.findMany({ where: { id: { in: ids }, tenantId, type: 'PRODUCT' } })
        if (catalogRows.length !== ids.length) {
          throw new ApiError('ITEM_NOT_FOUND', 'Ada produk yang tidak ditemukan / bukan produk fisik.', 404)
        }

        const opname = await tx.stockOpname.create({
          data: { tenantId, note: body.note ?? null, createdById: user.id },
        })

        const itemsData = catalogRows.map((c) => {
          const physicalQty = seen.get(c.id)!
          return {
            opnameId: opname.id,
            tenantId,
            catalogItemId: c.id,
            itemNameSnapshot: c.name,
            systemQty: c.stockQty,
            physicalQty,
            diffQty: Math.round((physicalQty - c.stockQty) * 1000) / 1000,
          }
        })
        await tx.stockOpnameItem.createMany({ data: itemsData })

        // Terapkan stok fisik + mutasi ADJUSTMENT untuk item yang selisih.
        const changed = itemsData.filter((i) => i.diffQty !== 0)
        for (const ch of changed) {
          await tx.catalogItem.update({ where: { id: ch.catalogItemId }, data: { stockQty: ch.physicalQty } })
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              catalogItemId: ch.catalogItemId,
              movementType: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT,
              quantity: Math.abs(ch.diffQty),
              note: `Opname ${opname.id.slice(0, 8)}: sistem ${ch.systemQty} → fisik ${ch.physicalQty}`,
            },
          })
        }

        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.STOCK_OPNAME_CREATED,
          resourceType: 'StockOpname', resourceId: opname.id,
          metadata: {
            itemCount: itemsData.length,
            diffCount: changed.length,
            reason: STOCK_ADJUST_REASON_LABELS.OPNAME,
          },
          ipAddress: ip, userAgent: ua,
        })

        return { opname, items: itemsData, changedCount: changed.length }
      },
      { timeout: 15_000, maxWait: 10_000 },
    )

    return NextResponse.json(
      {
        ok: true,
        id: result.opname.id,
        itemCount: result.items.length,
        changedCount: result.changedCount,
        createdAt: result.opname.createdAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
