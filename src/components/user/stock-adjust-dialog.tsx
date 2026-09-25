// Dialog penyesuaian stok (opname/stock adjust): input stok fisik baru, indikator
// delta live (+ masuk / − keluar), alasan wajib (5 pilihan), catatan opsional.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, PackagePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiClientError } from "@/lib/api-client";
import { STOCK_ADJUST_REASON_LABELS, type StockAdjustReason } from "@/lib/constants";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CatalogItemDTO } from "@/lib/types";

function roundQty3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Hanya digit dan satu pemisah desimal (titik/koma) — koma dinormalkan ke titik. */
function sanitizeQtyInput(raw: string): string {
  let s = raw.replace(/[^0-9.,]/g, "").replace(",", ".");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  return s;
}

function parseQtyInput(s: string): number | null {
  if (!s || s === ".") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

const REASON_OPTIONS = Object.entries(STOCK_ADJUST_REASON_LABELS) as [StockAdjustReason, string][];

export function StockAdjustDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: CatalogItemDTO | null;
  onSaved: () => void;
}) {
  const [newQtyRaw, setNewQtyRaw] = useState("");
  const [reason, setReason] = useState<StockAdjustReason>("OPNAME");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset saat dialog dibuka — stok baru di-prefill dengan stok saat ini.
  useEffect(() => {
    if (open && item) {
      setNewQtyRaw(String(item.stockQty));
      setReason("OPNAME");
      setNote("");
      setError(null);
    }
  }, [open, item]);

  const currentQty = item?.stockQty ?? 0;
  const newQty = useMemo(() => parseQtyInput(newQtyRaw), [newQtyRaw]);
  const delta = newQty === null ? null : roundQty3(newQty - currentQty);

  async function handleSubmit() {
    if (!item) return;
    setError(null);
    if (newQty === null) {
      setError("Stok baru harus berupa angka.");
      return;
    }
    if (newQty < 0) {
      setError("Stok tidak boleh negatif.");
      return;
    }
    if (Math.round(newQty * 1000) !== newQty * 1000) {
      setError("Stok maksimal 3 angka desimal.");
      return;
    }
    if (delta !== null && Math.abs(delta) < 0.0005) {
      setError("Stok baru sama dengan stok saat ini.");
      return;
    }

    setBusy(true);
    try {
      const trimmedNote = note.trim();
      await api.post(`/api/catalog/${item.id}/stock-adjust`, {
        newQty,
        reason,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      toast.success(
        `Stok "${item.name}" disesuaikan: ${formatQty(currentQty)} ${item.unit} → ${formatQty(newQty)} ${item.unit} (${
          delta && delta > 0 ? `+${formatQty(delta)}` : `−${formatQty(Math.abs(delta ?? 0))}`
        }).`
      );
      onSaved();
    } catch (err) {
      // 422 NO_CHANGE / NOT_PRODUCT, 404 — pesan server berbahasa Indonesia.
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan penyesuaian stok.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="size-5 text-primary" aria-hidden="true" />
            Sesuaikan Stok
          </DialogTitle>
          <DialogDescription>
            Masukkan hasil hitung fisik{item ? ` untuk "${item.name}"` : ""}. Perubahan tercatat di
            riwayat pergerakan stok dan tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <p
              className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5"
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Ringkasan stok saat ini + delta live */}
          <div className="rounded-lg border bg-muted/40 p-3.5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">Stok saat ini</p>
              <p className="text-sm font-semibold tabular mt-0.5">
                {item ? `${formatQty(currentQty)} ${item.unit}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Perubahan</p>
              <p
                className="text-sm font-bold tabular mt-0.5"
                aria-live="polite"
                aria-label="Perubahan stok"
              >
                {delta === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : delta > 0.0005 ? (
                  <span className="text-emerald-600 dark:text-emerald-400">+{formatQty(delta)}</span>
                ) : delta < -0.0005 ? (
                  <span className="text-red-600 dark:text-red-400">−{formatQty(Math.abs(delta))}</span>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-new-qty">Stok baru hasil hitung fisik *</Label>
            <Input
              id="adjust-new-qty"
              value={newQtyRaw}
              onChange={(e) => setNewQtyRaw(sanitizeQtyInput(e.target.value))}
              inputMode="decimal"
              placeholder="cth: 95"
              autoComplete="off"
              className="tabular"
              disabled={busy}
              aria-describedby="adjust-new-qty-hint"
            />
            <p id="adjust-new-qty-hint" className="text-xs text-muted-foreground">
              Angka desimal diizinkan hingga 3 angka (mis. 0,5). Tidak boleh negatif.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Alasan penyesuaian *</p>
            <Select value={reason} onValueChange={(v) => setReason(v as StockAdjustReason)}>
              <SelectTrigger className="w-full" aria-label="Alasan penyesuaian stok">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-note">Catatan (opsional)</Label>
            <Input
              id="adjust-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="cth: hasil opname gudang bagian belakang"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground tabular">{note.length}/200</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy} className={cn(busy && "opacity-80")}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Memproses…" : "Simpan Penyesuaian"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
