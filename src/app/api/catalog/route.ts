// GET  /api/catalog — produk & jasa (search, filter type/kategori/status, sort, pagination, low stock)
// POST /api/catalog — tambah produk/jasa (SKU & barcode unik per tenant)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { catalogItemSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCatalogItemDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 24)
    const type = url.searchParams.get('type')?.trim() ?? ''
    const search = url.searchParams.get('search')?.trim() ?? ''
    const categoryId = url.searchParams.get('categoryId')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? '' // '' | 'ACTIVE' | 'INACTIVE' | 'LOW_STOCK'
    const sort = url.searchParams.get('sort')?.trim() ?? 'name'
    const barcode = url.searchParams.get('barcode')?.trim() ?? ''

    // Lookup barcode exact (untuk scanner keyboard-wedge).
    if (barcode) {
      const item = await db.catalogItem.findFirst({
        where: { tenantId, barcode, isActive: true },
        include: { category: { select: { name: true } } },
      })
      return NextResponse.json({ data: item ? [toCatalogItemDTO(item)] : [], page: 1, pageSize: 1, total: item ? 1 : 0, totalPages: 1 })
    }

    const where = {
      tenantId,
      ...(type === 'PRODUCT' || type === 'SERVICE' ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(status === 'ACTIVE'
        ? { isActive: true }
        : status === 'INACTIVE'
          ? { isActive: false }
          : status === 'LOW_STOCK'
            // Filter di WHERE (bukan pasca-pagination): tanpa ini, item stok
            // menipis di luar halaman pertama tidak pernah muncul.
            ? { type: 'PRODUCT', isActive: true, stockQty: { lte: db.catalogItem.fields.minStockQty } }
            : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { sku: { contains: search } },
              { barcode: { contains: search } },
            ],
          }
        : {}),
    }

    const orderBy =
      sort === 'price_asc' ? { sellingPrice: 'asc' as const }
      : sort === 'price_desc' ? { sellingPrice: 'desc' as const }
      : sort === 'stock_asc' ? { stockQty: 'asc' as const }
      : sort === 'newest' ? { createdAt: 'desc' as const }
      : { name: 'asc' as const }

    const [total, rows] = await Promise.all([
      db.catalogItem.count({ where }),
      db.catalogItem.findMany({ where, include: { category: { select: { name: true } } }, orderBy, skip, take }),
    ])

    const data = rows.map(toCatalogItemDTO)
    return NextResponse.json({ data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = catalogItemSchema.parse(await req.json())
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    if (body.categoryId) {
      const cat = await db.category.findFirst({ where: { id: body.categoryId, tenantId, isActive: true } })
      if (!cat) throw new ApiError('CATEGORY_NOT_FOUND', 'Kategori tidak ditemukan.', 404)
    }

    const item = await db.$transaction(async (tx) => {
      const created = await tx.catalogItem.create({
        data: {
          tenantId,
          type: body.type,
          name: body.name,
          sku: body.sku,
          barcode: body.barcode,
          description: body.description ?? null,
          categoryId: body.categoryId ?? null,
          costPrice: body.costPrice,
          sellingPrice: body.sellingPrice,
          stockQty: body.type === 'PRODUCT' ? body.stockQty : 0,
          minStockQty: body.type === 'PRODUCT' ? body.minStockQty : 0,
          unit: body.unit,
        },
        include: { category: { select: { name: true } } },
      })
      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: body.type === 'PRODUCT' ? AUDIT_ACTIONS.PRODUCT_CREATED : AUDIT_ACTIONS.SERVICE_CREATED,
        resourceType: 'CatalogItem',
        resourceId: created.id,
        metadata: { name: created.name, type: created.type, sellingPrice: created.sellingPrice },
        ipAddress: ip,
        userAgent: ua,
      })
      return created
    })

    return NextResponse.json(toCatalogItemDTO(item), { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
