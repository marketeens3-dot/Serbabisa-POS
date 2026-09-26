// GET /api/sync/mobile/ping — cek apakah server hidup (dipakai layar Pengaturan HP).
//
// Endpoint publik yang SENGAJA tidak butuh sesi, tapi tidak membocorkan apa pun
// selain "ada". Rate limit di sini longgar karena hanya dipakai untuk deteksi
// koneksi, bukan untuk akses data.
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!rateLimit(`mobile-ping:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: 'RATE_LIMITED' }, { status: 429 })
  }
  return NextResponse.json({
    ok: true,
    service: 'serbabisa-pos',
    //seconds sejak epoch, dipakai klien untuk mengukur latensi.
    time: Math.floor(Date.now() / 1000),
  })
}
