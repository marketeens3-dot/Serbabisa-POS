// GET /api/admin/tenants — daftar toko + pemiliknya.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, parsePagination, requireSuperAdmin } from '@/lib/api'

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const statusFilter = url.searchParams.get('status')?.trim() ?? ''

    const where = {
      ...(statusFilter === 'ACTIVE' ? { isActive: true } : statusFilter === 'INACTIVE' ? { isActive: false } : {}),
      ...(search ? { OR: [{ businessName: { contains: search } }, { slug: { contains: search } }] } : {}),
    }

    const [total, tenants] = await Promise.all([
      db.tenant.count({ where }),
      db.tenant.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ])

    const ownerIds = tenants.map((t) => t.id)
    const owners = await db.user.findMany({
      where: { tenantId: { in: ownerIds }, role: 'USER' },
      select: { id: true, fullName: true, email: true, phone: true, status: true, tenantId: true, lastLoginAt: true },
    })
    const ownerByTenant = new Map(owners.map((o) => [o.tenantId, o]))

    const [txCounts, itemCounts] = await Promise.all([
      db.transaction.groupBy({ by: ['tenantId'], where: { tenantId: { in: ownerIds } }, _count: true }),
      db.catalogItem.groupBy({ by: ['tenantId'], where: { tenantId: { in: ownerIds } }, _count: true }),
    ])
    const txByTenant = new Map(txCounts.map((r) => [r.tenantId, r._count]))
    const itemByTenant = new Map(itemCounts.map((r) => [r.tenantId, r._count]))

    return NextResponse.json({
      data: tenants.map((t) => {
        const owner = ownerByTenant.get(t.id)
        return {
          id: t.id,
          businessName: t.businessName,
          slug: t.slug,
          phone: t.phone,
          whatsappNumber: t.whatsappNumber,
          address: t.address,
          isActive: t.isActive,
          createdAt: t.createdAt.toISOString(),
          owner: owner
            ? { id: owner.id, fullName: owner.fullName, email: owner.email, phone: owner.phone, status: owner.status, lastLoginAt: owner.lastLoginAt?.toISOString() ?? null }
            : null,
          transactionCount: txByTenant.get(t.id) ?? 0,
          itemCount: itemByTenant.get(t.id) ?? 0,
        }
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  } catch (err) {
    return handleApiError(err)
  }
}
