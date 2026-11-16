"use client";

// Chart batang ringan untuk penjualan 7 hari (tanpa recharts — bundle kecil, render div).

import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Nilai ringkas untuk bubble di atas bar terlaris — "Rp 12,5 jt" ala desain,
// bukan "Rp 12.500.000" yang melebar melebihi lebar bar.
function compactIDR(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`
  if (n >= 1_000) return `Rp ${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} rb`
  return formatIDR(n)
}

export function MiniBarChart({
  data,
  className,
}: {
  data: { label: string; total: number; count: number }[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const hasData = data.some((d) => d.total > 0);
  // Hari terlaris mendapat bar EMAS + bubble nilai bermahkota 👑 — ala desain.
  // Bubble hanya saat bar sedikit (≤12) agar di 30 bar laporan tidak bertabrakan.
  const bestIndex = hasData
    ? data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0)
    : -1;
  const showBubble = bestIndex >= 0 && data.length <= 12;
  return (
    <div className={cn("w-full", className)} role="img" aria-label="Grafik batang penjualan harian">
      <div className="flex items-end gap-1.5 sm:gap-2.5 h-44 border-b border-border">
        {data.map((d, i) => {
          const pct = Math.max(2, Math.round((d.total / max) * 100))
          const isBest = i === bestIndex && d.total > 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group min-w-0 h-full">
              <div className="relative w-full flex-1 min-h-0 flex items-end">
                {isBest && showBubble && (
                  <span
                    className="sb-float pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1 text-[10.5px] font-bold text-amber-700 tabular whitespace-nowrap shadow-md z-10"
                    aria-label={`Hari terlaris: ${d.label} — ${formatIDR(d.total)}`}
                    title={`Terlaris — ${d.label}: ${formatIDR(d.total)} (${d.count} transaksi)`}
                  >
                    <span aria-hidden="true">👑</span>
                    {compactIDR(d.total)}
                  </span>
                )}
                {isBest && !showBubble && (
                  <span
                    className="sb-float pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 text-sm leading-none mb-0.5"
                    aria-label={`Hari terlaris: ${d.label}`}
                    title={`Terlaris — ${d.label}: ${formatIDR(d.total)} (${d.count} transaksi)`}
                  >
                    🏆
                  </span>
                )}
                <div
                  title={`${d.label} · ${formatIDR(d.total)} · ${d.count} transaksi`}
                  className={cn(
                    "w-full rounded-t-lg transition-all duration-300",
                    d.total > 0
                      ? isBest
                        ? "bg-gradient-to-t from-amber-500 via-amber-400 to-amber-300 group-hover:from-amber-600 group-hover:via-amber-500 group-hover:to-amber-400"
                        : "bg-gradient-to-t from-primary/60 via-primary to-primary group-hover:from-primary/80"
                      : "bg-muted group-hover:bg-muted-foreground/20"
                  )}
                  style={{ height: `${pct}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 whitespace-nowrap">
                  <div className="rounded-md bg-foreground text-background text-xs px-2.5 py-1.5 shadow-lg">
                    <p className="font-semibold tabular">{formatIDR(d.total)}</p>
                    <p className="opacity-80 tabular">{d.count} transaksi</p>
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
            </div>
          )
        })}
      </div>
      {!hasData && (
        <p className="text-center text-sm text-muted-foreground mt-3">Belum ada penjualan dalam 7 hari terakhir.</p>
      )}
    </div>
  )
}
