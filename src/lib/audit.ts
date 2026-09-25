// Audit log — append-only. TIDAK BOLEH berisi password/token/secret.
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type AuditEntry = {
  actorUserId?: string | null
  tenantId?: string | null
  action: string
  resourceType?: string | null
  resourceId?: string | null
  metadata?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
}

/** logAudit dapat dipanggil dengan transaction client (tx) atau db biasa. */
export async function logAudit(tx: Prisma.TransactionClient | typeof db | undefined, entry: AuditEntry): Promise<void> {
  const client = tx ?? db
  await client.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      tenantId: entry.tenantId ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ipAddress: entry.ipAddress?.slice(0, 45) ?? null,
      userAgent: entry.userAgent?.slice(0, 250) ?? null,
    },
  })
}
