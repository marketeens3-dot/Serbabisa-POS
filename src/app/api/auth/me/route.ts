// GET /api/auth/me — sesi saat ini + sliding refresh expiry.
import { NextResponse } from 'next/server'
import { getSessionUser, refreshSessionExpiry } from '@/lib/auth'
import { handleApiError } from '@/lib/api'
import { toSessionUserDTO } from '@/lib/services/serializers'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sesi berakhir. Silakan masuk kembali.' }, { status: 401 })
    }
    await refreshSessionExpiry()
    return NextResponse.json({ user: toSessionUserDTO(user) })
  } catch (err) {
    return handleApiError(err)
  }
}
