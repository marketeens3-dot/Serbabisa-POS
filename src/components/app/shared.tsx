"use client";

// Komponen UI bersama: header halaman, stat card, empty/error state, badge status,
// pagination, chart batang ringan (tanpa library berat).

import { ChevronLeft, ChevronRight, Inbox, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/format";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      <div
        className="h-px bg-gradient-to-r from-border via-border/60 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

// Tone StatCard — aksen gradien atas + ikon tinted + warna nilai.
const STAT_TONES: Record<
  "default" | "success" | "warning" | "danger",
  { bar: string; icon: string; value?: string }
> = {
  default: {
    bar: "from-muted-foreground/35 via-muted-foreground/10 to-transparent",
    icon: "bg-muted text-muted-foreground ring-border",
  },
  success: {
    bar: "from-primary/70 via-primary/25 to-transparent",
    icon: "bg-primary/10 text-primary ring-primary/15",
    value: "text-primary",
  },
  warning: {
    bar: "from-amber-500/70 via-amber-500/25 to-transparent",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    value: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    bar: "from-destructive/70 via-destructive/25 to-transparent",
    icon: "bg-destructive/10 text-destructive ring-destructive/20",
    value: "text-destructive",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
}) {
  const t = STAT_TONES[tone];
  return (
    <Card className="overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <div className={cn("h-[3px] bg-gradient-to-r motion-safe:transition-all", t.bar)} aria-hidden="true" />
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            {/* Label boleh 2 baris di layar sempit (grid 2 kolom ponsel) —
                truncate membuat "Rata-rata transaksi" terpotong jadi "Rata-rata t…". */}
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-snug">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-28 sm:h-8 sm:w-32 mt-2" />
            ) : (
              <p className={cn("text-xl lg:text-2xl font-bold tracking-tight mt-1.5 tabular", t.value)}>
                {value}
              </p>
            )}
            {hint && !loading && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-snug">{hint}</p>}
          </div>
          <div
            className={cn(
              "size-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset",
              t.icon
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed bg-muted/20">
      <div
        className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        <Icon className="size-6 text-primary" />
      </div>
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  icon: Icon = TriangleAlert,
}: {
  message: string;
  onRetry?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-destructive/25 bg-destructive/5">
      <div
        className="size-14 rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5 ring-1 ring-destructive/10 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        <Icon className="size-6 text-destructive" />
      </div>
      <p className="text-base font-semibold text-destructive">Gagal memuat data</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5 active:scale-[0.98]" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

// Dot indikator kecil di dalam badge status.
function BadgeDot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full bg-current opacity-80", className)} aria-hidden="true" />;
}

export function TransactionStatusBadge({ status }: { status: string }) {
  if (status === "COMPLETED")
    return (
      <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20">
        <BadgeDot />
        Selesai
      </Badge>
    );
  if (status === "REFUNDED")
    return (
      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10 border border-amber-500/25">
        <BadgeDot />
        Direfund
      </Badge>
    );
  return (
    <Badge variant="destructive">
      <BadgeDot />
      Dibatalkan
    </Badge>
  );
}

export function UserStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE")
    return (
      <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border border-primary/20">
        <BadgeDot />
        Aktif
      </Badge>
    );
  if (status === "SUSPENDED")
    return (
      <Badge variant="destructive">
        <BadgeDot />
        Ditangguhkan
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <BadgeDot />
      Nonaktif
    </Badge>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
  OTHER: "Lainnya",
}

// Tint per metode pembayaran — konsisten dengan bar laporan (emerald/primary/amber/muted).
const PAYMENT_TONES: Record<string, string> = {
  CASH: "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  QRIS: "border-primary/25 bg-primary/10 text-primary",
  TRANSFER: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  OTHER: "border-border bg-muted text-muted-foreground",
}

export function PaymentMethodBadge({ method }: { method: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", PAYMENT_TONES[method] ?? PAYMENT_TONES.OTHER)}>
      <BadgeDot />
      {PAYMENT_LABELS[method] ?? method}
    </Badge>
  )
}

// Badge peringkat untuk daftar item terlaris (dashboard & laporan).
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        className="size-6 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs font-bold tabular shrink-0"
        aria-label="Peringkat 1"
      >
        {rank}
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span
        className="size-6 rounded-md bg-muted border border-muted-foreground/25 text-muted-foreground flex items-center justify-center text-xs font-bold tabular shrink-0"
        aria-label="Peringkat 2"
      >
        {rank}
      </span>
    )
  }
  if (rank === 3) {
    return (
      <span
        className="size-6 rounded-md bg-orange-700/15 border border-orange-700/30 text-orange-700 dark:text-orange-400 flex items-center justify-center text-xs font-bold tabular shrink-0"
        aria-label="Peringkat 3"
      >
        {rank}
      </span>
    )
  }
  return (
    <span
      className="size-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold tabular shrink-0"
      aria-hidden="true"
    >
      {rank}
    </span>
  )
}

export function MoneyCell({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn("tabular", className)}>{formatIDR(amount)}</span>
}

export function PaginationControls({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
      <p className="text-sm text-muted-foreground">
        Halaman <span className="font-medium text-foreground tabular">{page}</span> dari{" "}
        <span className="font-medium text-foreground tabular">{totalPages}</span>
        {total !== undefined && <> · {total} data</>}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="active:scale-[0.98]"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="active:scale-[0.98]"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <span className="hidden sm:inline">Berikutnya</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}

export function LoadingGrid({ cards = 8 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true" aria-label="Memuat data">
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  )
}
