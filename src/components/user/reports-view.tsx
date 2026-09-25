// Laporan: ringkasan periode + metode pembayaran + item terlaris + tren harian + ekspor CSV.
"use client";

import { useState } from "react";
import { BarChart3, ReceiptText, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniBarChart } from "@/components/app/mini-bar-chart";
import { EmptyState, MoneyCell, PageHeader, RankBadge, StatCard } from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { formatIDR, formatQty, formatDateID } from "@/lib/format";
import type { Paginated } from "@/lib/types";

type ReportDTO = {
  period: { dateFrom: string; dateTo: string }
  summary: { completedCount: number; completedTotal: number; totalDiscount: number; voidCount: number; refundedCount?: number; average: number }
  byMethod: { method: string; count: number; total: number }[]
  topItems: { id: string; name: string; type: string; qty: number; revenue: number }[]
  daily: { ymd: string; total: number; count: number }[]
}

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

const METHOD_LABELS: Record<string, string> = { CASH: "Tunai", TRANSFER: "Transfer", QRIS: "QRIS", OTHER: "Lainnya" }

// Warna bar per metode — selaras dengan tint PaymentMethodBadge.
const METHOD_BAR: Record<string, string> = {
  CASH: "bg-emerald-600 dark:bg-emerald-500",
  QRIS: "bg-primary",
  TRANSFER: "bg-amber-500 dark:bg-amber-400",
  OTHER: "bg-muted-foreground/50",
}
const METHOD_DOT: Record<string, string> = {
  CASH: "bg-emerald-600 dark:bg-emerald-500",
  QRIS: "bg-primary",
  TRANSFER: "bg-amber-500 dark:bg-amber-400",
  OTHER: "bg-muted-foreground/60",
}

type Preset = "today" | "7d" | "30d" | null

export default function ReportsView() {
  const [dateFrom, setDateFrom] = useState(daysAgo(29))
  const [dateTo, setDateTo] = useState(jakartaToday())

  const query = `dateFrom=${dateFrom}&dateTo=${dateTo}`
  const { data, loading, error } = useApi<ReportDTO>(`/api/reports?${query}`)

  const chartData = (data?.daily ?? []).slice(-30).map((d) => ({
    label: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(`${d.ymd}T12:00:00+07:00`)),
    total: d.total,
    count: d.count,
  }))

  // Preset aktif (presentasional — dideteksi dari nilai filter yang ada).
  const today = jakartaToday()
  const preset: Preset =
    dateTo === today && dateFrom === daysAgo(0) ? "today"
    : dateTo === today && dateFrom === daysAgo(6) ? "7d"
    : dateTo === today && dateFrom === daysAgo(29) ? "30d"
    : null

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Laporan"
        description="Ringkasan penjualan per periode — agregat dihitung server, hanya transaksi selesai."
        actions={
          <ExportMenu params={{ type: "transactions", dateFrom, dateTo }} label="Ekspor" />
        }
      />

      {/* Filter periode */}
      <Card className="mb-5">
        <CardContent className="p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="r-from">Dari tanggal</Label>
            <Input id="r-from" type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} className="tabular w-40" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-to">Sampai tanggal</Label>
            <Input id="r-to" type="date" value={dateTo} max={jakartaToday()} onChange={(e) => setDateTo(e.target.value)} className="tabular w-40" />
          </div>
          <div
            className="flex gap-1 rounded-lg bg-muted p-1 ml-auto"
            role="group"
            aria-label="Pilih periode cepat"
          >
            {([
              { key: "today" as const, label: "Hari ini", from: 0 },
              { key: "7d" as const, label: "7 hari", from: 6 },
              { key: "30d" as const, label: "30 hari", from: 29 },
            ]).map((p) => (
              <Button
                key={p.key}
                size="sm"
                variant="ghost"
                aria-pressed={preset === p.key}
                className={cn(
                  "h-9 px-3.5 text-xs rounded-md transition-colors active:scale-[0.96]",
                  preset === p.key
                    ? "bg-primary text-primary-foreground hover:bg-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/70"
                )}
                onClick={() => { setDateFrom(daysAgo(p.from)); setDateTo(jakartaToday()) }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error && <EmptyState title="Gagal memuat laporan" description={error} icon={BarChart3} />}
      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <StatCard label="Total penjualan" value={formatIDR(data.summary.completedTotal)} tone="success" icon={TrendingUp} loading={loading} />
            <StatCard label="Transaksi selesai" value={String(data.summary.completedCount)} icon={ReceiptText} loading={loading} />
            <StatCard label="Rata-rata transaksi" value={formatIDR(data.summary.average)} icon={BarChart3} loading={loading} />
            <StatCard label="Dibatalkan (VOID)" value={String(data.summary.voidCount)} tone={data.summary.voidCount > 0 ? "warning" : "default"} icon={BarChart3} loading={loading} hint={`Total diskon: ${formatIDR(data.summary.totalDiscount)}`} />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">Tren harian</CardTitle>
                    <CardDescription>
                      {formatDateID(`${data.period.dateFrom}T12:00:00+07:00`)} — {formatDateID(`${data.period.dateTo}T12:00:00+07:00`)}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="tabular shrink-0">
                    {data.summary.completedCount} tx
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {chartData.length ? (
                  <MiniBarChart data={chartData} />
                ) : (
                  <p className="text-sm text-muted-foreground py-10 text-center">Tidak ada transaksi pada periode ini.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Metode pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                {!data.byMethod.length ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data.</p>
                ) : (
                  <ul className="space-y-3.5">
                    {data.byMethod.map((m) => {
                      const pct = data.summary.completedTotal > 0
                        ? Math.round((m.total / data.summary.completedTotal) * 100)
                        : 0
                      return (
                        <li key={m.method}>
                          <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="font-medium flex items-center gap-1.5">
                              <span className={cn("size-1.5 rounded-full", METHOD_DOT[m.method] ?? METHOD_DOT.OTHER)} aria-hidden="true" />
                              {METHOD_LABELS[m.method] ?? m.method}
                            </span>
                            <span className="tabular text-xs text-muted-foreground">{m.count} tx</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden" role="presentation">
                              <div
                                className={cn("h-full rounded-full transition-all duration-300", METHOD_BAR[m.method] ?? METHOD_BAR.OTHER)}
                                style={{ width: `${Math.max(3, pct)}%` }}
                              />
                            </div>
                            <div className="w-24 text-right shrink-0">
                              <p className="text-xs tabular font-medium">{formatIDR(m.total)}</p>
                              <p className="text-[10px] text-muted-foreground tabular">{pct}%</p>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-5">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Item terlaris (maks. 10)</CardTitle>
              <CardDescription>Berdasarkan kuantitas terjual pada periode</CardDescription>
            </CardHeader>
            <CardContent>
              {!data.topItems.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Belum ada item terjual pada periode ini.</p>
              ) : (
                <ol className="space-y-2.5">
                  {data.topItems.map((item, i) => (
                    <li key={`${item.id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <RankBadge rank={i + 1} />
                      <span className="truncate flex-1 min-w-[8.5rem]">{item.name}</span>
                      <Badge variant="secondary" className="shrink-0">{item.type === "PRODUCT" ? "Produk" : "Jasa"}</Badge>
                      <span className="flex items-center gap-3 ml-auto shrink-0">
                        <span className="text-xs text-muted-foreground tabular w-16 text-right">{formatQty(item.qty)}×</span>
                        <MoneyCell amount={item.revenue} className="font-semibold w-28 text-right" />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
