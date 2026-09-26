// POST /api/sync/internal — pemicu siklus sinkronisasi dari scheduler desktop.
//
// Endpoint ini HANYA untuk proses server lokal (127.0.0.1) yang dijalankan oleh
// main process Electron, dan dilindungi dengan secret yang di-inject lewat
// environment saat server anak dijalankan. Tidak ada akses dari jaringan.
//
// Kenapa tidak memakai /api/sync biasa: /api/sync butuh cookie sesi kasir, dan
// scheduler berjalan di luar sesi browser (juga harus jalan ketika tidak ada
// jendela yang terbuka).
import { NextResponse } from 'next/server'
import { recordSyncOutcome, runSync } from '@/lib/sync/engine'
import { getSyncStatus } from '@/lib/sync/engine'

export const dynamic = 'force-dynamic'

function isLoopback(req: Request): boolean {
  const url = new URL(req.url)
  const host = req.headers.get('host') ?? ''
  const hostname = host.replace(/:\d+$/, '')
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost' ||
    url.hostname === '::1'
  )
}

export async function POST(req: Request) {
  // Secret epistemic: harus cocok dengan SERBABISA_INTERNAL_SECRET.
  const expected = process.env.SERBABISA_INTERNAL_SECRET
  const provided = req.headers.get('x-serbabisa-internal')
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Tidak diizinkan.' }, { status: 403 })
  }
  if (!isLoopback(req)) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Hanya dari loopback.' }, { status: 403 })
  }

  try {
    let tenantId: string | null = null
    let full = false
    try {
      const body = (await req.json()) as { tenantId?: string; full?: boolean; reason?: string }
      tenantId = body?.tenantId ?? null
      full = body?.full === true
    } catch {
      /* body opsional */
    }

    // Tanpa tenant eksplisit, pakai tenant yang dicatat saat aktivasi.
    // Sengaja TIDAK `tenant.findFirst()`: itu bisa memilih tenant yang salah
    // bila database lokal punya lebih dari satu baris.
    if (!tenantId) {
      const { getDeviceTenantId } = await import('@/lib/device')
      tenantId = await getDeviceTenantId()
    }

    if (!tenantId) {
      return NextResponse.json({
        report: { error: 'Belum ada tenant di perangkat ini — lakukan aktivasi/login pertama.' },
        status: await getSyncStatus(),
      })
    }

    const report = await runSync({ tenantId, full })
    await recordSyncOutcome(report)
    return NextResponse.json({ report, status: await getSyncStatus() })
  } catch (err) {
    console.error('[sync-internal]', err)
    return NextResponse.json(
      { report: { error: err instanceof Error ? err.message : String(err) } },
      { status: 200 },
    )
  }
}
