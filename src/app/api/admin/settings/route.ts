// GET/PATCH /api/admin/settings — pengaturan global (tanpa secret apa pun).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { adminSettingsSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireSuperAdmin } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'

const SETTING_KEY = 'app'

function defaults() {
  return { appName: 'Serbabisa', systemNotice: null as string | null }
}

async function readSetting() {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!row) return defaults()
  try {
    return { ...defaults(), ...JSON.parse(row.value) }
  } catch {
    return defaults()
  }
}

export async function GET() {
  try {
    await requireSuperAdmin()
    return NextResponse.json(await readSetting())
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertSameOrigin(req)
    const admin = await requireSuperAdmin()
    const body = adminSettingsSchema.parse(await req.json())
    if (Object.keys(body).length === 0) throw new ApiError('INVALID_INPUT', 'Tidak ada perubahan.', 422)

    const current = await readSetting()
    const next = { ...current, ...body }
    await db.systemSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: SETTING_KEY, value: JSON.stringify(next) },
    })
    await logAudit(undefined, {
      actorUserId: admin.id,
      action: AUDIT_ACTIONS.ADMIN_SETTINGS_UPDATED,
      resourceType: 'SystemSetting',
      resourceId: SETTING_KEY,
      metadata: { updatedFields: Object.keys(body) },
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    })
    return NextResponse.json(next)
  } catch (err) {
    return handleApiError(err)
  }
}
