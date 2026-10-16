// Dialog pembayaran: metode, jumlah bayar + tombol cepat, pajak opsional, catatan, konfirmasi.
// Tombol submit disabled saat memproses — mencegah double submit (plus idempotency key di server).
"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, Loader2, QrCode, Receipt, Smartphone, TriangleAlert, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatIDR, formatPercentID } from "@/lib/format";
import type { CartLine } from "@/components/user/pos/pos-view";

const METHODS = [
  { key: "CASH", label: "Tunai", icon: Banknote },
  { key: "TRANSFER", label: "Transfer", icon: Smartphone },
  { key: "QRIS", label: "QRIS", icon: QrCode },
  { key: "OTHER", label: "Lainnya", icon: Wallet },
]

const QUICK_CASH = [0, 5000, 10000, 20000, 50000, 100000]

export function CheckoutDialog({
  open,
  onOpenChange,
  cart,
  subtotal,
  discount,
  discountPercent = 0,
  submitting,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cart: CartLine[]
  subtotal: number
  discount: number
  /** Persen diskon yang aktif (>0 = mode diskon persen seluruh item). */
  discountPercent?: number
  submitting: boolean
  onSubmit: (payload: { paymentMethod: string; paidAmount: number; taxAmount: number; notes: string | null }) => Promise<void>
}) {
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [taxAmount, setTaxAmount] = useState(0)
  const [paidInput, setPaidInput] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const total = useMemo(() => Math.max(0, subtotal - discount + taxAmount), [subtotal, discount, taxAmount])
  const paid = Math.floor(Number(paidInput.replace(/[^0-9]/g, "")) || 0)
  const change = paid - total
  const isShort = paid < total

  // Reset form pembayaran saat dialog dibuka — pola adjust-state saat render (tanpa effect).
  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) {
      setError(null)
      setNotes("")
      setTaxAmount(0)
      setPaymentMethod("CASH")
      setPaidInput("")
    }
  }

  function quickCash(amount: number) {
    const next = amount === 0 ? total : Math.ceil(total / amount) * amount
    setPaidInput(String(next))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (isShort) {
      setError("Jumlah bayar kurang dari total belanja.")
      return
    }
    try {
      await onSubmit({ paymentMethod, paidAmount: paid, taxAmount, notes: notes.trim() || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaksi gagal. Silakan coba lagi.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Pembayaran
          </DialogTitle>
          <DialogDescription>
            {cart.length} item · Subtotal {formatIDR(subtotal)}
            {discount > 0 &&
              ` · Diskon${discountPercent > 0 ? ` ${formatPercentID(discountPercent)}` : ""} ${formatIDR(discount)}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
              {error}
            </p>
          )}

          {/* Metode pembayaran */}
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metode pembayaran</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m.key)
                    if (m.key !== "CASH") setPaidInput(String(total))
                    else if (paidInput === String(total)) setPaidInput("")
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1.5 rounded-lg border py-3 text-xs font-medium transition-all",
                    "focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.97]",
                    paymentMethod === m.key
                      ? "border-transparent bg-primary/5 text-primary ring-2 ring-primary"
                      : "text-muted-foreground hover:border-foreground/25 hover:bg-muted/40 hover:text-foreground"
                  )}
                  aria-pressed={paymentMethod === m.key}
                >
                  <m.icon className="size-4.5" />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pajak opsional */}
          <details className="text-sm">
            <summary className="text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer select-none hover:text-foreground">
              Pajak / biaya tambahan (opsional)
            </summary>
            <div className="mt-2.5 flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={taxAmount || ""}
                placeholder="0"
                onChange={(e) => setTaxAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                className="h-9 tabular"
                aria-label="Pajak dalam rupiah"
              />
            </div>
          </details>

          {/* Total besar */}
          <div className="rounded-xl border bg-muted/40 p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total tagihan</span>
            <span className="text-2xl font-bold text-primary tabular">{formatIDR(total)}</span>
          </div>

          {/* Jumlah bayar */}
          <div className="space-y-2">
            <Label htmlFor="paid" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Jumlah bayar (Rp)
            </Label>
            <Input
              id="paid"
              inputMode="numeric"
              value={paidInput}
              onChange={(e) => setPaidInput(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={String(total)}
              className="h-11 text-base font-semibold tabular"
              autoFocus
              aria-describedby="paid-hint"
            />
            <div className="flex flex-wrap gap-1.5" id="paid-hint">
              {QUICK_CASH.map((amount) => {
                const active = amount === 0 ? paid === total && total > 0 : paid === amount
                return (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => quickCash(amount)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors tabular focus-visible:outline-2 focus-visible:outline-ring",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {amount === 0 ? "Uang pas" : formatIDR(amount).replace("Rp ", "")}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Kembalian */}
          <div
            className={cn(
              "rounded-lg border px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold",
              isShort
                ? "border-destructive/25 bg-destructive/10 text-destructive"
                : "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
            )}
            aria-live="polite"
          >
            <span className="flex items-center gap-2">
              {isShort ? (
                <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Check className="size-4 shrink-0" aria-hidden="true" />
              )}
              {isShort ? "Kurang bayar" : "Kembalian"}
            </span>
            <span className="tabular">{formatIDR(Math.abs(change))}</span>
          </div>

          {/* Catatan */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Catatan (opsional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan transaksi…"
              rows={2}
              maxLength={500}
              className="text-sm"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" className="font-bold h-10 active:scale-[0.98]" disabled={submitting || isShort || paid <= 0}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Memproses…
                </>
              ) : (
                `Konfirmasi — ${formatIDR(total)}`
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
