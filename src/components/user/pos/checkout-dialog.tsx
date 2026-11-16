// Dialog pembayaran: metode (tunai/transfer/QRIS/tempo), voucher promo, proyek RAB,
// jumlah bayar + tombol cepat, pajak opsional, catatan, konfirmasi.
// Tombol submit disabled saat memproses — mencegah double submit (plus idempotency key di server).
"use client";

import { useMemo, useState } from "react";
import { Banknote, Check, HandCoins, Loader2, QrCode, Receipt, Smartphone, Ticket, TriangleAlert, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatIDR, formatPercentID } from "@/lib/format";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import type { CartLine } from "@/components/user/pos/pos-view";

const METHODS = [
  { key: "CASH", label: "Tunai", icon: Banknote },
  { key: "TRANSFER", label: "Transfer", icon: Smartphone },
  { key: "QRIS", label: "QRIS", icon: QrCode },
  { key: "OTHER", label: "Lainnya", icon: Wallet },
  { key: "TEMPO", label: "Tempo", icon: HandCoins },
]

const QUICK_CASH = [0, 5000, 10000, 20000, 50000, 100000]

export function CheckoutDialog({
  open,
  onOpenChange,
  cart,
  subtotal,
  itemDiscountTotal = 0,
  discount,
  discountPercent = 0,
  submitting,
  hasCustomer,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cart: CartLine[]
  /** Bruto Σ baris (sebelum diskon per item). */
  subtotal: number
  /** Σ diskon per item — tampil sebagai baris "Diskon item". */
  itemDiscountTotal?: number
  /** Diskon transaksi (Rp efektif) — dihitung dari subtotal NETO. */
  discount: number
  /** Persen diskon yang aktif (>0 = mode diskon persen seluruh item). */
  discountPercent?: number
  submitting: boolean
  /** Ada pelanggan di keranjang? Wajib untuk metode TEMPO. */
  hasCustomer?: boolean
  onSubmit: (payload: {
    paymentMethod: string
    paidAmount: number
    taxAmount: number
    notes: string | null
    voucherCode: string | null
    projectId: string | null
    dueDays?: number
  }) => Promise<void>
}) {
  const [paymentMethod, setPaymentMethod] = useState("CASH")
  const [taxAmount, setTaxAmount] = useState(0)
  const [paidInput, setPaidInput] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [voucherInput, setVoucherInput] = useState("")
  const [voucher, setVoucher] = useState<{ code: string; discount: number } | null>(null)
  const [voucherChecking, setVoucherChecking] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [dueDays, setDueDays] = useState("30")

  // Daftar proyek aktif untuk penjualan RAB (diambil saat dialog dibuka).
  const { data: projectsData } = useApi<{ data: { id: string; code: string; name: string }[] }>(
    open ? "/api/projects?status=ACTIVE&pageSize=100" : null
  )
  const projects = projectsData?.data ?? []

  // Rumus = server: total = subtotalBruto − diskonItem − diskonTransaksi − diskonVoucher + pajak.
  const netSubtotal = subtotal - itemDiscountTotal
  const voucherDiscount = voucher?.discount ?? 0
  const total = useMemo(
    () => Math.max(0, netSubtotal - discount - voucherDiscount + taxAmount),
    [netSubtotal, discount, voucherDiscount, taxAmount]
  )
  const paid = Math.floor(Number(paidInput.replace(/[^0-9]/g, "")) || 0)
  const isTempo = paymentMethod === "TEMPO"
  const dpShort = total - paid
  const isShort = paid < total
  const tempoBlocked = isTempo && !hasCustomer

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
      setVoucherInput("")
      setVoucher(null)
      setProjectId("")
      setDueDays("30")
    }
  }

  function quickCash(amount: number) {
    const next = amount === 0 ? total : Math.ceil(total / amount) * amount
    setPaidInput(String(next))
  }

  async function applyVoucher() {
    const code = voucherInput.trim().toUpperCase()
    if (!code) return
    setVoucherChecking(true)
    setError(null)
    try {
      const res = await api.post<{ code: string; discount: number }>("/api/vouchers/validate", {
        code,
        subtotal: Math.max(0, netSubtotal - discount),
      })
      setVoucher({ code: res.code, discount: res.discount })
      setError(null)
    } catch (err) {
      setVoucher(null)
      setError(err instanceof ApiClientError ? err.message : "Voucher tidak bisa dipakai.")
    } finally {
      setVoucherChecking(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (tempoBlocked) {
      setError("Penjualan tempo wajib punya pelanggan — pilih pelanggan di keranjang dulu.")
      return
    }
    if (!isTempo && isShort) {
      setError("Jumlah bayar kurang dari total belanja.")
      return
    }
    try {
      await onSubmit({
        paymentMethod,
        paidAmount: paid,
        taxAmount,
        notes: notes.trim() || null,
        voucherCode: voucher?.code ?? null,
        projectId: projectId || null,
        dueDays: isTempo ? Math.max(1, Number(dueDays) || 30) : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaksi gagal. Silakan coba lagi.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Pembayaran
          </DialogTitle>
          <DialogDescription>
            {cart.length} item · Subtotal {formatIDR(subtotal)}
            {itemDiscountTotal > 0 && ` · Diskon item ${formatIDR(itemDiscountTotal)}`}
            {discount > 0 &&
              ` · Diskon${itemDiscountTotal > 0 ? " transaksi" : ""}${
                discountPercent > 0 ? ` ${formatPercentID(discountPercent)}` : ""
              } ${formatIDR(discount)}`}
            {voucherDiscount > 0 && ` · Voucher ${voucher?.code} −${formatIDR(voucherDiscount)}`}
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
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(m.key)
                    if (m.key === "TEMPO") setPaidInput("0")
                    else if (m.key !== "CASH") setPaidInput(String(total))
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

          {/* Voucher promo */}
          <div className="space-y-2">
            <Label htmlFor="voucher" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Voucher promo (opsional)
            </Label>
            {voucher ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                <span className="text-sm font-medium text-primary flex items-center gap-1.5">
                  <Ticket className="size-4" /> {voucher.code} — {formatIDR(voucher.discount)}
                </span>
                <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setVoucher(null)}>
                  Hapus
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  id="voucher"
                  value={voucherInput}
                  onChange={(e) => setVoucherInput(e.target.value.toUpperCase())}
                  placeholder="Kode voucher…"
                  className="font-mono uppercase"
                  maxLength={30}
                />
                <Button type="button" variant="outline" onClick={applyVoucher} disabled={!voucherInput.trim() || voucherChecking}>
                  {voucherChecking ? <Loader2 className="size-4 animate-spin" /> : "Pakai"}
                </Button>
              </div>
            )}
          </div>

          {/* Proyek RAB */}
          {projects.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="proj-sel" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Untuk proyek / RAB (opsional)
              </Label>
              <select
                id="proj-sel"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— Penjualan reguler —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
              {projectId && (
                <p className="text-xs text-muted-foreground">Transaksi ini otomatis dicatat sebagai realisasi proyek.</p>
              )}
            </div>
          )}

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
              {isTempo ? "Uang muka / DP (Rp)" : "Jumlah bayar (Rp)"}
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
              {(isTempo ? [0, ...QUICK_CASH.slice(1)] : QUICK_CASH).map((amount) => {
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
                    {amount === 0 ? (isTempo ? "Tanpa DP" : "Uang pas") : formatIDR(amount).replace("Rp ", "")}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tempo: jatuh tempo + info piutang */}
          {isTempo && (
            <div className="space-y-2">
              <Label htmlFor="due-days" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jatuh tempo piutang (hari)
              </Label>
              <Input
                id="due-days"
                inputMode="numeric"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 tabular"
              />
            </div>
          )}

          {/* Kembalian / sisa piutang */}
          {isShort ? (
            isTempo ? (
              <div
                className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold text-amber-700 dark:text-amber-400"
                aria-live="polite"
              >
                <span className="flex items-center gap-2">
                  <HandCoins className="size-4 shrink-0" aria-hidden="true" />
                  Jadi piutang (total − DP)
                </span>
                <span className="tabular">{formatIDR(dpShort)}</span>
              </div>
            ) : (
              <div
                className="rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold text-destructive"
                aria-live="polite"
              >
                <span className="flex items-center gap-2">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                  Kurang bayar
                </span>
                <span className="tabular">{formatIDR(dpShort)}</span>
              </div>
            )
          ) : (
            <div
              className="rounded-lg border border-emerald-600/25 bg-emerald-600/10 px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400"
              aria-live="polite"
            >
              <span className="flex items-center gap-2">
                <Check className="size-4 shrink-0" aria-hidden="true" />
                Kembalian
              </span>
              <span className="tabular">{formatIDR(Math.abs(total - paid))}</span>
            </div>
          )}

          {tempoBlocked && (
            <p className="text-xs text-amber-700 dark:text-amber-400 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
              Pilih pelanggan di keranjang sebelum pakai metode tempo — piutang butuh pemilik.
            </p>
          )}

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
            <Button type="submit" className="font-bold h-10 active:scale-[0.98]" disabled={submitting || (!isTempo && (isShort || paid <= 0)) || tempoBlocked}>
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
