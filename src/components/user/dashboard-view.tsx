// Dashboard kasir: hero sapaan, kartu navigasi cepat, KPI hari ini (chip tren
// vs kemarin dihitung riil dari salesLast7Days), grafik 7 hari, stok menipis,
// transaksi terbaru, item terlaris — gaya visual ala desain referensi.
"use client";

import {
  ChevronRight,
  Package,
  RefreshCw,
  ScanBarcode,
  TriangleAlert,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { useApp } from "@/components/app/app-context";
import { MiniBarChart } from "@/components/app/mini-bar-chart";
import {
  DesignStatCard,
  EmptyState,
  ErrorState,
  MoneyCell,
  PaymentMethodBadge,
  RankBadge,
  TrendChip,
  TransactionStatusBadge,
} from "@/components/app/shared";
import { cn } from "@/lib/utils";
import { formatDateTimeID, formatDateTimeLongID, formatIDR, formatQty } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import type { DashboardMetricsDTO } from "@/lib/types";

// Tanggal (1–31) menurut WIB — penentu spirit harian; server UTC vs client WIB
// bisa beda kalender di sekitar tengah malam, jadi juga dihitung eksplisit.
function getDateWIB(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit" }).format(d));
}
// ymd "YYYY-MM-DD" WIB untuk hari ini / kemarin (en-CA = ISO). Dipakai mencari
// entri kemarin di salesLast7Days agar chip "+X% dari kemarin" memakai data riil.
function ymdWIB(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
}

// Semangat harian — dipilih deterministik dari tanggal WIB supaya SSR & client
// identik (aman hydration) dan berotasi tiap hari, bukan tiap render.
const SPIRITS = [
  "Semangat jaga toko hari ini! 💪",
  "Hari ini pasti lancar!",
  "Pelayanan ramah, pembeli betah! 🤝",
  "Produk terlaris menantimu! 🏃",
  "Satu transaksi lagi, satu langkah maju! 🚀",
  "Jaga stok, jaga senyum pembeli! 😄",
  "Kasir rapi, laporan enak dibaca! 📒",
] as const;

// Snapshot server = false, client = true (pola ThemeToggle di app-shell):
// teks tanggal hanya dirender SETELAH mount → bebas hydration mismatch.
const emptySubscribe = () => () => {};

export default function DashboardView() {
  const { user, navigate } = useApp();
  const { data, error, loading, refresh } = useApi<DashboardMetricsDTO>("/api/dashboard");

  const weekTotal = (data?.salesLast7Days ?? []).reduce((sum, d) => sum + d.total, 0);

  // Angka KPI berjalan naik (count-up) saat data tiba — dashboard terasa hidup.
  const animatedSales = useCountUp(data?.salesToday ?? 0);
  const animatedTx = useCountUp(data?.transactionsToday ?? 0);
  const animatedAvg = useCountUp(data?.averageTransaction ?? 0);
  const animatedItems = useCountUp(data?.itemsSoldToday ?? 0);

  // mounted = false saat SSR & render-hydration pertama, lalu true setelah mount.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const now = new Date();
  const spirit = SPIRITS[getDateWIB(now) % SPIRITS.length];
  const firstName = user.fullName.split(" ")[0];

  // --- Chip tren riil "dari kemarin" (dari deret 7 hari, ymd WIB) ---
  const y = (data?.salesLast7Days ?? []).find((d) => d.ymd === ymdWIB(1));
  const pctChange = (todayVal: number | null | undefined, yesterdayVal: number | null | undefined): number | null => {
    if (todayVal === undefined || todayVal === null || !yesterdayVal || yesterdayVal <= 0) return null;
    return Math.round(((todayVal - yesterdayVal) / yesterdayVal) * 100);
  };
  const salesPct = pctChange(data?.salesToday, y?.total);
  const txPct = pctChange(data?.transactionsToday, y?.count);
  const yAvg = y && y.count > 0 ? y.total / y.count : null;
  const avgPct = pctChange(data?.averageTransaction, yAvg);
  const fmtDelta = (p: number) => `${p >= 0 ? "+" : ""}${p}% dari kemarin`;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero sapaan ala desain — gradien biru, blob putih, maskot logo toko,
          tombol muat ulang kecil di pojok. Menggantikan PageHeader + chip semangat. */}
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-200 via-indigo-100 to-blue-200 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-800 ring-1 ring-inset ring-white/60 dark:ring-white/10 p-5 sm:p-6 pr-24 sm:pr-28 mb-5"
        aria-label={`Sapaan untuk ${firstName}`}
      >
        {/* Dekorasi lembut */}
        <div className="pointer-events-none absolute -top-10 -right-6 size-28 rounded-full bg-white/75 dark:bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-14 left-1/3 size-32 rounded-full bg-white/60 dark:bg-white/5" aria-hidden="true" />

        {/* Maskot toko — logo toko bila terpasang, fallback emoji boba */}
        {user.tenant?.logoUrl ? (
          <img
            src={user.tenant.logoUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute right-3 bottom-2 size-16 sm:size-20 rounded-2xl object-contain bg-white/70 ring-1 ring-white/80 shadow-md select-none dark:bg-white/10 dark:ring-white/10"
          />
        ) : (
          <span className="pointer-events-none absolute right-3 bottom-0 text-[4.5rem] sm:text-8xl leading-none select-none drop-shadow-md" aria-hidden="true">
            🧋
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          disabled={loading}
          className="absolute top-3 right-3 size-8 rounded-full bg-white/60 dark:bg-white/10 hover:bg-white text-slate-700 dark:text-slate-200"
          aria-label="Muat ulang data dashboard"
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
        </Button>

        <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          Halo, {firstName}! <span aria-hidden="true">👋</span>
        </p>
        <p className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 mt-1">{spirit}</p>
        <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1.5 tabular">
          {user.tenant?.businessName ?? "Toko Anda"}
          {mounted ? ` · ${formatDateTimeLongID(now)} WIB` : ""}
        </p>
      </section>

      {/* Kartu navigasi cepat ala desain: 3 kartu pastel (Pelanggan, Riwayat,
          Laporan) — Kasir & Menu tetap ada di bottom nav. */}
      <div className="grid grid-cols-3 gap-3 mb-5" role="navigation" aria-label="Pintasan cepat">
        {QUICK_NAV.map((s) => (
          <button
            key={s.path}
            type="button"
            onClick={() => navigate(s.path)}
            className={cn(
              "sb-wiggle group relative overflow-hidden rounded-3xl bg-gradient-to-br p-3.5 sm:p-4 text-left ring-1 ring-inset shadow-[0_10px_30px_-20px_rgb(0_0_0/0.3)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98]",
              s.card
            )}
          >
            <div className="pointer-events-none absolute -bottom-6 -right-6 size-16 rounded-full bg-white/75 dark:bg-white/50" aria-hidden="true" />
            <span
              className="relative size-10 sm:size-12 rounded-2xl bg-white/85 dark:bg-white/10 grid place-items-center text-xl sm:text-[1.7rem] leading-none shadow-sm"
              aria-hidden="true"
            >
              {s.emoji}
            </span>
            <span className="relative mt-2.5 sm:mt-3 flex items-center justify-between gap-1 w-full">
              <span className="text-[13px] sm:text-[15px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{s.label}</span>
              <span className="size-5 sm:size-6 shrink-0 rounded-full bg-white/85 dark:bg-white/10 grid place-items-center text-slate-600 dark:text-slate-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                <ChevronRight className="size-3 sm:size-3.5" />
              </span>
            </span>
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      {/* KPI 2×2 ala desain — tile emoji, angka besar, chip tren riil */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <DesignStatCard
          emoji="🛍️"
          tileClass="bg-blue-100/90 dark:bg-blue-500/15"
          cardClass="from-sky-50 via-white to-blue-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
          ornamentClass="bg-sky-200/60"
          label={"Penjualan\nHari Ini"}
          value={formatIDR(animatedSales)}
          loading={loading}
          chip={
            <TrendChip icon="📈" className="text-slate-600 dark:text-slate-300">
              {salesPct === null ? `Bulan ini ${formatIDR(data?.salesThisMonth ?? 0)}` : fmtDelta(salesPct)}
            </TrendChip>
          }
        />
        <DesignStatCard
          emoji="🧾"
          tileClass="bg-violet-100/90 dark:bg-violet-500/15"
          cardClass="from-violet-50 via-white to-purple-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
          ornamentClass="bg-violet-200/60"
          label={"Transaksi\nHari Ini"}
          value={String(Math.round(animatedTx))}
          loading={loading}
          chip={
            <TrendChip icon="📊">
              {txPct === null ? `Bulan ini ${data?.transactionsThisMonth ?? 0} transaksi` : fmtDelta(txPct)}
            </TrendChip>
          }
        />
        <DesignStatCard
          emoji="🧮"
          tileClass="bg-emerald-100/90 dark:bg-emerald-500/15"
          cardClass="from-emerald-50 via-white to-teal-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
          ornamentClass="bg-emerald-200/60"
          label={"Rata-rata\nTransaksi"}
          value={formatIDR(animatedAvg)}
          loading={loading}
          chip={
            <TrendChip icon="↗️">
              {avgPct === null ? "Hari ini" : fmtDelta(avgPct)}
            </TrendChip>
          }
        />
        <DesignStatCard
          emoji="📦"
          tileClass="bg-amber-100/90 dark:bg-amber-500/15"
          cardClass="from-amber-50 via-white to-orange-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10"
          ornamentClass="bg-amber-200/60"
          label="Item Terjual"
          value={formatQty(Math.round(animatedItems))}
          loading={loading}
          chip={<TrendChip icon="📦">Produk + jasa, hari ini</TrendChip>}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
        {/* Grafik 7 hari */}
        <Card ornamented className="lg:col-span-2 min-w-0 rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">Penjualan 7 Hari Terakhir</CardTitle>
                <CardDescription>Total penjualan harian (transaksi selesai)</CardDescription>
              </div>
              {!loading && data?.salesLast7Days ? (
                <Badge variant="secondary" className="tabular shrink-0 rounded-full">
                  Σ {formatIDR(weekTotal)}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40 w-full" /> : <MiniBarChart data={data?.salesLast7Days ?? []} />}
          </CardContent>
        </Card>

        {/* Stok menipis */}
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
              Stok Menipis
              {!!data?.lowStockCount && (
                <Badge variant="secondary" className="tabular rounded-full">{data.lowStockCount}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {data?.lowStockCount ? `${data.lowStockCount} produk perlu restock` : "Semua stok aman"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : !data?.lowStockItems?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada produk dengan stok menipis. 🎉</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {data.lowStockItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-sm rounded-2xl bg-muted/40 px-3 py-2.5 transition-colors hover:bg-muted/70"
                  >
                    <span className="truncate">{item.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 tabular rounded-full",
                        item.stockQty <= 0
                          ? "border-destructive/40 text-destructive"
                          : "border-amber-500/40 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      {formatQty(item.stockQty)} / {formatQty(item.minStockQty)} {item.unit}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4 rounded-full"
              onClick={() => navigate(data?.lowStockCount ? "/app/products/stok" : "/app/products")}
            >
              <Package className="size-4" />
              {data?.lowStockCount ? "Lihat stok menipis" : "Kelola produk"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
        {/* Transaksi terbaru */}
        <Card className="lg:col-span-2 min-w-0 rounded-3xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
                <CardDescription>6 transaksi terakhir</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate("/app/transactions")}>
                Semua transaksi
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : !data?.recentTransactions?.length ? (
              <EmptyState
                title="Belum ada transaksi"
                description="Mulai transaksi pertama Anda lewat halaman Kasir."
                emoji="🛒"
                action={
                  <Button size="sm" className="rounded-full" onClick={() => navigate("/app/pos")}>
                    <ScanBarcode className="size-4" />
                    Buka Kasir
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {data.recentTransactions.map((tx) => (
                  <li key={tx.id}>
                    <a
                      href={`#/app/transactions/${tx.id}`}
                      className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium tabular truncate">{tx.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDateTimeID(tx.createdAt)}
                          {tx.customerName ? ` · ${tx.customerName}` : ""}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <PaymentMethodBadge method={tx.paymentMethod} />
                        <TransactionStatusBadge status={tx.status} />
                      </div>
                      <MoneyCell amount={tx.totalAmount} className="text-sm font-semibold text-right shrink-0" />
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Item terlaris */}
        <Card className="rounded-3xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Terlaris Bulan Ini</CardTitle>
            <CardDescription>Produk &amp; jasa paling banyak terjual</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !data?.topItems?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada penjualan bulan ini — tanaman duluan, panen belakangan 🌱</p>
            ) : (
              <ol className="space-y-2.5">
                {data.topItems.map((item, i) => (
                  <li key={`${item.id}-${i}`} className="flex items-center gap-3 text-sm">
                    <RankBadge rank={i + 1} />
                    <span className="truncate flex-1">{item.name}</span>
                    <Badge variant="secondary" className="shrink-0 rounded-full">
                      {item.type === "PRODUCT" ? "Produk" : "Jasa"}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular shrink-0">{formatQty(item.qty)}×</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Navigasi cepat ala desain — 3 kartu pastel dengan emoji 3D-look & chevron.
const QUICK_NAV: {
  emoji: string;
  label: string;
  path: string;
  /** Kelas gradien kartu (ringan: murni CSS, tanpa gambar). */
  card: string;
}[] = [
  {
    emoji: "👥",
    label: "Pelanggan",
    path: "/app/customers",
    card: "from-emerald-50 to-emerald-100 ring-emerald-200/60 dark:from-slate-800 dark:to-slate-800 dark:ring-white/10",
  },
  {
    emoji: "🧾",
    label: "Riwayat",
    path: "/app/transactions",
    card: "from-amber-50 to-orange-100 ring-amber-200/60 dark:from-slate-800 dark:to-slate-800 dark:ring-white/10",
  },
  {
    emoji: "📊",
    label: "Laporan",
    path: "/app/reports",
    card: "from-rose-50 to-rose-100 ring-rose-200/60 dark:from-slate-800 dark:to-slate-800 dark:ring-white/10",
  },
]
