// Banner shift di bagian atas POS — keadaan:
// (1) belum mulai (amber, checkout tetap diizinkan), (1b) TERKUNCI bila toko
// menyalakan "wajib shift aktif" (tint destructive + ikon TriangleAlert),
// (2) aktif (emerald + chip statistik live), (3) gagal memuat (netral + coba
// lagi). Memuat semua dialog shift: mulai, tutup, dan riwayat.
"use client";

import { useState } from "react";
import { AlertTriangle, History, RotateCw, TriangleAlert, Wallet } from "lucide-react";
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

  return (
    <section aria-label="Status shift kasir" className="mb-4">
      {loading && !session ? (
        <Skeleton className="h-[72px] sm:h-[60px] w-full rounded-xl" />
      ) : session ? (
        /* ---------- Shift aktif ---------- */
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/[0.07] dark:bg-emerald-500/[0.09] px-3.5 sm:px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className="size-9 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Wallet className="size-4.5" />
            </span>
            <div className="min-w-0 mr-auto">
              <p className="text-sm font-semibold leading-tight flex items-center gap-2">
                <span
                  className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">
                  Shift aktif sejak {formatTimeID(session.openedAt)}
                  <span className="text-muted-foreground font-normal"> · {session.userName ?? "Kasir"}</span>
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Estimasi kas = kas awal + penjualan tunai shift ini.
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setCloseDialogOpen(true)}
              >
                Tutup Shift
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
                <History className="size-4" />
                <span className="hidden sm:inline">Riwayat</span>
                <span className="sr-only">Buka riwayat shift</span>
              </Button>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-3 md:grid-cols-5 gap-2">
            <Stat label="Kas Awal" value={formatIDR(session.openingCash)} />
            <Stat label="Penjualan Tunai" value={formatIDR(live?.cashTotal ?? 0)} />
            <Stat label="Non-Tunai" value={formatIDR(live?.nonCashTotal ?? 0)} />
            <Stat label="Transaksi" value={String(live?.transactionCount ?? 0)} />
            <Stat label="Estimasi Kas" value={formatIDR(live?.expectedCash ?? 0)} highlight />
          </dl>
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
        <div className="rounded-xl border border-destructive/45 bg-amber-500/[0.1] dark:bg-amber-500/[0.12] px-3.5 sm:px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="size-9 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <TriangleAlert className="size-4.5" />
          </span>
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-semibold leading-tight text-destructive">
              Transaksi terkunci — mulai shift untuk menerima pembayaran
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Toko ini mewajibkan shift aktif: checkout baru ditolak hingga shift dimulai.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" className="shadow-sm" onClick={() => setOpenDialogOpen(true)}>
              <Wallet className="size-4" />
              Mulai Shift
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" />
              <span className="hidden sm:inline">Riwayat</span>
              <span className="sr-only">Buka riwayat shift</span>
            </Button>
          </div>
        </div>
      ) : (
        /* ---------- Belum mulai (netral-tenang: aksen amber hanya di ikon) ---------- */
        <div className="rounded-xl border border-border/70 bg-muted/40 px-3.5 sm:px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            className="size-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Wallet className="size-4.5" />
          </span>
          <div className="min-w-0 mr-auto">
            <p className="text-sm font-semibold leading-tight">Shift belum dimulai</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mulai shift untuk melacak kas di laci — transaksi tetap dapat dilakukan.
            </p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" onClick={() => setOpenDialogOpen(true)}>
              <Wallet className="size-4" />
              Mulai Shift
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" />
              <span className="hidden sm:inline">Riwayat</span>
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

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-1.5 min-w-0",
        highlight
          ? "bg-emerald-600/[0.08] border-emerald-600/25"
          : "bg-background/80"
      )}
    >
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{label}</dt>
      <dd
        className={cn(
          "text-xs font-bold tabular mt-0.5 truncate",
          highlight && "text-emerald-600 dark:text-emerald-400"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
