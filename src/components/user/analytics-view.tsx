// View Analitik (Tier 2): best seller + margin, slow moving, jam ramai, mix pembayaran.
"use client";

import { useState } from "react";
import { BarChart3, Clock, PackageX, Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingRows, MoneyCell, PageHeader, RankBadge } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { formatIDR, formatNumberID } from "@/lib/format";

type AnalyticsData = {
  period: { days: number }
  bestSellers: { name: string; qty: number; revenue: number; cost: number; margin: number; type: string }[]
  slowMovers: { id: string; name: string; stockQty: number; unit: string; stockValue: number }[]
  peakHours: { hour: number; count: number; revenue: number }[]
  paymentMix: { method: string; count: number; total: number }[]
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai", TRANSFER: "Transfer", QRIS: "QRIS", OTHER: "Lainnya", TEMPO: "Tempo",
}

export default function AnalyticsView() {
  const [days, setDays] = useState(30)
  const { data, error, loading, refresh } = useApi<AnalyticsData>(`/api/analytics?days=${days}`)

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Analitik Penjualan"
        description="Produk paling menguntungkan, barang menumpuk, dan jam ramai pelanggan."
        actions={
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" aria-label="Periode analitik">
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
        }
      />

      {error && <ErrorState message={error} onRetry={refresh} />}
      {loading && !data && <div className="p-4"><LoadingRows rows={10} /></div>}

      {data && (
        <div className="space-y-6">
          {/* Best seller */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Trophy className="size-4 text-primary" />Produk terlaris ({data.period.days} hari)</h3>
              {!data.bestSellers.length ? (
                <p className="text-sm text-muted-foreground">Belum ada penjualan dalam periode ini.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Terjual</TableHead>
                      <TableHead className="text-right">Pendapatan</TableHead>
                      <TableHead className="hidden sm:table-cell text-right">Margin est.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.bestSellers.map((p, i) => (
                      <TableRow key={p.name}>
                        <TableCell><RankBadge rank={i + 1} /></TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular text-muted-foreground">{formatNumberID(p.qty)}</TableCell>
                        <TableCell className="text-right"><MoneyCell amount={p.revenue} /></TableCell>
                        <TableCell className="hidden sm:table-cell text-right tabular text-emerald-700 dark:text-emerald-400">{formatIDR(p.margin)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-xs text-muted-foreground mt-2">Margin estimasi memakai harga beli (HPP) saat ini — item tanpa harga beli dihitung margin penuh.</p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Slow moving */}
            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><PackageX className="size-4 text-amber-500" />Barang menumpuk (tidak terjual)</h3>
                {!data.slowMovers.length ? (
                  <p className="text-sm text-muted-foreground">Semua produk terjual dalam periode ini 🎉</p>
                ) : (
                  <ul className="space-y-2">
                    {data.slowMovers.map((p) => (
                      <li key={p.id} className="flex items-center justify-between text-sm rounded-lg border px-3 py-2">
                        <span className="font-medium truncate">{p.name}</span>
                        <span className="text-right shrink-0 ml-2">
                          <span className="block tabular">{formatNumberID(p.stockQty)} {p.unit}</span>
                          <span className="block text-xs text-muted-foreground tabular">nilai stok {formatIDR(p.stockValue)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Payment mix */}
            <Card>
              <CardContent className="pt-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><BarChart3 className="size-4 text-primary" />Metode pembayaran</h3>
                {!data.paymentMix.length ? (
                  <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.paymentMix.map((m) => (
                      <li key={m.method} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {m.method}
                          {m.method === "TEMPO" && <Badge variant="outline" className="text-[10px]">kredit</Badge>}
                        </span>
                        <span className="tabular">{formatIDR(m.total)} <span className="text-muted-foreground text-xs">({m.count}×)</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Peak hours */}
          <Card>
            <CardContent className="pt-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="size-4 text-primary" />Jam ramai pelanggan</h3>
              <div className="flex items-end gap-1 h-32 border-b border-border" role="img" aria-label="Distribusi transaksi per jam">
                {data.peakHours.map((h) => {
                  const max = Math.max(1, ...data.peakHours.map((x) => x.count))
                  const pct = Math.max(3, Math.round((h.count / max) * 100))
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group min-w-0" title={`${h.hour}:00 — ${h.count} transaksi (${formatIDR(h.revenue)})`}>
                      <div className="w-full rounded-t-md bg-primary/60 group-hover:bg-primary" style={{ height: `${pct}%` }} />
                      <span className="text-[9px] text-muted-foreground mt-1">{h.hour}</span>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Jumlah transaksi per jam (WIB), {data.period.days} hari terakhir.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
