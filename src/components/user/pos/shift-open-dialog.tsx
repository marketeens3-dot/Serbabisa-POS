// Dialog mulai shift: input kas awal + tombol nominal cepat.
// 409 (sudah ada shift aktif) ditangani anggun: toast + refresh banner.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
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
import { ApiClientError } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ShiftApi } from "./use-shift";

const QUICK_AMOUNTS = [0, 50_000, 100_000, 200_000];

export function ShiftOpenDialog({
  open,
  onOpenChange,
  shift,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: ShiftApi;
}) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form saat dialog dibuka — pola adjust-state (tanpa effect).
  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setValue("");
      setError(null);
      setSubmitting(false);
    }
  }

  const openingCash = Math.floor(Number(value.replace(/[^0-9]/g, "")) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = await shift.open(openingCash);
      toast.success(`Shift dimulai — kas awal ${formatIDR(session.openingCash)}.`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "SESSION_ALREADY_OPEN") {
        toast.error(err.message);
        void shift.refetch();
        onOpenChange(false);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Gagal memulai shift. Silakan coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            Mulai Shift
          </DialogTitle>
          <DialogDescription>
            Catat uang tunai yang disiapkan di laci sebelum mulai berjualan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p
              className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="opening-cash">Kas awal di laci (Rp)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
              <Input
                id="opening-cash"
                inputMode="numeric"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="pl-9 h-11 text-base font-semibold tabular"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.map((amount) => {
                const active = openingCash === amount && value !== "";
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setValue(String(amount))}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors tabular focus-visible:outline-2 focus-visible:outline-ring",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {amount === 0 ? "Kosong (0)" : formatIDR(amount).replace("Rp ", "")}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Estimasi kas di laci dihitung dari <strong>kas awal + penjualan tunai</strong> selama shift.
            Checkout tetap bisa dilakukan meski shift belum dimulai.
          </p>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Memulai…
                </>
              ) : (
                "Mulai Shift"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
