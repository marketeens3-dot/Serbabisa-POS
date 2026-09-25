// Dialog riwayat pergerakan stok satu item (paginated): penjualan, return batal/refund,
// dan penyesuaian (qty bertanda + masuk / − keluar).
"use client";

import { useState } from "react";
import { History, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { formatDateTimeID, formatQty } from "@/lib/format";
import type { CatalogItemDTO, InventoryMovementDTO } from "@/lib/types";

type MovementsResponse = {
  item: { id: string; name: string };
  data: InventoryMovementDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const MOVEMENT_LABELS: Record<string, string> = {
  SALE: "Penjualan",
  VOID_RETURN: "Batal transaksi",
  REFUND_RETURN: "Refund",
  ADJUSTMENT: "Penyesuaian",
};

const TONE_EMERALD = "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400";
const TONE_AMBER = "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400";
const TONE_PRIMARY = "border-primary/25 bg-primary/10 text-primary";
const TONE_RED = "border-destructive/25 bg-destructive/10 text-destructive";
const TONE_MUTED = "border-border bg-muted text-muted-foreground";

function movementTone(m: InventoryMovementDTO): string {
  if (m.movementType === "ADJUSTMENT") {
    if (m.quantity > 0) return TONE_EMERALD;
    if (m.quantity < 0) return TONE_RED;
    return TONE_MUTED;
  }
  if (m.movementType === "SALE") return TONE_PRIMARY;
  if (m.movementType === "VOID_RETURN") return TONE_EMERALD;
  if (m.movementType === "REFUND_RETURN") return TONE_AMBER;
  return TONE_MUTED;
}

/** Tanda arah stok: penjualan = keluar (−), return = masuk (+), penyesuaian bertanda. */
function movementQty(m: InventoryMovementDTO, unit: string): { text: string; cls: string } {
  const label = unit ? ` ${unit}` : "";
  if (m.movementType === "ADJUSTMENT") {
    const q = Math.round(m.quantity * 1000) / 1000;
    if (q > 0) return { text: `+${formatQty(q)}${label}`, cls: "text-emerald-600 dark:text-emerald-400" };
    if (q < 0) return { text: `−${formatQty(Math.abs(q))}${label}`, cls: "text-red-600 dark:text-red-400" };
    return { text: `0${label}`, cls: "text-muted-foreground" };
  }
  if (m.movementType === "SALE")
    return { text: `−${formatQty(m.quantity)}${label}`, cls: "text-red-600 dark:text-red-400" };
  return { text: `+${formatQty(m.quantity)}${label}`, cls: "text-emerald-600 dark:text-emerald-400" };
}

export function MovementHistoryDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: CatalogItemDTO | null;
}) {
  const [page, setPage] = useState(1);

  // Reset halaman saat dialog dibuka (pola adjust-state saat render).
  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setPage(1);
  }

  const list = useApi<MovementsResponse>(
    open && item ? `/api/catalog/${item.id}/movements?page=${page}&pageSize=10` : null
  );
  const rows = list.data?.data ?? [];
  const unit = item?.unit ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" aria-hidden="true" />
            Riwayat Stok
          </DialogTitle>
          <DialogDescription>
            Pergerakan stok{item ? ` "${item.name}"` : ""} — tanda minus berarti stok keluar, plus
            berarti stok masuk.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1" aria-label="Daftar pergerakan stok">
          {list.loading && !rows.length ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Memuat riwayat stok">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[76px] rounded-lg" />
              ))}
            </div>
          ) : list.error ? (
            <div className="text-center py-10">
              <p className="text-sm text-destructive" role="alert">
                {list.error}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refresh()}>
                <RotateCw className="size-4" />
                Coba lagi
              </Button>
            </div>
          ) : !rows.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <History className="size-7 text-muted-foreground/50 mb-2.5" aria-hidden="true" />
              <p className="text-sm font-medium text-muted-foreground">Belum ada pergerakan stok</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                Pergerakan tercatat otomatis saat ada penjualan, refund, pembatalan, atau penyesuaian
                stok.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((m) => {
                const qty = movementQty(m, unit);
                return (
                  <li key={m.id}>
                    <div className="rounded-lg border bg-card p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] px-1.5", movementTone(m))}
                            >
                              {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                            </Badge>
                            {m.invoiceNumber && m.transactionId && (
                              <a
                                href={`#/app/transactions/${m.transactionId}`}
                                className="text-xs font-medium tabular text-primary hover:underline"
                              >
                                {m.invoiceNumber}
                              </a>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground tabular mt-1.5">
                            {formatDateTimeID(m.createdAt)}
                          </p>
                        </div>
                        <p className={cn("text-sm font-bold tabular shrink-0", qty.cls)}>{qty.text}</p>
                      </div>
                      {m.note && (
                        <p className="text-xs text-muted-foreground mt-2 break-words line-clamp-2" title={m.note}>
                          {m.note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!list.loading && !!rows.length && list.data && (
          <PaginationControls
            page={list.data.page}
            totalPages={list.data.totalPages}
            total={list.data.total}
            onPage={setPage}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
