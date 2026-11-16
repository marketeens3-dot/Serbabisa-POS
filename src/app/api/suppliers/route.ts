// GET  /api/suppliers — daftar supplier (search)
// POST /api/suppliers — tambah supplier
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { supplierSchema } from '@/lib/validation'
import { assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const includeInactive = url.searchParams.get('includeInactive') === '1'

    const rows = await db.supplier.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {}),
      },
      include: { _count: { select: { purchaseOrders: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({
      data: rows.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        address: s.address,
        notes: s.notes,
        isActive: s.isActive,
        purchaseCount: s._count.purchaseOrders,
        createdAt: s.createdAt.toISOString(),
      })),
      total: rows.length,
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const body = supplierSchema.parse(await req.json())

    const supplier = await db.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          tenantId,
          name: body.name,
          phone: body.phone,
          address: body.address ?? null,
          notes: body.notes ?? null,
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.SUPPLIER_CREATED,
        resourceType: 'Supplier', resourceId: created.id,
        metadata: { name: created.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
      return created
    })

    return NextResponse.json(
      { id: supplier.id, name: supplier.name, phone: supplier.phone, address: supplier.address, notes: supplier.notes, isActive: supplier.isActive, purchaseCount: 0, createdAt: supplier.createdAt.toISOString() },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
