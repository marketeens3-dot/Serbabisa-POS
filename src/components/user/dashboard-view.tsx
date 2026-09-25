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
import type { DashboardMetricsDTO } from "@/lib/types";

export default function DashboardView() {
  const { user, navigate } = useApp();
  const { data, error, loading, refresh } = useApi<DashboardMetricsDTO>("/api/dashboard");

  const weekTotal = (data?.salesLast7Days ?? []).reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title={`Halo, ${user.fullName.split(" ")[0]} 👋`}
        description={`Ringkasan toko ${user.tenant?.businessName ?? ""} — ${formatDateTimeLongID(new Date())} WIB`}
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Muat ulang
          </Button>
        }
      />

      {/* Shortcut cepat */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mb-6">
        <ShortcutButton icon={ScanBarcode} label="Transaksi Baru" onClick={() => navigate("/app/pos")} primary />
        <ShortcutButton icon={Package} label="Produk" onClick={() => navigate("/app/products")} />
        <ShortcutButton icon={Users} label="Pelanggan" onClick={() => navigate("/app/customers")} />
        <ShortcutButton icon={ReceiptText} label="Riwayat" onClick={() => navigate("/app/transactions")} />
        <ShortcutButton icon={ChartColumn} label="Laporan" onClick={() => navigate("/app/reports")} />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Penjualan Hari Ini" value={formatIDR(data?.salesToday ?? 0)} icon={Wallet} tone="success" loading={loading} hint={`Bulan ini: ${formatIDR(data?.salesThisMonth ?? 0)}`} />
        <StatCard label="Transaksi Hari Ini" value={String(data?.transactionsToday ?? 0)} icon={ReceiptText} loading={loading} hint={`Bulan ini: ${data?.transactionsThisMonth ?? 0}`} />
        <StatCard label="Rata-rata Transaksi" value={formatIDR(data?.averageTransaction ?? 0)} icon={ShoppingBasket} loading={loading} hint="Hari ini" />
        <StatCard label="Item Terjual" value={formatQty(data?.itemsSoldToday ?? 0)} icon={Package} loading={loading} hint="Produk + jasa, hari ini" />
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
              <p className="text-sm text-muted-foreground py-8 text-center">Belum ada penjualan bulan ini.</p>
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

function ShortcutButton({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      onClick={onClick}
      className="h-auto py-3 flex-col gap-1.5 text-xs sm:text-sm font-medium rounded-xl transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <Icon className="size-5" />
      {label}
    </Button>
  )
}
