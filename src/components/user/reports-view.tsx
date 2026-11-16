// Laporan: ringkasan periode + metode pembayaran + item terlaris + tren harian + ekspor CSV.
// Gaya kartu statistik & grafik mengikuti desain referensi (pastel + emoji tile).
"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniBarChart } from "@/components/app/mini-bar-chart";
import { DesignStatCard, EmptyState, MoneyCell, PageHeader, RankBadge } from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { formatIDR, formatQty, formatDateID } from "@/lib/format";

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

// Warna bar & titik per metode — selaras dengan tint PaymentMethodBadge.
const METHOD_BAR: Record<string, string> = {
  CASH: "bg-emerald-600 dark:bg-emerald-500",
  QRIS: "bg-gradient-to-r from-blue-500 to-blue-600",
  TRANSFER: "bg-amber-500 dark:bg-amber-400",
  OTHER: "bg-violet-400 dark:bg-violet-500",
}
const METHOD_DOT: Record<string, string> = {
  CASH: "bg-emerald-600 dark:bg-emerald-500",
  QRIS: "bg-blue-600 dark:bg-blue-500",
  TRANSFER: "bg-amber-500 dark:bg-amber-400",
  OTHER: "bg-violet-400 dark:bg-violet-500",
}
const METHOD_PCT: Record<string, string> = {
  CASH: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  QRIS: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  TRANSFER: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  OTHER: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
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

      {/* Filter periode — kartu pastel dengan tile 📅, preset pill di baris sendiri */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 ring-1 ring-inset ring-black/[0.04] p-4 sm:p-5 mb-5">
        <div className="flex items-center gap-3">
          <span className="size-11 shrink-0 rounded-2xl bg-blue-100/90 dark:bg-blue-500/15 grid place-items-center text-2xl leading-none" aria-hidden="true">
            📅
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground leading-tight">Periode laporan</p>
            <p className="text-xs text-muted-foreground">Preset cepat atau rentang tanggal</p>
          </div>
        </div>
        <div
          className="flex gap-1.5 rounded-full bg-muted p-1 mt-3 w-full sm:w-auto sm:ml-14"
          role="group"
          aria-label="Pilih periode cepat"
        >
          {([
            { key: "today" as const, label: "Hari ini", from: 0 },
            { key: "7d" as const, label: "7 hr", from: 6 },
            { key: "30d" as const, label: "30 hr", from: 29 },
          ]).map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant="ghost"
              aria-pressed={preset === p.key}
              className={cn(
                "h-8 flex-1 sm:flex-none px-3 text-xs rounded-full transition-colors active:scale-[0.96]",
                preset === p.key
                  ? "bg-primary text-primary-foreground hover:bg-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/70"
              )}
              onClick={() => { setDateFrom(daysAgo(p.from)); setDateTo(jakartaToday()) }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:flex sm:gap-4 gap-2.5 mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-from">Dari tanggal</Label>
            <Input id="r-from" type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} className="tabular sm:w-40 rounded-full bg-white/80 dark:bg-transparent" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-to">Sampai tanggal</Label>
            <Input id="r-to" type="date" value={dateTo} max={jakartaToday()} onChange={(e) => setDateTo(e.target.value)} className="tabular sm:w-40 rounded-full bg-white/80 dark:bg-transparent" />
          </div>
        </div>
      </div>

      {error && <EmptyState title="Gagal memuat laporan" description={error} icon={BarChart3} />}
      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-3xl" />)}
        </div>
      )}

      {data && (
        <>
          {/* 4 kartu statistik ala desain — gradien pastel + emoji tile */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <DesignStatCard
              emoji="📈"
              tileClass="bg-blue-100/90 dark:bg-blue-500/15"
              cardClass="from-sky-50 via-white to-blue-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
              label={"Total\nPenjualan"}
              labelBelow
              value={formatIDR(data.summary.completedTotal)}
              loading={loading}
              cornerChip={
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/90 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 tabular">
                  ↑ {data.summary.completedCount} tx
                </span>
              }
            />
            <DesignStatCard
              emoji="🧾"
              tileClass="bg-emerald-100/90 dark:bg-emerald-500/15"
              cardClass="from-emerald-50 via-white to-green-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
              label={"Transaksi\nSelesai"}
              labelBelow
              value={String(data.summary.completedCount)}
              loading={loading}
              cornerEmoji="✅"
            />
            <DesignStatCard
              emoji="💰"
              tileClass="bg-amber-100/90 dark:bg-amber-500/15"
              cardClass="from-amber-50 via-white to-yellow-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
              label={"Rata-rata\nTransaksi"}
              labelBelow
              value={formatIDR(data.summary.average)}
              loading={loading}
              cornerEmoji="📊"
            />
            <DesignStatCard
              emoji="🚫"
              tileClass="bg-purple-100/90 dark:bg-purple-500/15"
              cardClass="from-purple-50 via-white to-fuchsia-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
              label={"Dibatalkan\n(VOID)"}
              labelBelow
              value={String(data.summary.voidCount)}
              valueClass="text-orange-500"
              loading={loading}
              cornerEmoji="🏷️"
              chip={
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular">
                  Total diskon: {formatIDR(data.summary.totalDiscount)}
                </span>
              }
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
            {/* Tren harian — header dengan tile 📈 + rentang tanggal ala desain */}
            <Card className="lg:col-span-2 rounded-3xl">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="size-11 shrink-0 rounded-2xl bg-blue-100/90 dark:bg-blue-500/15 grid place-items-center text-2xl leading-none" aria-hidden="true">
                      📈
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-lg">Tren harian</CardTitle>
                      <CardDescription className="tabular">
                        {formatDateID(`${data.period.dateFrom}T12:00:00+07:00`)} — {formatDateID(`${data.period.dateTo}T12:00:00+07:00`)}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="tabular shrink-0 rounded-full">
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

            {/* Metode pembayaran — tile 👛 + baris bar ala desain */}
            <Card className="rounded-3xl">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="size-11 shrink-0 rounded-2xl bg-purple-100/90 dark:bg-purple-500/15 grid place-items-center text-2xl leading-none" aria-hidden="true">
                    👛
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">Metode pembayaran</CardTitle>
                    <CardDescription>Ringkasan metode pembayaran</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!data.byMethod.length ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Belum ada data.</p>
                ) : (
                  <ul className="space-y-4">
                    {data.byMethod.map((m) => {
                      const pct = data.summary.completedTotal > 0
                        ? Math.round((m.total / data.summary.completedTotal) * 100)
                        : 0
                      return (
                        <li key={m.method}>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-bold flex items-center gap-2 text-[15px] min-w-0">
                              <span className={cn("size-2.5 rounded-full shrink-0", METHOD_DOT[m.method] ?? METHOD_DOT.OTHER)} aria-hidden="true" />
                              <span className="truncate">{METHOD_LABELS[m.method] ?? m.method}</span>
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground tabular rounded-full bg-muted px-2.5 py-1 shrink-0">
                              {m.count} tx
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 flex-1 rounded-full bg-muted overflow-hidden" role="presentation">
                              <div
                                className={cn("h-full rounded-full transition-all duration-300", METHOD_BAR[m.method] ?? METHOD_BAR.OTHER)}
                                style={{ width: `${Math.max(3, pct)}%` }}
                              />
                            </div>
                            <div className="w-[5.5rem] text-right shrink-0">
                              <p className="text-sm font-bold tabular leading-tight">{formatIDR(m.total)}</p>
                              <span
                                className={cn(
                                  "inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular",
                                  METHOD_PCT[m.method] ?? METHOD_PCT.OTHER
                                )}
                              >
                                {pct}%
                              </span>
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

          <Card className="mt-5 rounded-3xl">
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
                      <Badge variant="secondary" className="shrink-0 rounded-full">{item.type === "PRODUCT" ? "Produk" : "Jasa"}</Badge>
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
