// GET    /api/projects/[id] — detail proyek: item anggaran + realisasi + ringkasan
// PATCH  /api/projects/[id] — update data / ubah status
// DELETE /api/projects/[id] — hapus proyek (item & realisasi ikut; transaksi dilepas)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { projectUpdateSchema } from '@/lib/validation'
import { ApiError, assertSameOrigin, getClientIp, getUserAgent, handleApiError, requireUser } from '@/lib/api'
import { logAudit } from '@/lib/audit'
import { AUDIT_ACTIONS, PROJECT_STATUS_LABELS } from '@/lib/constants'

async function getProjectOr404(tenantId: string, id: string) {
  const project = await db.project.findFirst({ where: { id, tenantId } })
  if (!project) throw new ApiError('NOT_FOUND', 'Proyek tidak ditemukan.', 404)
  return project
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await requireUser()
    const { id } = await params
    const project = await getProjectOr404(tenantId, id)

    const [items, realizations, txAgg] = await Promise.all([
      db.rabItem.findMany({ where: { projectId: id }, orderBy: { createdAt: 'asc' } }),
      db.rabRealization.findMany({
        where: { projectId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true, rabItemId: true, transactionId: true, description: true,
          quantity: true, amount: true, source: true, createdAt: true,
        },
      }),
      db.transaction.aggregate({
        where: { projectId: id, status: 'COMPLETED' },
        _count: true,
        _sum: { totalAmount: true },
      }),
    ])

    const realizationTotal = realizations.reduce((s, r) => s + r.amount, 0)
    return NextResponse.json({
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        description: project.description,
        status: project.status,
        budgetTotal: project.budgetTotal,
        realizationTotal,
        remaining: project.budgetTotal - realizationTotal,
        progressPercent: project.budgetTotal > 0 ? Math.min(999, Math.round((realizationTotal / project.budgetTotal) * 100)) : null,
        customerId: project.customerId,
        startDate: project.startDate?.toISOString() ?? null,
        endDate: project.endDate?.toISOString() ?? null,
        createdAt: project.createdAt.toISOString(),
      },
      items: items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        budgetAmount: it.budgetAmount,
        note: it.note,
        // Realisasi yang tertaut ke item anggaran ini (manual atau dari kasir).
        realizationTotal: realizations
          .filter((r) => r.rabItemId === it.id)
          .reduce((s, r) => s + r.amount, 0),
      })),
      realizations: realizations.map((r) => ({
        id: r.id,
        rabItemId: r.rabItemId,
        transactionId: r.transactionId,
        description: r.description,
        quantity: r.quantity,
        amount: r.amount,
        source: r.source,
        createdAt: r.createdAt.toISOString(),
      })),
      linkedTransactions: { count: txAgg._count, total: txAgg._sum.totalAmount ?? 0 },
    })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const ip = getClientIp(req)
    const ua = getUserAgent(req)
    const project = await getProjectOr404(tenantId, id)

    const raw = (await req.json()) as Record<string, unknown>
    const action = typeof raw.action === 'string' ? raw.action : 'update'

    // Aksi ubah status (dipisah agar audit jelas).
    if (action === 'set-status') {
      const body = projectUpdateSchema.pick({ status: true }).parse(raw)
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.project.update({ where: { id }, data: { status: body.status! } })
        await logAudit(tx, {
          actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PROJECT_STATUS_CHANGED,
          resourceType: 'Project', resourceId: id,
          metadata: { from: project.status, to: body.status }, ipAddress: ip, userAgent: ua,
        })
        return u
      })
      return NextResponse.json({ id: updated.id, status: updated.status })
    }

    const body = projectUpdateSchema.omit({ status: true }).parse(raw)
    if (body.customerId) {
      const customer = await db.customer.findFirst({ where: { id: body.customerId, tenantId } })
      if (!customer) throw new ApiError('CUSTOMER_NOT_FOUND', 'Pelanggan tidak ditemukan.', 404)
    }

    const updated = await db.$transaction(async (tx) => {
      const u = await tx.project.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
          ...(body.description !== undefined ? { description: body.description ?? null } : {}),
          ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(body.startDate) : null } : {}),
          ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        },
      })
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PROJECT_UPDATED,
        resourceType: 'Project', resourceId: id,
        metadata: { updatedFields: Object.keys(body), statusLabel: PROJECT_STATUS_LABELS[project.status as keyof typeof PROJECT_STATUS_LABELS] ?? project.status },
        ipAddress: ip, userAgent: ua,
      })
      return u
    })
    return NextResponse.json({ id: updated.id, name: updated.name })
  } catch (err) {
    return handleApiError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req)
    const { user, tenantId } = await requireUser()
    const { id } = await params
    const project = await getProjectOr404(tenantId, id)

    await db.$transaction(async (tx) => {
      await tx.project.delete({ where: { id } }) // item & realisasi cascade; transaksi dilepas (SetNull)
      await logAudit(tx, {
        actorUserId: user.id, tenantId, action: AUDIT_ACTIONS.PROJECT_DELETED,
        resourceType: 'Project', resourceId: id,
        metadata: { code: project.code, name: project.name }, ipAddress: getClientIp(req), userAgent: getUserAgent(req),
      })
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return handleApiError(err)
  }
}
