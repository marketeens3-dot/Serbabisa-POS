// PATCH /api/admin/tenants/[id] — edit info toko / aktif-nonaktif.
// Nonaktifkan toko → user di dalamnya dinonaktifkan + sesi dicabut.
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { revokeAllSessions } from '@/lib/auth'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireSuperAdmin } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { normalizeIndonesianPhone } from '@/lib/phone'

const MAX_BUSINESS_NAME = 150

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const admin = await requireSuperAdmin()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)

    const tenant = await db.tenant.findUnique({ where: { id } })
    if (!tenant) throw new ApiError('NOT_FOUND', 'Toko tidak ditemukan.', 404)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    if (action === 'activate' || action === 'deactivate') {
      const isActive = action === 'activate'
      await db.$transaction(async (tx) => {
        await tx.tenant.update({ where: { id }, data: { isActive } })
        if (isActive) {
          await tx.user.updateMany({ where: { tenantId: id, status: 'INACTIVE' }, data: { status: 'ACTIVE' } })
        } else {
          const users = await tx.user.findMany({ where: { tenantId: id }, select: { id: true } })
          await tx.user.updateMany({ where: { tenantId: id }, data: { status: 'INACTIVE' } })
          for (const u of users) await tx.session.deleteMany({ where: { userId: u.id } })
        }
        await logAudit(tx, {
          actorUserId: admin.id,
          tenantId: id,
          action: isActive ? AUDIT_ACTIONS.TENANT_ACTIVATED : AUDIT_ACTIONS.TENANT_DEACTIVATED,
          resourceType: 'Tenant',
          resourceId: id,
          metadata: { businessName: tenant.businessName },
          ipAddress: ip,
          userAgent: ua,
        })
      })
      return NextResponse.json({ success: true })
    }

    // Update info dasar
    const data: Record<string, string | null> = {}
    if (typeof raw.businessName === 'string') {
      const v = raw.businessName.trim()
      if (v.length < 2 || v.length > MAX_BUSINESS_NAME) throw new ApiError('INVALID_INPUT', 'Nama toko 2–150 karakter.', 422)
      data.businessName = v
    }
    if (typeof raw.phone === 'string') {
      const v = raw.phone.trim()
      const norm = v ? normalizeIndonesianPhone(v) : null
      if (v && !norm) throw new ApiError('INVALID_INPUT', 'Nomor telepon tidak valid.', 422)
      data.phone = norm
    }
    if (typeof raw.whatsappNumber === 'string') {
      const v = raw.whatsappNumber.trim()
      const norm = v ? normalizeIndonesianPhone(v) : null
      if (v && !norm) throw new ApiError('INVALID_INPUT', 'Nomor WhatsApp tidak valid.', 422)
      data.whatsappNumber = norm
    }
    if (typeof raw.address === 'string') {
      const v = raw.address.trim()
      if (v.length > 500) throw new ApiError('INVALID_INPUT', 'Alamat terlalu panjang.', 422)
      data.address = v || null
    }
    if (Object.keys(data).length === 0) throw new ApiError('INVALID_INPUT', 'Tidak ada perubahan.', 422)

    await db.$transaction(async (tx) => {
      await tx.tenant.update({ where: { id }, data })
      await logAudit(tx, {
        actorUserId: admin.id,
        tenantId: id,
        action: AUDIT_ACTIONS.TENANT_UPDATED,
        resourceType: 'Tenant',
        resourceId: id,
        metadata: { updatedFields: Object.keys(data) },
        ipAddress: ip,
        userAgent: ua,
      })
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handleApiError(err)
  }
}
