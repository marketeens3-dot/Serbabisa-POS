// POST /api/cash-sessions  — mulai shift (satu sesi OPEN per kasir per toko)
// GET  /api/cash-sessions  — riwayat sesi (paginated, filter status)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { openCashSessionSchema } from '@/lib/validation'
import {
  ApiError,
  assertSameOrigin,
  getClientIp,
  getUserAgent,
  handleApiError,
  parsePagination,
  requireUser,
} from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS } from '@/lib/constants'
import { toCashSessionDTO } from '@/lib/services/serializers'

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireUser()
    const url = new URL(req.url)
    const { page, pageSize, skip, take } = parsePagination(url, 10)
    const status = url.searchParams.get('status')?.trim() ?? ''

    const where = {
      tenantId,
      ...(status === 'OPEN' || status === 'CLOSED' ? { status } : {}),
    }

    const [total, rows] = await Promise.all([
      db.cashSession.count({ where }),
      db.cashSession.findMany({
        where,
        include: {
          user: { select: { fullName: true } },
          _count: { select: { transactions: { where: { status: 'COMPLETED' } } } },
        },
        orderBy: { openedAt: 'desc' },
        skip,
        take,
      }),
    ])

    return NextResponse.json({
      data: rows.map((r) => ({
        ...toCashSessionDTO(r),
        transactionCount: r._count.transactions,
      })),
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
    const { user, tenantId } = await requireUser()
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const body = openCashSessionSchema.parse(await req.json())

    const session = await db.$transaction(async (tx) => {
      // Satu sesi OPEN per kasir per toko — cegah sesi ganda (race-safe via cek di dalam tx).
      const existing = await tx.cashSession.findFirst({
        where: { tenantId, userId: user.id, status: 'OPEN' },
      })
      if (existing) {
        throw new ApiError('SESSION_ALREADY_OPEN', 'Anda masih punya shift yang aktif. Tutup dulu shift sebelumnya.', 409)
      }

      const created = await tx.cashSession.create({
        data: {
          tenantId,
          userId: user.id,
          openingCash: body.openingCash,
          status: 'OPEN',
        },
      })

      await logAudit(tx, {
        actorUserId: user.id,
        tenantId,
        action: AUDIT_ACTIONS.CASH_SESSION_OPENED,
        resourceType: 'CashSession',
        resourceId: created.id,
        metadata: { openingCash: body.openingCash },
        ipAddress: ip,
        userAgent: ua,
      })

      return created
    })

    return NextResponse.json({ session: toCashSessionDTO(session) }, { status: 201 })
  } catch (err) {
    return handleApiError(err)
  }
}
