// Dashboard Keuangan (Tier 1): kas masuk/keluar, grafik 14 hari, RAB berjalan,
// piutang/hutang beredar, estimasi laba kotor, top pengeluaran.
"use client";

import { AlertTriangle, Banknote, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingRows, PageHeader, StatCard } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { ApiClientError } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";

type FinanceData = {
  period: { days: number; start: string; end: string }
  sales: { total: number; count: number; today: number; todayCount: number }
  cash: { posCashIn: number; otherIn: number; out: number; net: number }
  chart: { label: string; in: number; out: number }[]
  topExpenses: { category: string; total: number }[]
  projects: {
    activeCount: number
    budgetTotal: number
    realizationTotal: number
    items: { id: string; code: string; name: string; budgetTotal: number; realizationTotal: number; remaining: number }[]
  }
  receivables: { outstanding: number; count: number; overdueCount: number }
  payables: { outstanding: number; count: number }
  grossProfitEstimate: number
}

export default function FinanceDashboardView() {
  const { data, error, loading, refresh } = useApi<FinanceData>("/api/finance-dashboard?days=30")

  if (error) return <div className="max-w-6xl mx-auto"><ErrorState message={error} onRetry={refresh} /></div>
  if (loading || !data) return <div className="max-w-6xl mx-auto p-4"><LoadingRows rows={10} /></div>

  const chartMax = Math.max(1, ...data.chart.map((d) => Math.max(d.in, d.out)))

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Dashboard Keuangan"
        description={`Ringkasan ${data.period.days} hari terakhir — kas, RAB, hutang piutang, dan estimasi laba.`}
        actions={<Button variant="outline" onClick={refresh} disabled={loading}>Segarkan</Button>}
      />

      {/* Kartu utama */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Penjualan (30 hari)" value={formatIDR(data.sales.total)} hint={`${data.sales.count} transaksi · hari ini ${formatIDR(data.sales.today)} (${data.sales.todayCount})`} tone="success" icon={TrendingUp} />
        <StatCard label="Kas masuk (POS tunai + lainnya)" value={formatIDR(data.cash.posCashIn + data.cash.otherIn)} hint={`POS tunai ${formatIDR(data.cash.posCashIn)} · non-kasir ${formatIDR(data.cash.otherIn)}`} icon={Wallet} />
        <StatCard label="Kas keluar" value={formatIDR(data.cash.out)} hint="Cashflow: pengeluaran + PO tunai" tone="danger" icon={TrendingDown} />
        <StatCard label="Estimasi laba kotor" value={formatIDR(data.grossProfitEstimate)} hint="Penjualan − HPP (harga beli terakhir)" tone={data.grossProfitEstimate >= 0 ? "success" : "danger"} icon={Banknote} />
      </div>

      {/* Grafik kas 14 hari */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Arus kas 14 hari terakhir</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary inline-block" />Masuk</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-destructive inline-block" />Keluar</span>
            </div>
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2 h-44 border-b border-border" role="img" aria-label="Grafik arus kas harian">
            {data.chart.map((d, i) => {
              const inPct = Math.max(2, Math.round((d.in / chartMax) * 100))
              const outPct = Math.max(2, Math.round((d.out / chartMax) * 100))
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full group">
                  <div className="relative w-full flex-1 min-h-0 flex items-end justify-center gap-0.5">
                    <div className="w-1/2 rounded-t-md bg-primary/70" style={{ height: `${inPct}%` }} title={`Masuk ${formatIDR(d.in)}`} />
                    <div className="w-1/2 rounded-t-md bg-destructive/60" style={{ height: `${outPct}%` }} title={`Keluar ${formatIDR(d.out)}`} />
                    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 shadow-lg">
                      <p>{d.label}</p>
                      <p className="tabular">Masuk {formatIDR(d.in)}</p>
                      <p className="tabular">Keluar {formatIDR(d.out)}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">Net kas 30 hari: <strong className="tabular">{formatIDR(data.cash.net)}</strong></p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        {/* RAB berjalan */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Proyek / RAB berjalan</h3>
              <Badge className="border-0 bg-primary/10 text-primary">{data.projects.activeCount} aktif</Badge>
            </div>
            {!data.projects.items.length ? (
              <p className="text-sm text-muted-foreground py-4">Tidak ada proyek aktif. <a href="#/app/projects" className="text-primary hover:underline">Buat proyek →</a></p>
            ) : (
              <div className="space-y-3">
                {data.projects.items.map((p) => {
                  const pct = p.budgetTotal > 0 ? Math.round((p.realizationTotal / p.budgetTotal) * 100) : 0
                  return (
                    <a key={p.id} href={`#/app/projects/${p.id}`} className="block rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium truncate">{p.name}</span>
                        <span className={`tabular shrink-0 ${p.remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>{pct > 100 ? `${pct}% ⚠` : `${pct}%`}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted mt-2 overflow-hidden">
                        <div className={`h-full rounded-full ${pct > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 tabular">
                        Realisasi {formatIDR(p.realizationTotal)} / anggaran {formatIDR(p.budgetTotal)} · sisa {formatIDR(p.remaining)}
                      </p>
                    </a>
                  )
                })}
                <p className="text-xs text-muted-foreground">Total anggaran {formatIDR(data.projects.budgetTotal)} · realisasi {formatIDR(data.projects.realizationTotal)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hutang piutang + top pengeluaran */}
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-3">
              <h3 className="font-semibold text-sm">Hutang & Piutang beredar</h3>
              <a href="#/app/debts" className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <span className="text-sm flex items-center gap-2"><TrendingUp className="size-4 text-amber-500" />Piutang pelanggan</span>
                <span className="text-right">
                  <span className="block font-semibold tabular">{formatIDR(data.receivables.outstanding)}</span>
                  <span className="block text-xs text-muted-foreground">{data.receivables.count} tagihan{data.receivables.overdueCount > 0 ? ` · ${data.receivables.overdueCount} lewat tempo` : ""}</span>
                </span>
              </a>
              <a href="#/app/debts" className="flex items-center justify-between rounded-lg border px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <span className="text-sm flex items-center gap-2"><TrendingDown className="size-4 text-destructive" />Hutang supplier</span>
                <span className="text-right">
                  <span className="block font-semibold tabular">{formatIDR(data.payables.outstanding)}</span>
                  <span className="block text-xs text-muted-foreground">{data.payables.count} tagihan</span>
                </span>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-3">Top pengeluaran (30 hari)</h3>
              {!data.topExpenses.length ? (
                <p className="text-sm text-muted-foreground py-2">Belum ada pengeluaran tercatat.</p>
              ) : (
                <ul className="space-y-2">
                  {data.topExpenses.map((e) => (
                    <li key={e.category} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2"><AlertTriangle className="size-3.5 text-muted-foreground" />{e.category.replaceAll("_", " ").toLowerCase()}</span>
                      <span className="tabular font-medium">{formatIDR(e.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
