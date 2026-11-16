// Banner shift di bagian atas POS — keadaan:
// (1) belum mulai (amber, checkout tetap diizinkan), (1b) TERKUNCI bila toko
// menyalakan "wajib shift aktif" (tint destructive + ikon TriangleAlert),
// (2) aktif → MOBILE: kartu ringkas 2-stat ala desain referensi (Shift Aktif +
//     Penjualan) dengan aksi Tutup/Riwayat; DESKTOP: strip 6 kartu KPI berikon
//     warna (Estimasi Kas ber-tint hijau).
// (3) gagal memuat (netral + coba lagi). Memuat semua dialog shift.
"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ChartColumn,
  CreditCard,
  History,
  ReceiptText,
  RotateCw,
  TriangleAlert,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatIDR, formatTimeID } from "@/lib/format";
import type { ShiftApi } from "./use-shift";
import { ShiftOpenDialog } from "./shift-open-dialog";
import { ShiftCloseDialog } from "./shift-close-dialog";
import { ShiftHistoryDialog } from "./shift-history-dialog";

export function ShiftBanner({ shift }: { shift: ShiftApi }) {
  const { user } = useApp();
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { session, live, loading, error, requireActiveShift, refetch } = shift;
  const shiftTotal = (live?.cashTotal ?? 0) + (live?.nonCashTotal ?? 0);

  return (
    <section aria-label="Status shift kasir" className="mb-3">
      {loading && !session ? (
        <Skeleton className="h-[56px] lg:h-[72px] w-full rounded-xl" />
      ) : session ? (
        /* ---------- Shift aktif ---------- */
        <div className="space-y-2.5">
          {/* Mobile: kartu ringkas 2 kolom (Shift Aktif | Penjualan) */}
          <div className="lg:hidden rounded-2xl border border-border/60 bg-card px-3.5 py-2.5 shadow-sm">
            <div className="grid grid-cols-2 divide-x divide-border/50">
              <div className="flex items-start gap-2 pr-3 min-w-0">
                <span
                  className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <CalendarClock className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground">Shift Aktif</p>
                    <span className="rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 shrink-0">
                      Aktif
                    </span>
                  </div>
                  <p className="text-base font-bold tabular leading-tight">{formatTimeID(session.openedAt)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{session.userName ?? "Kasir"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2 pl-3 min-w-0">
                <span
                  className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <ChartColumn className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Penjualan Shift Ini</p>
                  <p className="text-base font-bold tabular leading-tight">{formatIDR(shiftTotal)}</p>
                  <p className="text-[11px] text-muted-foreground tabular">{live?.transactionCount ?? 0} transaksi</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
              <p className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                Estimasi kas:{" "}
                <span className="font-semibold text-foreground tabular">{formatIDR(live?.expectedCash ?? 0)}</span>
              </p>
              <Button variant="ghost" size="sm" className="h-8 px-2.5" onClick={() => setHistoryOpen(true)}>
                <History className="size-4" aria-hidden="true" />
                <span className="sr-only">Buka riwayat shift</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCloseDialogOpen(true)}
              >
                Tutup Shift
              </Button>
            </div>
          </div>

          {/* Desktop: strip 6 kartu KPI ala referensi */}
          <div className="hidden lg:grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5" role="list" aria-label="Ringkasan shift">
            <ShiftCard
              icon={CalendarClock}
              tint="bg-primary/10 text-primary"
              label="Shift Aktif"
              value={formatTimeID(session.openedAt)}
              sub={session.userName ?? "Kasir"}
            >
              <div className="mt-1.5 flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setCloseDialogOpen(true)}
                >
                  Tutup Shift
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => setHistoryOpen(true)}>
                  <History className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Buka riwayat shift</span>
                </Button>
              </div>
            </ShiftCard>
            <ShiftCard
              icon={Wallet}
              tint="bg-amber-500/15 text-amber-600 dark:text-amber-400"
              label="Kas Awal"
              value={formatIDR(session.openingCash)}
            />
            <ShiftCard
              icon={Banknote}
              tint="bg-sky-500/15 text-sky-600 dark:text-sky-400"
              label="Penjualan Tunai"
              value={formatIDR(live?.cashTotal ?? 0)}
            />
            <ShiftCard
              icon={CreditCard}
              tint="bg-violet-500/15 text-violet-600 dark:text-violet-400"
              label="Non Tunai"
              value={formatIDR(live?.nonCashTotal ?? 0)}
            />
            <ShiftCard
              icon={ReceiptText}
              tint="bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
              label="Transaksi"
              value={String(live?.transactionCount ?? 0)}
            />
            {/* Kartu Estimasi Kas — tint hijau ala referensi */}
            <div
              role="listitem"
              className="rounded-xl border border-emerald-600/25 bg-emerald-600/[0.08] px-3 py-2.5 flex items-start gap-2.5 shadow-sm"
            >
              <span
                className="size-8 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <TrendingUp className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground truncate">Estimasi Kas</p>
                <p className="text-sm font-bold tabular text-emerald-600 dark:text-emerald-400 leading-tight truncate">
                  {formatIDR(live?.expectedCash ?? 0)}
                </p>
                <p className="text-[10.5px] text-muted-foreground truncate">kas awal + tunai shift ini</p>
              </div>
            </div>
          </div>
        </div>
      ) : error ? (
        /* ---------- Gagal memuat ---------- */
        <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/85 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="size-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0" aria-hidden="true">
            <AlertTriangle className="size-4.5" />
          </span>
          <p className="text-sm text-muted-foreground min-w-0 mr-auto">Tidak dapat memuat status shift.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCw className="size-4" />
            Coba lagi
          </Button>
        </div>
      ) : requireActiveShift ? (
        /* ---------- TERKUNCI: toko mewajibkan shift aktif ---------- */
        <div className="rounded-xl border border-destructive/45 bg-amber-500/[0.1] dark:bg-amber-500/[0.12] px-3 py-2 flex items-center gap-2.5">
          <span
            className="size-8 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <TriangleAlert className="size-4" />
          </span>
          <div className="min-w-0 mr-auto">
            <p className="text-xs font-semibold leading-tight text-destructive">
              Transaksi terkunci — mulai shift untuk menerima pembayaran
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Toko mewajibkan shift aktif: checkout ditolak hingga shift dimulai.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" className="shadow-sm" onClick={() => setOpenDialogOpen(true)}>
              <Wallet className="size-4" />
              Mulai Shift
            </Button>
            <Button variant="ghost" size="sm" className="px-1.5" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" />
              <span className="sr-only">Buka riwayat shift</span>
            </Button>
          </div>
        </div>
      ) : (
        /* ---------- Belum mulai (netral-tenang: aksen amber hanya di ikon).
            SENGAJA padat satu baris — kartu ini hanya status, jangan menyandera
            layar ponsel di atas katalog. ---------- */
        <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 flex items-center gap-2.5">
          <span
            className="size-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Wallet className="size-4" />
          </span>
          <div className="min-w-0 mr-auto">
            <p className="text-xs font-semibold leading-tight">Shift belum dimulai</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Melacak kas di laci — transaksi tetap dapat dilakukan.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" onClick={() => setOpenDialogOpen(true)}>
              <Wallet className="size-4" />
              Mulai Shift
            </Button>
            <Button variant="ghost" size="sm" className="px-1.5" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" />
              <span className="sr-only">Buka riwayat shift</span>
            </Button>
          </div>
        </div>
      )}

      <ShiftOpenDialog open={openDialogOpen} onOpenChange={setOpenDialogOpen} shift={shift} />
      <ShiftCloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        session={session}
        shift={shift}
        store={user.tenant}
      />
      <ShiftHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} store={user.tenant} />
    </section>
  );
}

/* Kartu KPI shift (desktop): ikon tint warna + label kecil + nilai tebal. */
function ShiftCard({
  icon: Icon,
  tint,
  label,
  value,
  sub,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div role="listitem" className="rounded-xl border border-border/60 bg-card px-3 py-2.5 flex items-start gap-2.5 shadow-sm">
      <span className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", tint)} aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-bold tabular leading-tight truncate">{value}</p>
        {sub && <p className="text-[10.5px] text-muted-foreground truncate">{sub}</p>}
        {children}
      </div>
    </div>
  );
}
