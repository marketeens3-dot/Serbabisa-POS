// Parkir keranjang (hold/resume): snapshot keranjang disimpan di localStorage
// per tenant. Saat diambil, item dipetakan ulang ke katalog aktif terbaru —
// item yang sudah tidak ada dibuang dengan peringatan (stok tetap divalidasi
// server saat checkout). UI: tombol "Tahan", daftar "Diambil" (Popover desktop
// / Sheet mobile), dialog label + konfirmasi ganti/hapus.
"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, PauseCircle, Play, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatIDR } from "@/lib/format";

export type ParkedCartLine = {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  unit: string;
  type: string;
};

export type ParkedCart = {
  id: string;
  label: string;
  lines: ParkedCartLine[];
  customerId: string | null;
  discount: number;
  /** Persen diskon saat diparkir (0 = mode Rp). Parkir lama tanpa field ini = mode Rp. */
  discountPct?: number;
  parkedAt: string; // ISO
};

/** Event sinkronisasi antar instance panel (desktop/mobile) dalam satu tab. */
const PARKED_EVENT = "sb-parked-carts-changed";

function storageKey(tenantId: string) {
  return `sb_parked_carts_v1_${tenantId}`;
}

function isParkedCart(value: unknown): value is ParkedCart {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.label === "string" &&
    Array.isArray(c.lines) &&
    typeof c.parkedAt === "string"
  );
}

/** Baca daftar parkir — data korup/quota aman: kembalikan [] (kasir tidak crash). */
export function loadParkedCarts(tenantId: string): ParkedCart[] {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isParkedCart);
  } catch {
    return [];
  }
}

/** Simpan + umumkan perubahan. Mengembalikan false bila penyimpanan gagal. */
export function saveParkedCarts(tenantId: string, carts: ParkedCart[]): boolean {
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(carts));
    window.dispatchEvent(new Event(PARKED_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** Tambah satu keranjang tertahan (baca storage terbaru → hindari race antar panel). */
export function appendParkedCart(tenantId: string, cart: ParkedCart): boolean {
  return saveParkedCarts(tenantId, [...loadParkedCarts(tenantId), cart]);
}

/** Hapus satu keranjang tertahan berdasarkan id. */
export function removeParkedCart(tenantId: string, id: string): boolean {
  return saveParkedCarts(tenantId, loadParkedCarts(tenantId).filter((c) => c.id !== id));
}

export function parkedCartTotal(pc: ParkedCart): number {
  return pc.lines.reduce((sum, l) => sum + Math.round(l.qty * l.unitPrice), 0);
}

/** Waktu relatif singkat: "baru saja", "2 mnt lalu", "3 jam lalu". */
export function timeAgoID(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

/** State daftar parkir + sinkron (event antar panel, focus tab, storage antar tab). */
export function useParkedCarts(tenantId: string | null) {
  const [carts, setCarts] = useState<ParkedCart[]>([]);

  const refresh = useCallback(() => {
    if (!tenantId) {
      setCarts([]);
      return;
    }
    setCarts(loadParkedCarts(tenantId));
  }, [tenantId]);

  useEffect(() => {
    // Baca storage setelah mount (defer — hindari setState sinkron di body effect).
    const timer = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener(PARKED_EVENT, handler);
    window.addEventListener("focus", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(PARKED_EVENT, handler);
      window.removeEventListener("focus", handler);
      window.removeEventListener("storage", handler);
    };
  }, [refresh]);

  return { carts, refresh };
}

/* ============================== KONTROL DI PANEL ============================== */

export function ParkedCartsControls({
  carts,
  cartEmpty,
  onPark,
  onResume,
  onDelete,
}: {
  carts: ParkedCart[];
  cartEmpty: boolean;
  onPark: () => void;
  onResume: (pc: ParkedCart) => void;
  onDelete: (pc: ParkedCart) => void;
}) {
  const isMobile = useIsMobile();
  const [listOpen, setListOpen] = useState(false);

  function requestResume(pc: ParkedCart) {
    setListOpen(false);
    onResume(pc);
  }

  function requestDelete(pc: ParkedCart) {
    setListOpen(false);
    onDelete(pc);
  }

  const listBody = (
    <div className="space-y-2">
      {!carts.length ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <div
            className="size-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-3"
            aria-hidden="true"
          >
            <PauseCircle className="size-5 text-primary" />
          </div>
          <p className="text-sm font-semibold">Belum ada keranjang ditahan</p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px]">
            Tekan "Tahan" atau F4 untuk memarkir keranjang aktif.
          </p>
        </div>
      ) : (
        carts.map((pc) => (
          <div key={pc.id} className="rounded-lg border bg-background p-2.5 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{pc.label}</p>
              <p className="text-xs text-muted-foreground tabular mt-0.5">
                {pc.lines.length} item · {formatIDR(parkedCartTotal(pc))} · {timeAgoID(pc.parkedAt)}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2 gap-1 shrink-0 text-emerald-600 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-600/10 active:scale-[0.97]"
              onClick={() => requestResume(pc)}
            >
              <Play className="size-3.5" />
              Lanjutkan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="size-9 p-0 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 active:scale-[0.97]"
              onClick={() => requestDelete(pc)}
              aria-label={`Hapus keranjang tertahan ${pc.label}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* Tahan keranjang aktif */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-2.5"
            disabled={cartEmpty}
            onClick={onPark}
            aria-label="Parkir keranjang (F4)"
          >
            <Pause className="size-4" />
            <span className="hidden sm:inline">Tahan</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Parkir keranjang (F4)</TooltipContent>
      </Tooltip>

      {/* Daftar keranjang ditahan */}
      {isMobile ? (
        <Sheet open={listOpen} onOpenChange={setListOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="relative size-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={`Keranjang ditahan (${carts.length})`}
            >
              <PauseCircle className="size-4.5" />
              {carts.length > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular">
                  {carts.length}
                </span>
              )}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Keranjang Ditahan</SheetTitle>
              <SheetDescription>Ambil kembali keranjang untuk melanjutkan transaksinya.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6 pt-2">{listBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={listOpen} onOpenChange={setListOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative size-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={`Keranjang ditahan (${carts.length})`}
            >
              <PauseCircle className="size-4.5" />
              {carts.length > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center tabular">
                  {carts.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <p className="text-sm font-semibold mb-2 px-0.5">Keranjang Ditahan</p>
            <div className="max-h-80 overflow-y-auto">{listBody}</div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/* ================================ DIALOG ==================================== */

/** Dialog label opsional saat memarkir keranjang. */
export function ParkCartDialog({
  open,
  onOpenChange,
  defaultLabel,
  itemCount,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultLabel: string;
  itemCount: number;
  onSubmit: (label: string) => void;
}) {
  const [label, setLabel] = useState("");

  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setLabel("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="size-5 text-primary" />
            Parkir Keranjang
          </DialogTitle>
          <DialogDescription>
            {itemCount} item akan ditahan dan keranjang dikosongkan. Ambil kembali kapan saja dari daftar keranjang ditahan.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(label.trim() || defaultLabel);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="park-label">Label (opsional)</Label>
            <Input
              id="park-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={defaultLabel}
              maxLength={40}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Contoh: "Meja 4", "Pak Budi". Kosongkan untuk memakai label otomatis.
            </p>
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit">Tahan Keranjang</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Konfirmasi saat mengambil keranjang sementara keranjang aktif masih terisi. */
export function ResumeConfirmDialog({
  target,
  onOpenChange,
  onChoose,
}: {
  target: ParkedCart | null;
  onOpenChange: () => void;
  onChoose: (parkCurrentFirst: boolean) => void;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onOpenChange()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ganti keranjang saat ini?</AlertDialogTitle>
          <AlertDialogDescription>
            Keranjang saat ini masih berisi item. Mengambil kembali "{target?.label}" akan mengganti isinya.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onOpenChange}>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="sm:ml-0 border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => onChoose(true)}
          >
            Parkirkan &amp; Ganti
          </AlertDialogAction>
          <AlertDialogAction onClick={() => onChoose(false)}>Ganti</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Konfirmasi hapus keranjang tertahan. */
export function DeleteParkedDialog({
  target,
  onOpenChange,
  onConfirm,
}: {
  target: ParkedCart | null;
  onOpenChange: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!target} onOpenChange={(v) => !v && onOpenChange()}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus keranjang tertahan?</AlertDialogTitle>
          <AlertDialogDescription>
            Keranjang "{target?.label}" ({target?.lines.length ?? 0} item) akan dihapus permanen dan tidak bisa diambil kembali.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Hapus
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
