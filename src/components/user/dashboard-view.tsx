// Dashboard kasir: KPI hari ini, grafik 7 hari, stok menipis, transaksi terbaru, shortcut cepat.
"use client";

import {
  ChartColumn,
  ChevronRight,
  Package,
  ReceiptText,
  RefreshCw,
  ScanBarcode,
  ShoppingBasket,
  TriangleAlert,
  Users,
  Wallet,
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
  EmptyState,
  ErrorState,
  MoneyCell,
  PageHeader,
  PaymentMethodBadge,
  RankBadge,
  StatCard,
  TransactionStatusBadge,
} from "@/components/app/shared";
import { cn } from "@/lib/utils";
import { formatDateTimeID, formatDateTimeLongID, formatIDR, formatQty } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import type { DashboardMetricsDTO } from "@/lib/types";

// Sapaan dinamis sesuai jam WIB (Asia/Jakarta) — pengguna ada di Indonesia;
// jam server bisa UTC, jadi jam dihitung eksplisit lewat Intl + timezone.
function getHourWIB(d: Date): number {
  // "24" bisa keluar di sebagian runtime untuk tengah malam → normalisasi ke 0.
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hour12: false }).format(d));
  return h % 24;
}
// Tanggal (1–31) menurut WIB — penentu spirit harian; server UTC vs client WIB
// bisa beda kalender di sekitar tengah malam, jadi juga dihitung eksplisit.
function getDateWIB(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit" }).format(d));
}
function getGreeting(d: Date) {
  const h = getHourWIB(d);
  if (h >= 4 && h < 11) return { emoji: "☀️", text: "Selamat pagi" };
  if (h >= 11 && h < 15) return { emoji: "🌤️", text: "Selamat siang" };
  if (h >= 15 && h < 18) return { emoji: "🌇", text: "Selamat sore" };
  return { emoji: "🌙", text: "Selamat malam" };
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
// sapaan & jam hanya dirender SETELAH mount → bebas hydration mismatch di
// batas jam/menit antara waktu render server dan hydrate client.
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

  // mounted = false saat SSR & render-hydration pertama, lalu true setelah mount
  // → sapaan jam & jam tampilan tidak pernah bikin hydration mismatch.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const now = new Date();
  const greeting = mounted ? getGreeting(now) : { emoji: "👋", text: "Halo" };
  const spirit = SPIRITS[getDateWIB(now) % SPIRITS.length];
  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title={`${greeting.text}, ${firstName}! ${greeting.emoji}`}
        description={`${spirit} · Ringkasan toko ${user.tenant?.businessName ?? ""}${
          mounted ? ` — ${formatDateTimeLongID(now)} WIB` : ""
        }`}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Muat ulang
          </Button>
        }
      />

      {/* Chip semangat — muncul setelah data dimuat, menggambarkan kondisi hari ini */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center gap-2 -mt-2 mb-4">
          <span className="sb-fun-chip inline-flex items-center gap-1.5 rounded-full border border-primary/20 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm">
            {data?.transactionsToday
              ? `🔥 Ramai hari ini — ${data.transactionsToday} transaksi masuk!`
              : "🚀 Yuk raih transaksi pertama hari ini!"}
          </span>
          {weekTotal > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
              🏆 Seminggu terakhir: <span className="tabular font-semibold text-foreground">{formatIDR(weekTotal)}</span>
            </span>
          )}
        </div>
      )}

      {/* Shortcut cepat — ikon warna-warni, goyang playful saat dihover */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-6">
        {SHORTCUTS.map((s) => (
          <ShortcutButton key={s.label} icon={s.icon} label={s.label} onClick={() => navigate(s.path)} chip={s.chip} primary={s.primary} />
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      {/* KPI — angka count-up + ikon goyang saat kartu dihover */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Penjualan Hari Ini" value={formatIDR(animatedSales)} icon={Wallet} tone="success" loading={loading} hint={`Bulan ini: ${formatIDR(data?.salesThisMonth ?? 0)}`} wiggle />
        <StatCard label="Transaksi Hari Ini" value={String(Math.round(animatedTx))} icon={ReceiptText} loading={loading} hint={`Bulan ini: ${data?.transactionsThisMonth ?? 0}`} wiggle />
        <StatCard label="Rata-rata Transaksi" value={formatIDR(animatedAvg)} icon={ShoppingBasket} loading={loading} hint="Hari ini" wiggle />
        <StatCard label="Item Terjual" value={formatQty(Math.round(animatedItems))} icon={Package} loading={loading} hint="Produk + jasa, hari ini" wiggle />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
        {/* Grafik 7 hari */}
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">Penjualan 7 Hari Terakhir</CardTitle>
                <CardDescription>Total penjualan harian (transaksi selesai)</CardDescription>
              </div>
              {!loading && data?.salesLast7Days ? (
                <Badge variant="secondary" className="tabular shrink-0">
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-500" aria-hidden="true" />
              Stok Menipis
              {!!data?.lowStockCount && (
                <Badge variant="secondary" className="tabular">{data.lowStockCount}</Badge>
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
                    className="flex items-center justify-between gap-3 text-sm rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="truncate">{item.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 tabular",
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
              className="w-full mt-4"
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
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
                <CardDescription>6 transaksi terakhir</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate("/app/transactions")}>
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
                  <Button size="sm" onClick={() => navigate("/app/pos")}>
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
        <Card>
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
                    <Badge variant="secondary" className="shrink-0">
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

// Shortcut dashboard — setiap tujuan punya warna ikon sendiri (playful namun
// tetap dalam sistem warna Tailwind), ikon goyang saat tombol dihover.
const SHORTCUTS: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  chip: string;
  primary?: boolean;
}[] = [
  {
    icon: ScanBarcode,
    label: "Transaksi Baru",
    path: "/app/pos",
    chip: "bg-gradient-to-br from-primary to-sky-500 text-primary-foreground ring-primary/40 shadow-lg shadow-primary/25",
    primary: true,
  },
  { icon: Package, label: "Produk", path: "/app/products", chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/25" },
  { icon: Users, label: "Pelanggan", path: "/app/customers", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25" },
  { icon: ReceiptText, label: "Riwayat", path: "/app/transactions", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/25" },
  { icon: ChartColumn, label: "Laporan", path: "/app/reports", chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/25" },
]

function ShortcutButton({
  icon: Icon,
  label,
  onClick,
  chip,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  chip: string
  primary?: boolean
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      onClick={onClick}
      className="sb-wiggle h-auto py-3 flex-col gap-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]"
    >
      <span
        className={cn(
          "size-8 rounded-lg ring-1 flex items-center justify-center transition-transform",
          chip
        )}
        aria-hidden="true"
      >
        <Icon className="sb-wiggle-target size-4.5" />
      </span>
      {label}
    </Button>
  )
}
