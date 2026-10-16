// GET  /api/admin/users — daftar user (search, filter status, pagination)
// POST /api/admin/users — buat user + tenant + profile + template nota (audit lengkap).
// Password sementara digenerate server-side, ditampilkan SATU KALI, tidak disimpan plaintext.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createUserSchema } from '@/lib/validation'
import { generateTemporaryPassword, hashPassword } from '@/lib/auth'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, parsePagination, requireSuperAdmin } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, ROLES } from '@/lib/constants'
import { createTenantWithTemplates } from '@/lib/services/tenant'
import { toAdminUserDTO } from '@/lib/services/serializers'
import { rateLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url)
    const search = url.searchParams.get('search')?.trim() ?? ''
    const status = url.searchParams.get('status')?.trim() ?? ''

    const where = {
      role: ROLES.USER,
      ...(status === 'ACTIVE' || status === 'INACTIVE' || status === 'SUSPENDED' ? { status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search } },
              { email: { contains: search } },
              { tenant: { businessName: { contains: search } } },
            ],
          }
        : {}),
    }

    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        // Select eksplisit — jangan tarik logoUrl (data URL ≤300KB) hanya untuk dibuang serializer.
        include: {
          tenant: {
            select: {
              id: true, businessName: true, slug: true, phone: true,
              whatsappNumber: true, address: true, isActive: true, createdAt: true,
            },
          },
          _count: { select: { transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ])

    return NextResponse.json({
      data: rows.map(toAdminUserDTO),
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
    const admin = await requireSuperAdmin()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    if (!rateLimit(`admin-create:${ip ?? 'unknown'}`, 10, 60_000)) {
      throw new ApiError('RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi beberapa saat.', 429)
    }

    const body = createUserSchema.parse(await req.json())

    const existing = await db.user.findUnique({ where: { email: body.email } })
    if (existing) throw new ApiError('ALREADY_EXISTS', 'Email sudah digunakan.', 409)

    const temporaryPassword = body.password ?? generateTemporaryPassword() + '7A'

    const result = await db.$transaction(async (tx) => {
      // Alur aman: tenant → user → template nota → audit (atomic; gagal = rollback penuh).
      const tenant = await createTenantWithTemplates(tx, {
        businessName: body.businessName,
        phone: body.phone,
        whatsappNumber: body.whatsappNumber,
        address: body.address ?? null,
      })
      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash: hashPassword(temporaryPassword),
          fullName: body.fullName,
          phone: body.phone,
          role: ROLES.USER,
          status: body.status,
          tenantId: tenant.id,
          mustChangePassword: true, // wajib ganti password saat login pertama
        },
        include: { tenant: true, _count: { select: { transactions: true } } },
      })
      await logAudit(tx, {
        actorUserId: admin.id,
        tenantId: tenant.id,
        action: AUDIT_ACTIONS.TENANT_CREATED,
        resourceType: 'Tenant',
        resourceId: tenant.id,
        metadata: { businessName: body.businessName, slug: tenant.slug },
        ipAddress: ip,
        userAgent: ua,
      })
      await logAudit(tx, {
        actorUserId: admin.id,
        tenantId: tenant.id,
        action: AUDIT_ACTIONS.USER_CREATED,
        resourceType: 'User',
        resourceId: user.id,
        metadata: { email: user.email, role: ROLES.USER, status: user.status, businessName: body.businessName },
        ipAddress: ip,
        userAgent: ua,
      })
      return user
    })

    return NextResponse.json(
      {
        user: toAdminUserDTO(result),
        // Ditampilkan SEKALI saja di UI admin; tidak disimpan plaintext di DB.
        temporaryPassword,
      },
      { status: 201 }
    )
  } catch (err) {
    return handleApiError(err)
  }
}
