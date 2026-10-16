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
  // groupBy di SQL (bukan fetch semua baris + reduce di JS): endpoint ini di-poll
  // tiap 30 detik per kasir (use-shift) → beban DB konstan, bukan tumbuh dengan
  // jumlah transaksi dalam shift. Wajib dipakai dengan index (cashSessionId, status).
  const groups = await tx.transaction.groupBy({
    by: ['paymentMethod'],
    where: { cashSessionId: sessionId, status: { in: ['COMPLETED', 'REFUNDED'] } },
    _count: { _all: true },
    _sum: { totalAmount: true, refundedAmount: true },
  })

  let cashTotal = 0
  let nonCashTotal = 0
  let transactionCount = 0
  const byMethod: { method: string; count: number; total: number }[] = []
  for (const g of groups) {
    const count = g._count._all
    // Net baris = totalAmount − refundedAmount (baris REFUNDED penuh = 0; VOID tak masuk where).
    const net = (g._sum.totalAmount ?? 0) - (g._sum.refundedAmount ?? 0)
    transactionCount += count
    byMethod.push({ method: g.paymentMethod, count, total: net })
    if (g.paymentMethod === 'CASH') cashTotal += net
    else nonCashTotal += net
  }
  byMethod.sort((a, b) => a.method.localeCompare(b.method))

  return {
    transactionCount,
    cashTotal,
    nonCashTotal,
    total: cashTotal + nonCashTotal,
    expectedCash: openingCash + cashTotal,
    byMethod,
  }
}
