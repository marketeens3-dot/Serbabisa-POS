// Dialog refund transaksi (parsial/total): pilih jumlah per item, estimasi nominal
// pro-rata diskon+pajak (server menghitung final), alasan wajib minimal 3 karakter.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus, RotateCcw } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { MoneyCell } from "@/components/app/shared";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR, formatQty } from "@/lib/format";
import type { TransactionDTO, TransactionItemDTO } from "@/lib/types";

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

function parseQtyInput(s: string): number {
  if (!s || s === ".") return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

type RefundableItem = {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  refundedQty: number;
  remaining: number;
};

export function RefundDialog({
  open,
  onOpenChange,
  transaction,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: TransactionDTO;
  onDone: () => void;
}) {
  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundableItems = useMemo<RefundableItem[]>(
    () =>
      (transaction.items ?? [])
        .map((it: TransactionItemDTO) => {
          const remaining = roundQty3(it.quantity - it.refundedQty);
          return {
            id: it.id,
            name: it.itemNameSnapshot,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            refundedQty: it.refundedQty,
            remaining,
          };
        })
        .filter((it) => it.remaining > 0),
    [transaction]
  );

  // Reset saat dialog dibuka (pola yang sama dengan void dialog).
  useEffect(() => {
    if (open) {
      setQtyInputs({});
      setReason("");
      setError(null);
    }
  }, [open]);

  function setQty(itemId: string, raw: string) {
    setQtyInputs((prev) => ({ ...prev, [itemId]: sanitizeQtyInput(raw) }));
  }

  /** Saat blur: normalisasi ke angka valid (0..remaining, 3 desimal). */
  function normalizeQty(item: RefundableItem) {
    const raw = qtyInputs[item.id] ?? "";
    if (!raw) return;
    const v = parseQtyInput(raw);
    const clamped = roundQty3(Math.min(Math.max(v, 0), item.remaining));
    setQtyInputs((prev) => ({ ...prev, [item.id]: String(clamped) }));
  }

  function stepQty(item: RefundableItem, dir: 1 | -1) {
    const current = parseQtyInput(qtyInputs[item.id] ?? "");
    const next = roundQty3(Math.min(Math.max(current + dir, 0), item.remaining));
    setQtyInputs((prev) => ({ ...prev, [item.id]: String(next) }));
  }

  function refundAll() {
    setQtyInputs((prev) => {
      const next = { ...prev };
      for (const it of refundableItems) next[it.id] = String(it.remaining);
      return next;
    });
  }

  const estimate = useMemo(() => {
    const gross = refundableItems.reduce(
      (sum, it) => sum + parseQtyInput(qtyInputs[it.id] ?? "") * it.unitPrice,
      0
    );
    // Pro-rata diskon+pajak — sama dengan rumus server (tampilkan saja, server final).
    return transaction.subtotal > 0
      ? Math.round(gross * (transaction.totalAmount / transaction.subtotal))
      : Math.round(gross);
  }, [refundableItems, qtyInputs, transaction]);

  async function handleSubmit() {
    setError(null);
    const entries: { transactionItemId: string; quantity: number }[] = [];
    for (const it of refundableItems) {
      const raw = qtyInputs[it.id] ?? "";
      if (!raw) continue;
      const v = parseQtyInput(raw);
      if (v <= 0) continue;
      if (Math.round(v * 1000) !== v * 1000) {
        setError(`Jumlah refund "${it.name}" maksimal 3 angka desimal.`);
        return;
      }
      if (v < 0.001) {
        setError(`Jumlah refund "${it.name}" minimal 0.001.`);
        return;
      }
      if (v > it.remaining + 1e-9) {
        setError(
          `Jumlah refund "${it.name}" melebihi sisa yang bisa direfund (${formatQty(it.remaining)}).`
        );
        return;
      }
      entries.push({ transactionItemId: it.id, quantity: roundQty3(v) });
    }
    if (!entries.length) {
      setError("Pilih minimal satu item dengan jumlah refund lebih dari nol.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Alasan refund wajib diisi (minimal 3 karakter).");
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<{ transaction: TransactionDTO }>(
        `/api/transactions/${transaction.id}/refund`,
        { items: entries, reason: reason.trim() }
      );
      const refundedNow = Math.max(0, res.transaction.refundedAmount - transaction.refundedAmount);
      toast.success(`Refund berhasil diproses — ${formatIDR(refundedNow)} dikembalikan.`);
      onDone();
    } catch (err) {
      // 404/409/422 → pesan server sudah berbahasa Indonesia.
      toast.error(err instanceof ApiClientError ? err.message : "Gagal memproses refund.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-primary" aria-hidden="true" />
            Refund {transaction.invoiceNumber}
          </DialogTitle>
          <DialogDescription>
            Pilih jumlah tiap item yang direfund. Stok produk akan dikembalikan dan pergerakan
            tercatat di riwayat stok.
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

          <p className="text-xs text-muted-foreground">
            Total transaksi <span className="tabular font-medium text-foreground">{formatIDR(transaction.totalAmount)}</span>
            {transaction.refundedAmount > 0 && (
              <>
                {" "}· sudah direfund{" "}
                <span className="tabular font-medium text-amber-700 dark:text-amber-400">
                  {formatIDR(transaction.refundedAmount)}
                </span>
              </>
            )}
          </p>

          {/* Item refundable */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Item untuk direfund</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refundAll}
                disabled={busy || !refundableItems.length}
              >
                Refund semua
              </Button>
            </div>

            {refundableItems.length ? (
              refundableItems.map((it) => {
                const qty = parseQtyInput(qtyInputs[it.id] ?? "");
                return (
                  <div key={it.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 tabular">
                          {formatIDR(it.unitPrice)} /unit · maks {formatQty(it.remaining)}
                        </p>
                      </div>
                      <MoneyCell
                        amount={qty * it.unitPrice}
                        className="text-xs text-muted-foreground shrink-0"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => stepQty(it, -1)}
                        disabled={busy || qty <= 0}
                        aria-label={`Kurangi jumlah refund ${it.name}`}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        id={`refund-qty-${it.id}`}
                        value={qtyInputs[it.id] ?? ""}
                        onChange={(e) => setQty(it.id, e.target.value)}
                        onBlur={() => normalizeQty(it)}
                        inputMode="decimal"
                        placeholder="0"
                        autoComplete="off"
                        className="h-9 w-24 text-center tabular"
                        aria-label={`Jumlah refund ${it.name} (maksimum ${formatQty(it.remaining)})`}
                        disabled={busy}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => stepQty(it, 1)}
                        disabled={busy || qty >= it.remaining}
                        aria-label={`Tambah jumlah refund ${it.name}`}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-4 text-center">
                Tidak ada item yang bisa direfund.
              </p>
            )}
          </div>

          {/* Estimasi */}
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Estimasi refund</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nominal final dihitung server (pro-rata diskon &amp; pajak).
                </p>
              </div>
              <p className="text-base font-bold tabular text-primary shrink-0" aria-live="polite">
                {formatIDR(estimate)}
              </p>
            </div>
          </div>

          {/* Alasan */}
          <div className="space-y-2">
            <Label htmlFor="refund-reason">Alasan refund *</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="cth: produk rusak saat diterima pelanggan, salah jumlah…"
              rows={3}
              maxLength={500}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Minimal 3 karakter. Alasan tercatat pada transaksi dan audit log.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {busy ? "Memproses…" : "Proses Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
