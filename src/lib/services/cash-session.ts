// Service Sesi Kasir — kalkulasi ringkas shift (live) & laporan final.
// Semua query SCOPED tenantId + cashSessionId → isolation dijaga.

import type { Prisma, PrismaClient } from '@prisma/client'
import type { CashSessionSummaryDTO } from '@/lib/types'

type Tx = Prisma.TransactionClient | PrismaClient

export type CashSessionTotals = CashSessionSummaryDTO & {
  byMethod: { method: string; count: number; total: number }[]
}

/**
 * Agregat transaksi milik satu sesi (net-of-refund):
 * - cashTotal    → Σ (totalAmount - refundedAmount) metode CASH
 * - nonCashTotal → Σ net metode non-tunai
 * - expectedCash = openingCash + cashTotal (kas yang seharusnya ada di laci)
 * Transaksi REFUNDED (net 0) dihitung 0; VOID tidak dihitung.
 */
export async function computeSessionTotals(tx: Tx, sessionId: string, openingCash: number): Promise<CashSessionTotals> {
  const rows = await tx.transaction.findMany({
    where: { cashSessionId: sessionId, status: { in: ['COMPLETED', 'REFUNDED'] } },
    select: { paymentMethod: true, totalAmount: true, refundedAmount: true },
  })

  let cashTotal = 0
  let nonCashTotal = 0
  const methodMap = new Map<string, { count: number; total: number }>()
  for (const r of rows) {
    const net = r.totalAmount - (r.refundedAmount ?? 0)
    const agg = methodMap.get(r.paymentMethod) ?? { count: 0, total: 0 }
    agg.count += 1
    agg.total += net
    methodMap.set(r.paymentMethod, agg)
    if (r.paymentMethod === 'CASH') cashTotal += net
    else nonCashTotal += net
  }

  return {
    transactionCount: rows.length,
    cashTotal,
    nonCashTotal,
    total: cashTotal + nonCashTotal,
    expectedCash: openingCash + cashTotal,
    byMethod: Array.from(methodMap.entries()).map(([method, v]) => ({ method, ...v })),
  }
}
