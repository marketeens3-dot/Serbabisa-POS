// Dialog input jumlah untuk kartu produk POS — dibuka lewat tekan-tahan
// (long-press) pada kartu katalog. Kasir sering menjual >1 unit item yang sama;
// tekan-tahan → ketik jumlah → sekali konfirmasi lebih cepat daripada mengetuk
// kartu berulang kali. Stepper besar + chip cepat agar nyaman di ponsel/tablet.
"use client";

import { useState } from "react";
import { Minus, Package, Plus, Wrench } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatIDR, formatQty } from "@/lib/format";
import type { CatalogItemDTO } from "@/lib/types";

const QUICK_QTY = [2, 3, 5, 10, 20]

export function QtyDialog({
  item,
  onOpenChange,
  onConfirm,
}: {
  item: CatalogItemDTO | null
  onOpenChange: (v: boolean) => void
  onConfirm: (item: CatalogItemDTO, qty: number) => void
}) {
  const [qtyInput, setQtyInput] = useState("1")

  // Reset saat dialog dibuka — pola adjust-state saat render (tanpa effect).
  const [prevOpen, setPrevOpen] = useState(false)
  const open = !!item
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) setQtyInput("1")
  }

  const qty = Math.round((Number(qtyInput.replace(/[^0-9.]/g, "").replace(",", ".")) || 0) * 1000) / 1000
  const max = item?.type === "PRODUCT" ? item.stockQty : Infinity
  const overStock = item?.type === "PRODUCT" && qty > max
  const valid = qty > 0 && !overStock

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 min-w-0">
            <span
              className={cn(
                "size-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset",
                item?.type === "PRODUCT"
                  ? "bg-primary/10 text-primary ring-primary/15"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20"
              )}
              aria-hidden="true"
            >
              {item?.type === "PRODUCT" ? <Package className="size-4.5" /> : <Wrench className="size-4.5" />}
            </span>
            <span className="truncate text-base">{item?.name}</span>
          </DialogTitle>
          <DialogDescription>
            {item ? `${formatIDR(item.sellingPrice)} / ${item.unit}${item.type === "PRODUCT" ? ` · stok ${formatQty(item.stockQty)} ${item.unit}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stepper besar — target sentuh nyaman di ponsel */}
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 rounded-xl text-lg"
              onClick={() => setQtyInput(String(Math.max(1, Math.round((qty - 1) * 1000) / 1000)))}
              disabled={qty <= 1}
              aria-label="Kurangi jumlah"
            >
              <Minus className="size-5" />
            </Button>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value.replace(/[^0-9.,]/g, ""))}
              onFocus={(e) => e.target.select()}
              aria-label="Jumlah item"
              aria-invalid={overStock}
              className={cn(
                "w-24 h-14 text-center text-2xl font-bold tabular rounded-xl border bg-background outline-none transition-shadow",
                "focus-visible:ring-[2px] focus-visible:ring-ring/40 focus-visible:border-ring",
                overStock && "border-destructive/50 text-destructive"
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-14 rounded-xl text-lg"
              onClick={() => setQtyInput(String(Math.round((qty + 1) * 1000) / 1000))}
              disabled={item?.type === "PRODUCT" ? qty >= max : false}
              aria-label="Tambah jumlah"
            >
              <Plus className="size-5" />
            </Button>
          </div>

          {/* Chip cepat */}
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Jumlah cepat">
            {QUICK_QTY.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQtyInput(String(q))}
                aria-pressed={qty === q}
                className={cn(
                  "h-10 min-w-12 px-3 rounded-full border text-sm font-semibold tabular transition-colors active:scale-[0.96]",
                  "focus-visible:outline-2 focus-visible:outline-ring",
                  qty === q
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {q}×
              </button>
            ))}
          </div>

          {overStock && (
            <p className="text-sm text-destructive text-center" role="alert">
              Stok tersedia hanya {formatQty(max)} {item?.unit}.
            </p>
          )}

          {/* Total preview */}
          <div className="rounded-lg border bg-muted/40 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-bold text-primary tabular">
              {formatIDR(Math.round((qty || 0) * (item?.sellingPrice ?? 0)))}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            className="font-bold h-10 active:scale-[0.98]"
            disabled={!valid}
            onClick={() => {
              if (item && valid) {
                onConfirm(item, qty)
                onOpenChange(false)
              }
            }}
          >
            Tambah — {formatIDR(Math.round(qty * (item?.sellingPrice ?? 0)))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
