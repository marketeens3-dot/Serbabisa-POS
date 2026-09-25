// GET   /api/admin/users/[id] — detail user + aktivitas audit terbaru
// PATCH /api/admin/users/[id] — update | activate | deactivate | reset_access
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { updateUserSchema } from '@/lib/validation'
import { generateTemporaryPassword, hashPassword, revokeAllSessions } from '@/lib/auth'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireSuperAdmin } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, ROLES } from '@/lib/constants'
import { toAdminUserDTO, toAuditLogDTO } from '@/lib/services/serializers'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin()
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      include: { tenant: true, _count: { select: { transactions: true } } },
    })
    if (!user) throw new ApiError('NOT_FOUND', 'User tidak ditemukan.', 404)

    const [auditEvents, txAgg] = await Promise.all([
      db.auditLog.findMany({
        where: { OR: [{ actorUserId: id }, { resourceId: id }] },
        include: { actor: { select: { fullName: true, email: true } }, tenant: { select: { businessName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      db.transaction.aggregate({
        where: { cashierId: id, status: 'COMPLETED' },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ])

    return NextResponse.json({
      user: toAdminUserDTO(user),
      stats: { transactionCount: txAgg._count, totalSales: txAgg._sum.totalAmount ?? 0 },
      auditEvents: auditEvents.map(toAuditLogDTO),
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const admin = await requireSuperAdmin()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    const target = await db.user.findUnique({ where: { id }, include: { tenant: true } })
    if (!target) throw new ApiError('NOT_FOUND', 'User tidak ditemukan.', 404)
    if (target.role === ROLES.SUPER_ADMIN) {
      throw new ApiError('FORBIDDEN', 'Akun Super Admin tidak dapat diubah dari halaman ini.', 403)
    }

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    // ---------- AKSI STATUS / RESET ----------
    if (action === 'activate') {
      const user = await db.user.update({ where: { id }, data: { status: 'ACTIVE' }, include: { tenant: true, _count: { select: { transactions: true } } } })
      await logAudit(undefined, {
        actorUserId: admin.id, tenantId: user.tenantId, action: AUDIT_ACTIONS.USER_ACTIVATED,
        resourceType: 'User', resourceId: id, metadata: { email: user.email }, ipAddress: ip, userAgent: ua,
      })
      return NextResponse.json({ user: toAdminUserDTO(user) })
    }
    if (action === 'deactivate') {
      const user = await db.user.update({ where: { id }, data: { status: 'INACTIVE' }, include: { tenant: true, _count: { select: { transactions: true } } } })
      await revokeAllSessions(id) // akses langsung dicabut
      await logAudit(undefined, {
        actorUserId: admin.id, tenantId: user.tenantId, action: AUDIT_ACTIONS.USER_DEACTIVATED,
        resourceType: 'User', resourceId: id, metadata: { email: user.email }, ipAddress: ip, userAgent: ua,
      })
      return NextResponse.json({ user: toAdminUserDTO(user) })
    }
    if (action === 'reset_access') {
      const temporaryPassword = generateTemporaryPassword() + '5B'
      const user = await db.user.update({
        where: { id },
        data: { passwordHash: hashPassword(temporaryPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
        include: { tenant: true, _count: { select: { transactions: true } } },
      })
      await revokeAllSessions(id)
      await logAudit(undefined, {
        actorUserId: admin.id, tenantId: user.tenantId, action: AUDIT_ACTIONS.ACCESS_RESET,
        resourceType: 'User', resourceId: id, metadata: { email: user.email }, ipAddress: ip, userAgent: ua,
      })
      return NextResponse.json({ user: toAdminUserDTO(user), temporaryPassword })
    }

    // ---------- UPDATE DATA ----------
    const body = updateUserSchema.parse(raw)
    if (body.email && body.email !== target.email) {
      const clash = await db.user.findUnique({ where: { email: body.email } })
      if (clash) throw new ApiError('ALREADY_EXISTS', 'Email sudah digunakan.', 409)
    }

    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
        include: { tenant: true, _count: { select: { transactions: true } } },
      })
      if (target.tenant && (body.businessName !== undefined || body.whatsappNumber !== undefined || body.address !== undefined || body.phone !== undefined)) {
        await tx.tenant.update({
          where: { id: target.tenantId! },
          data: {
            ...(body.businessName !== undefined ? { businessName: body.businessName } : {}),
            ...(body.whatsappNumber !== undefined ? { whatsappNumber: body.whatsappNumber } : {}),
            ...(body.phone !== undefined ? { phone: body.phone } : {}),
            ...(body.address !== undefined ? { address: body.address } : {}),
          },
        })
      }
      await logAudit(tx, {
        actorUserId: admin.id, tenantId: updated.tenantId, action: AUDIT_ACTIONS.USER_UPDATED,
        resourceType: 'User', resourceId: id,
        metadata: { email: updated.email, updatedFields: Object.keys(body) },
        ipAddress: ip, userAgent: ua,
      })
      return updated
    })

    const fresh = await db.user.findUnique({ where: { id }, include: { tenant: true, _count: { select: { transactions: true } } } })
    return NextResponse.json({ user: toAdminUserDTO(fresh ?? user) })
  } catch (err) {
    return handleApiError(err)
  }
}
