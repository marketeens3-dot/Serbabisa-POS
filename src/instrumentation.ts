/**
 * Hook boot server Next.js.
 *
 * Dipanggil sekali saat proses server start (runtime Node.js). Di sinilah
 * database lokal SQLite dibuat bila belum ada — itu yang menjamin aplikasi
 * tetap bisa dibuka tanpa internet, termasuk untuk halaman yang tidak pernah
 * menyentuh auth (halaman login itu sendiri).
 *
 * Kegagalan TIDAK diperbolehkan mematikan server: lebih baik aplikasi mulai
 * dan gagal saat query pertama daripada tidak start sama sekali. Error asli
 * tetap tidak bocor ke client karena handleApiError memetakannya jadi 500
 * dengan pesan generik.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    const { dbMode } = await import('@/lib/db')
    if (dbMode !== 'local') return

    const { ensureLocalDb } = await import('@/lib/local-db-bootstrap')
    await ensureLocalDb()
    console.log('[boot] database lokal siap (mode local)')
  } catch (err) {
    console.error('[boot] gagal menyiapkan database lokal:', err)
  }
}
