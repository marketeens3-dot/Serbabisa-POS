// Dashboard Super Admin: statistik agregat global (tanpa membaca transaksi mentah tenant), 7 hari, aktivitas.
"use client";

import { Activity, Building2, Database, RefreshCw, Store, Users, Wallet, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniBarChart } from "@/components/app/mini-bar-chart";
import { ErrorState, PageHeader, StatCard, UserStatusBadge } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import type { AdminDashboardDTO } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: "Berhasil masuk",
  LOGIN_FAILED: "Gagal masuk",
  LOGOUT: "Keluar",
  USER_CREATED: "User dibuat",
  USER_UPDATED: "User diubah",
  USER_ACTIVATED: "User diaktifkan",
  USER_DEACTIVATED: "User dinonaktifkan",
  ACCESS_RESET: "Akses di-reset",
  TENANT_CREATED: "Toko dibuat",
  TENANT_UPDATED: "Toko diubah",
  TENANT_ACTIVATED: "Toko diaktifkan",
  TENANT_DEACTIVATED: "Toko dinonaktifkan",
  TRANSACTION_CREATED: "Transaksi dibuat",
  TRANSACTION_VOIDED: "Transaksi dibatalkan",
  STORE_SETTINGS_UPDATED: "Pengaturan toko",
  STORE_LOGO_UPDATED: "Logo toko",
  PROFILE_UPDATED: "Profil diubah",
  PASSWORD_CHANGED: "Password diganti",
  PRODUCT_CREATED: "Produk dibuat",
  SERVICE_CREATED: "Jasa dibuat",
  CUSTOMER_CREATED: "Pelanggan dibuat",
  WHATSAPP_MESSAGE_GENERATED: "Pesan WhatsApp",
  CSV_EXPORTED: "Ekspor CSV",
  EXPORT_XLSX: "Ekspor Excel",
  EXPORT_PDF: "Ekspor PDF",
  ROLE_CHANGE_ATTEMPT: "Percobaan akses role",
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

export default function AdminDashboardView() {
  const { data, error, loading, refresh } = useApi<AdminDashboardDTO>("/api/admin/dashboard")

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        title="Dashboard Admin"
        description="Ringkasan agregat seluruh sistem Serbabisa."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="active:scale-[0.98]">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            Muat ulang
          </Button>
        }
      />

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Total User" value={String(data?.totalUsers ?? 0)} icon={Users} loading={loading} hint={`${data?.activeUsers ?? 0} aktif · ${data?.inactiveUsers ?? 0} nonaktif`} />
        <StatCard label="Total Toko" value={String(data?.totalTenants ?? 0)} icon={Store} loading={loading} hint={`${data?.activeTenants ?? 0} aktif`} />
        <StatCard label="Transaksi Hari Ini" value={String(data?.transactionsToday ?? 0)} icon={Activity} loading={loading} hint={`Bulan ini: ${data?.transactionsThisMonth ?? 0}`} />
        <StatCard label="Penjualan Hari Ini" value={formatIDR(data?.salesToday ?? 0)} icon={Wallet} tone="success" loading={loading} hint={`Bulan ini: ${formatIDR(data?.salesThisMonth ?? 0)}`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 lg:gap-5 mt-5">
        <Card className="lg:col-span-2 min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Transaksi 7 Hari Terakhir</CardTitle>
            <CardDescription>Seluruh tenant — data agregat</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40 w-full" /> : <MiniBarChart data={data?.transactionsLast7Days ?? []} />}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="size-4 text-primary" aria-hidden="true" />
              Status Sistem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm">
              <span className="flex items-center gap-2"><Database className="size-4 text-muted-foreground" /> Database</span>
              <Badge className="bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-600/25 hover:bg-emerald-600/10 gap-1.5">
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                OK
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm">
              <span className="flex items-center gap-2"><Activity className="size-4 text-muted-foreground" /> Sesi aktif</span>
              <span className="tabular font-semibold">{data?.health.activeSessions ?? 0}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Statistik agregat disajikan tanpa membuka data transaksi mentah tenant.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 lg:gap-5 mt-5">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">User Terbaru</CardTitle>
                <CardDescription>5 pendaftar terakhir</CardDescription>
              </div>
              <a href="#/admin/users" className="text-sm text-primary font-medium hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Semua user</a>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
            ) : !data?.recentUsers?.length ? (
              <CardEmpty icon={Users} text="Belum ada user terdaftar." />
            ) : (
              <ul className="divide-y">
                {data.recentUsers.map((u) => (
                  <li key={u.id}>
                    <a href={`#/admin/users/${u.id}`} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/40 transition-colors focus-visible:outline-2 focus-visible:outline-ring">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0" aria-hidden="true">
                        {u.fullName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email} · {u.tenant?.businessName ?? "—"}</p>
                      </div>
                      <UserStatusBadge status={u.status} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Aktivitas Terbaru</CardTitle>
                <CardDescription>8 audit event terakhir</CardDescription>
              </div>
              <a href="#/admin/audit" className="text-sm text-primary font-medium hover:underline rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Audit log</a>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
            ) : !data?.recentAuditEvents?.length ? (
              <CardEmpty icon={Activity} text="Belum ada aktivitas." />
            ) : (
              <ul className="divide-y">
                {data.recentAuditEvents.map((ev) => (
                  <li key={ev.id}>
                    <a
                      href="#/admin/audit"
                      className="flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/40 transition-colors text-sm focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{ev.actorName ?? "Sistem"}</span>
                          <span className="text-muted-foreground"> — {actionLabel(ev.action)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{formatDateTimeID(ev.createdAt)}</p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Empty state ringkas di dalam kartu — ikon lingkaran gradient ring (pola EmptyState shared, versi kompak).
function CardEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      <div
        className="size-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-3"
        aria-hidden="true"
      >
        <Icon className="size-5 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
