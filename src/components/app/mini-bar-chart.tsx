"use client";

// Chart batang ringan untuk penjualan 7 hari (tanpa recharts — bundle kecil, render div).

import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MiniBarChart({
  data,
  className,
}: {
  data: { label: string; total: number; count: number }[];
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const hasData = data.some((d) => d.total > 0);
  return (
    <div className={cn("w-full", className)} role="img" aria-label="Grafik batang penjualan harian">
      <div className="flex items-end gap-1.5 sm:gap-2.5 h-40 border-b border-border">
        {data.map((d, i) => {
          const pct = Math.max(2, Math.round((d.total / max) * 100))
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group min-w-0 h-full">
              <div className="relative w-full flex-1 min-h-0 flex items-end">
                <div
                  title={`${d.label} · ${formatIDR(d.total)} · ${d.count} transaksi`}
                  className={cn(
                    "w-full rounded-t-md transition-all duration-300",
                    d.total > 0
                      ? "bg-gradient-to-t from-primary/55 to-primary group-hover:from-primary/80 group-hover:to-primary"
                      : "bg-muted group-hover:bg-muted-foreground/20"
                  )}
                  style={{ height: `${pct}%` }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 whitespace-nowrap">
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
