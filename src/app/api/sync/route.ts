// GET  /api/sync/status → ringkasan sinkronisasi untuk UI
// POST /api/sync/run   → paksa satu siklus sinkronisasi sekarang
//
// Modul ini HANYA bermakna pada mode lokal (desktop .exe). Pada mode cloud
// (Vercel) endpoint mengembalikan status "not applicable" alih-alih error,
// supaya UI yang sama bisa dipakai di kedua mode.
import { NextResponse } from 'next/server'
import { getSyncStatus, recordSyncOutcome, runSync } from '@/lib/sync/engine'
import { getSessionUser } from '@/lib/auth'
import { isLocalMode } from '@/lib/device'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sesi berakhir.' }, { status: 401 })
    }
    const status = await getSyncStatus()
    return NextResponse.json({ status })
  } catch (err) {
    console.error('[sync-status]', err)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Gagal membaca status sinkronisasi.' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Sesi berakhir.' }, { status: 401 })
    }

    if (!isLocalMode()) {
      return NextResponse.json({
        report: null,
        status: { enabled: false, isLocalMode: false, deviceName: 'SERVER' },
        message: 'Sinkronisasi hanya berjalan pada aplikasi desktop.',
      })
    }

    // Hanya tenant tempat perangkat ini terdaftar yang boleh disinkronkan —
    // mencegah perangkat menyalin data toko lain.
    const tenantId = user.tenant?.id ?? null
    if (!tenantId) {
      return NextResponse.json(
        { error: 'NO_TENANT', message: 'Akun tidak terhubung ke toko.' },
        { status: 403 },
      )
    }

    let full = false
    try {
      const body = (await req.json()) as { full?: boolean }
      full = body?.full === true
    } catch {
      /* body opsional */
    }

    const report = await runSync({ tenantId, full })
    await recordSyncOutcome(report)

    return NextResponse.json({ report, status: await getSyncStatus() })
  } catch (err) {
    console.error('[sync-run]', err)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Sinkronisasi gagal dijalankan.' },
      { status: 500 },
    )
  }
}
