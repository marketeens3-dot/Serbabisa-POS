// GET /api/cash-sessions/current — sesi OPEN milik kasir yang login + total berjalan (live).
// Dipakai banner shift di POS: kas awal, penjualan tunai/non-tunai sejauh ini, expected kas.
// Respons juga membawa flag `requireActiveShift` dari pengaturan toko supaya POS tahu
// apakah transaksi terkunci tanpa perlu fetch /api/settings tambahan.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handleApiError, requireUser } from '@/lib/api'
import { computeSessionTotals } from '@/lib/services/cash-session'
import { parseInvoiceSettings } from '@/lib/services/tenant'
import { toCashSessionDTO } from '@/lib/services/serializers'

export async function GET() {
  try {
    const { user, tenantId } = await requireUser()

    const [session, tenantRow] = await Promise.all([
      db.cashSession.findFirst({
        where: { tenantId, userId: user.id, status: 'OPEN' },
        include: { user: { select: { fullName: true } } },
        orderBy: { openedAt: 'desc' },
      }),
      db.tenant.findUnique({ where: { id: tenantId }, select: { invoiceSettings: true } }),
    ])
    const requireActiveShift = parseInvoiceSettings(tenantRow?.invoiceSettings).requireActiveShift

    if (!session) {
      return NextResponse.json({ session: null, live: null, requireActiveShift })
    }

    const live = await computeSessionTotals(db, session.id, session.openingCash)

    return NextResponse.json({ session: toCashSessionDTO(session), live, requireActiveShift })
  } catch (err) {
    return handleApiError(err)
  }
}
