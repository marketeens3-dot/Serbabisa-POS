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
        {/* Aksi: flex-wrap TANPA shrink-0 — 5 tombol sekaligus (mis. detail
            transaksi: Cetak/Unduh/WhatsApp/Refund/Batalkan) tak boleh memaksa
            halaman melebar di ponsel; mereka pindah baris, bukan terpotong. */}
        {actions && <div className="flex flex-wrap items-center gap-2 min-w-0">{actions}</div>}
      </div>
      <div
        className="h-px bg-gradient-to-r from-border via-border/60 to-transparent"
        aria-hidden="true"
      />
    </div>
  );
}

// Tone StatCard — kartu gradien pastel ala desain (tile ikon tinted + angka besar).
const STAT_TONES: Record<
  "default" | "success" | "warning" | "danger",
  { card: string; icon: string; value?: string }
> = {
  default: {
    card: "from-slate-50 via-white to-slate-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10",
    icon: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
  },
  success: {
    card: "from-sky-50 via-white to-blue-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10",
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    value: "text-blue-700 dark:text-blue-300",
  },
  warning: {
    card: "from-amber-50 via-white to-yellow-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10",
    icon: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    value: "text-amber-600 dark:text-amber-400",
  },
  danger: {
    card: "from-rose-50 via-white to-red-100 dark:from-slate-800 dark:via-slate-800 dark:to-slate-800 dark:ring-white/10",
    icon: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
    value: "text-rose-600 dark:text-rose-400",
  },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
  wiggle,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  loading?: boolean;
  wiggle?: boolean;
}) {
  const t = STAT_TONES[tone];
  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-3xl border-0 bg-gradient-to-br ring-1 ring-inset ring-black/[0.03] transition-all duration-200 hover:-translate-y-0.5 shadow-[0_10px_30px_-18px_rgb(0_0_0/0.25)]",
        t.card,
        wiggle && "sb-wiggle"
      )}
    >
      {/* Blob dekoratif lembut di sudut kanan-bawah — murni visual */}
      <div className="pointer-events-none absolute -bottom-8 -right-8 size-24 rounded-full bg-white/50 dark:bg-white/5" aria-hidden="true" />
      <CardContent className="relative z-[1] p-4 lg:p-5">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            {/* Label boleh 2 baris di layar sempit (grid 2 kolom ponsel) —
                truncate membuat "Rata-rata transaksi" terpotong jadi "Rata-rata t…". */}
            <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 line-clamp-2 leading-snug">{label}</p>
            {loading ? (
              <Skeleton className="h-7 w-28 sm:h-8 sm:w-32 mt-2 bg-white/60 dark:bg-white/10" />
            ) : (
              <p className={cn("text-[1.65rem] lg:text-3xl font-extrabold tracking-tight mt-1.5 tabular leading-none", t.value)}>
                {value}
              </p>
            )}
            {hint && !loading && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-snug">{hint}</p>}
          </div>
          <div
            className={cn(
              "size-11 rounded-2xl grid place-items-center shrink-0 shadow-sm transition-transform",
              t.icon
            )}
            aria-hidden="true"
          >
            <Icon className={cn("size-5", wiggle && "sb-wiggle-target")} />
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
  emoji = "🫧",
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  /** Emoji kecil di pojok ikon — sentuhan fun saat data masih kosong. */
  emoji?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-3xl border border-dashed bg-muted/20">
      <div className="relative" aria-hidden="true">
        <div
          className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-4"
        >
          <Icon className="size-6 text-primary" />
        </div>
        <span
          className="sb-float absolute -top-2 -right-3 text-base leading-none drop-shadow-sm"
        >
          {emoji}
        </span>
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
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-3xl border border-destructive/25 bg-destructive/5">
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
  // Mode gelap: soft tint agar selaras badge status lain (light tetap solid destructive).
  return (
    <Badge
      variant="destructive"
      className="dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/25 dark:hover:bg-red-500/15 dark:shadow-none"
    >
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
    // Mode gelap: soft tint (light tetap solid destructive).
    return (
      <Badge
        variant="destructive"
        className="dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/25 dark:hover:bg-red-500/15 dark:shadow-none"
      >
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
// Top 3: medali 🥇🥈🥉 — playful namun tetap terbaca; sisanya angka polos.
const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const RANK_TONES: Record<number, string> = {
  1: "bg-amber-500/20 border border-amber-500/40",
  2: "bg-muted border border-muted-foreground/25",
  3: "bg-orange-700/15 border border-orange-700/30",
};

export function RankBadge({ rank }: { rank: number }) {
  const medal = RANK_MEDALS[rank];
  if (medal) {
    return (
      <span
        className={cn(
          "size-6 rounded-md flex items-center justify-center text-xs shrink-0 transition-transform hover:scale-125",
          RANK_TONES[rank]
        )}
        aria-label={`Peringkat ${rank}`}
        title={rank === 1 ? "Juaranya!" : `Peringkat ${rank}`}
      >
        {medal}
      </span>
    );
  }
  return (
    <span
      className="size-6 rounded-md bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold tabular shrink-0"
      aria-hidden="true"
    >
      {rank}
    </span>
  );
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

/* ============================================================
   DesignStatCard — kartu statistik ala desain referensi:
   gradien pastel rounded-3xl, tile emoji 3D, angka sangat besar,
   sparkle ✦, blob dekoratif di sudut, dan chip kecil di bawah
   (mis. "+12% dari kemarin") atau chip pojok kanan-atas.
   Ringan: murni CSS + emoji, tanpa aset/gambar.
   ============================================================ */
export function DesignStatCard({
  emoji,
  tileClass,
  cardClass,
  ornamentClass,
  label,
  value,
  valueClass,
  chip,
  cornerChip,
  cornerEmoji,
  loading,
  labelBelow,
}: {
  /** Emoji ikon 3D-look di dalam tile (mis. 🛍️ 🧾 🧮 📦). */
  emoji: string
  /** Kelas latar tile emoji (mis. "bg-blue-100/80"). */
  tileClass?: string
  /** Kelas gradien kartu (mis. "from-sky-50 to-blue-100"). */
  cardClass?: string
  /** Kelas blob aksen di pojok kanan-bawah (mis. "bg-sky-200/55") —
      hanya tampil di mode light agar ornamen terlihat jelas. */
  ornamentClass?: string
  label: string
  value: string
  /** Kelas warna angka (mis. "text-orange-500"). */
  valueClass?: string
  /** Chip kecil di bawah angka — ReactNode (mis. trend chip). */
  chip?: React.ReactNode
  /** Chip kecil di pojok kanan-atas kartu (mis. "+12%"). */
  cornerChip?: React.ReactNode
  /** Emoji dekoratif besar di pojok kanan-bawah (mis. ✅ 🏷️). */
  cornerEmoji?: string
  loading?: boolean
  /** true = label di bawah tile (ala desain Laporan); false = label
      di samping tile (ala desain Dashboard). */
  labelBelow?: boolean
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 sm:p-5 ring-1 ring-inset ring-black/[0.03] shadow-[0_10px_30px_-18px_rgb(0_0_0/0.25)] transition-transform duration-200 hover:-translate-y-0.5",
        cardClass
      )}
    >
      {/* Blob dekoratif lembut di sudut kanan-bawah — murni visual.
          Light: diperkuat (white/45 & /30 di atas gradien pastel terang nyaris tak terlihat).
          Dark: nilai dark: eksplisit menjaga tampilan dark persis seperti sebelumnya. */}
      <div className="pointer-events-none absolute -bottom-8 -right-8 size-24 sm:size-28 rounded-full bg-white/70 dark:bg-white/45" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-12 right-14 size-20 rounded-full bg-white/50 dark:bg-white/30" aria-hidden="true" />
      {ornamentClass && (
        <div className={cn("pointer-events-none absolute -bottom-6 -right-6 size-20 sm:size-24 rounded-full dark:hidden", ornamentClass)} aria-hidden="true" />
      )}

      {cornerChip && (
        <div className="absolute top-3 right-3 z-10">{cornerChip}</div>
      )}
      {cornerEmoji && (
        <span className="pointer-events-none absolute bottom-2.5 right-3 text-2xl sm:text-3xl leading-none select-none opacity-90" aria-hidden="true">
          {cornerEmoji}
        </span>
      )}

      <div className="relative z-[1]">
        {labelBelow ? (
          /* Varian Laporan (desain 2): tile di atas, label & angka di bawah —
             memberi ruang penuh untuk chip pojok kanan-atas. */
          <>
            <span
              className={cn(
                "size-13 shrink-0 rounded-2xl grid place-items-center text-2xl sm:text-3xl leading-none shadow-sm",
                tileClass
              )}
              aria-hidden="true"
            >
              {emoji}
            </span>
            <p className="mt-3 text-sm sm:text-base font-bold leading-snug text-slate-700 dark:text-slate-200 whitespace-pre-line min-w-0">
              {label}
              <span className="text-amber-400 ml-1 select-none" aria-hidden="true">✦</span>
            </p>
          </>
        ) : (
          /* Varian Dashboard (desain 1): label di samping tile. */
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "size-13 shrink-0 rounded-2xl grid place-items-center text-2xl sm:text-3xl leading-none shadow-sm",
                tileClass
              )}
              aria-hidden="true"
            >
              {emoji}
            </span>
            <p className="text-sm sm:text-base font-bold leading-snug text-slate-700 dark:text-slate-200 whitespace-pre-line flex-1 min-w-0">
              {label}
              <span className="text-amber-400 ml-1 select-none" aria-hidden="true">✦</span>
            </p>
          </div>
        )}

        {loading ? (
          <Skeleton className={cn("h-9 w-28 mt-3 bg-white/60 dark:bg-white/10", cornerEmoji && "mr-10")} />
        ) : (
          <p className={cn("text-[2rem] sm:text-4xl font-extrabold tracking-tight mt-2.5 tabular leading-none", cornerEmoji && "mr-9 sm:mr-12", valueClass)}>
            {value}
          </p>
        )}

        {chip && !loading && (
          <div className={cn("mt-2.5 flex items-center gap-1.5 min-w-0", cornerEmoji && "pr-10")}>{chip}</div>
        )}
      </div>
    </div>
  )
}

/* Chip tren kecil ala desain: ikon bundar + teks "x% dari kemarin". */
export function TrendChip({
  icon,
  children,
  className,
}: {
  /** Emoji kecil di dalam lingkaran putih (mis. 📈 📊 🧾). */
  icon: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 min-w-0", className)}>
      <span className="size-5 shrink-0 rounded-full bg-white/80 dark:bg-white/15 grid place-items-center text-[10px] leading-none shadow-sm" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-300 tabular truncate">{children}</span>
    </span>
  )
}
