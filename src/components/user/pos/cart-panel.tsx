// Panel keranjang: daftar item + qty, pilih pelanggan (command picker), diskon, total, tombol BAYAR.
"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Minus, Plus, Pin, ShoppingCart, Tag, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR, formatPercentID, formatQty } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import { ParkedCartsControls, type ParkedCart } from "@/components/user/pos/parked-carts";
import { ParkedCartTip } from "@/components/user/pos/parked-cart-tip";
import { lineDiscount, lineGross, effectiveUnitPrice, type CartLine } from "@/components/user/pos/cart-math";
import type { CustomerDTO, Paginated } from "@/lib/types";

export function CartPanel({
  cart,
  subtotal,
  itemDiscountTotal,
  discount,
  discountMode,
  discountInput,
  setDiscountMode,
  setDiscountInput,
  discountPinned,
  onToggleDiscountPinned,
  onClearDiscount,
  customerId,
  setCustomerId,
  customersVersion,
  onCustomersChanged,
  onSetQty,
  onRemove,
  onSetLineDiscount,
  onCheckout,
  disabled,
  payLocked = false,
  parkedCarts,
  onPark,
  onResumeParked,
  onDeleteParked,
}: {
  cart: CartLine[]
  /** Bruto Σ baris (sebelum diskon per item) — untuk baris Subtotal. */
  subtotal: number
  /** Σ diskon per item (baris "Diskon item" di ringkasan). */
  itemDiscountTotal: number
  /** Nominal diskon efektif (Rp) — hasil turunan mode+input (dihitung di pos-view). */
  discount: number
  /** "rp" = nominal manual; "pct" = persen diterapkan ke seluruh item. */
  discountMode: "rp" | "pct"
  /** Nilai mentah input sesuai mode (Rp atau persen). */
  discountInput: number
  setDiscountMode: (v: "rp" | "pct") => void
  setDiscountInput: (v: number) => void
  /** Pin "Tetap": diskon otomatis dipakai lagi di transaksi berikutnya. */
  discountPinned: boolean
  onToggleDiscountPinned: () => void
  /** "Hapus" diskon transaksi (sekalian melepas pin bila aktif). */
  onClearDiscount: () => void
  customerId: string | null
  setCustomerId: (v: string | null) => void
  customersVersion: number
  onCustomersChanged: () => void
  onSetQty: (itemId: string, qty: number) => void
  onRemove: (itemId: string) => void
  /** Set diskon per baris: mode + nilai (0 = hapus diskon baris). */
  onSetLineDiscount: (itemId: string, mode: "rp" | "pct", value: number) => void
  onCheckout: () => void
  disabled: boolean
  /** Toko mewajibkan shift aktif & belum ada shift — tombol Bayar terkunci (UX layer). */
  payLocked?: boolean
  parkedCarts: ParkedCart[]
  onPark: () => void
  onResumeParked: (pc: ParkedCart) => void
  onDeleteParked: (pc: ParkedCart) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)

  const { data: customersData, refresh } = useApi<Paginated<CustomerDTO>>(
    `/api/customers?status=ACTIVE&pageSize=100${customersVersion ? `&v=${customersVersion}` : ""}`
  )
  useEffect(() => {
    if (customersVersion) void refresh()
  }, [customersVersion])

  const customers = customersData?.data ?? []
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null
  // Neto = bruto − diskon per item. Diskon transaksi dihitung dari NETO ini —
  // rumus sama dengan server (floor pada mode %).
  const netSubtotal = subtotal - itemDiscountTotal
  const total = Math.max(0, netSubtotal - discount)

  return (
    <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/85 shadow-lg shadow-primary/5 flex flex-col max-h-[calc(100vh-6.5rem)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <ShoppingCart className="size-4.5 text-primary shrink-0" aria-hidden="true" />
        <p className="font-semibold text-sm">Keranjang</p>
        <Badge variant="secondary" className="tabular rounded-full px-2">
          {cart.length} item
        </Badge>
        <div className="ml-auto flex items-center gap-1.5">
          <ParkedCartsControls
            carts={parkedCarts}
            cartEmpty={cart.length === 0}
            onPark={onPark}
            onResume={onResumeParked}
            onDelete={onDeleteParked}
          />
        </div>
      </div>

      {/* Tips parkir — sekali tampil, kontekstual saat keranjang berisi */}
      {cart.length >= 2 && <ParkedCartTip />}

      {/* Daftar item */}
      <div className="flex-1 overflow-y-auto min-h-[120px] max-h-[45vh] px-3 py-2">
        {!cart.length ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <div
              className="size-12 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-3"
              aria-hidden="true"
            >
              <ShoppingCart className="size-5 text-primary" />
            </div>
            <p className="text-sm font-semibold">Keranjang masih kosong</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-[220px]">
              Pilih item dari katalog untuk mulai berjualan.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {cart.map((line) => {
              const gross = lineGross(line)
              const disc = lineDiscount(line)
              return (
                /* Baris 2 tingkat: nama + hapus di atas, stepper + subtotal di
                   bawah. Layout satu-baris lama menyisakan ~52px untuk nama di
                   ponsel — kasir tak bisa memverifikasi item. */
                <li key={line.item.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium leading-tight truncate min-w-0 flex-1">
                      {line.item.name}
                    </p>
                    <button
                      onClick={() => onRemove(line.item.id)}
                      className="size-10 -mr-1.5 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      aria-label={`Hapus ${line.item.name} dari keranjang`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground tabular mt-0.5">
                    {line.discountFromProduct && line.discountValue > 0 ? (
                      <>
                        <span className="line-through">{formatIDR(line.item.sellingPrice)}</span>{" "}
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          {formatIDR(effectiveUnitPrice(line))}
                        </span>{" "}
                        / {line.item.unit}
                      </>
                    ) : (
                      <>
                        {formatIDR(line.item.sellingPrice)} / {line.item.unit}
                      </>
                    )}
                    {line.item.type === "PRODUCT" && ` · stok ${formatQty(line.item.stockQty)}`}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <div className="flex items-center rounded-lg border bg-background h-10">
                      <button
                        onClick={() => onSetQty(line.item.id, line.quantity - 1)}
                        className="size-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-l-lg hover:bg-muted active:scale-95 transition-all"
                        aria-label={`Kurangi jumlah ${line.item.name}`}
                      >
                        <Minus className="size-4" />
                      </button>
                      <input
                        className="w-12 text-center text-sm font-semibold tabular bg-transparent outline-none"
                        value={formatQty(line.quantity)}
                        onChange={(e) => {
                          const parsed = Number(e.target.value.replace(/[^0-9.,]/g, "").replace(",", "."))
                          if (Number.isFinite(parsed)) onSetQty(line.item.id, parsed)
                        }}
                        aria-label={`Jumlah ${line.item.name}`}
                      />
                      <button
                        onClick={() => onSetQty(line.item.id, line.quantity + 1)}
                        className="size-10 flex items-center justify-center text-muted-foreground hover:text-foreground rounded-r-lg hover:bg-muted active:scale-95 transition-all"
                        aria-label={`Tambah jumlah ${line.item.name}`}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Chip DISKON PER PRODUK — buka popover input % / Rp. */}
                      <LineDiscountPopover line={line} onApply={onSetLineDiscount} />
                      <p className="text-sm font-semibold tabular shrink-0">{formatIDR(gross - disc)}</p>
                    </div>
                  </div>
                  {disc > 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 tabular mt-1 text-right">
                      Diskon{line.discountMode === "pct" ? ` ${formatPercentID(line.discountValue)}` : ""} − {formatIDR(disc)} dari {formatIDR(gross)}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Ringkasan + aksi */}
      <div className="border-t p-4 space-y-3.5 bg-muted/30 rounded-b-xl">
        {/* Pelanggan */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Pelanggan (opsional)</p>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-9 font-normal" role="combobox" aria-expanded={pickerOpen}>
                <span className="truncate">
                  {selectedCustomer ? `${selectedCustomer.name}` : "Pilih pelanggan…"}
                </span>
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Cari nama pelanggan…" />
                <CommandList>
                  <CommandEmpty>Pelanggan tidak ditemukan.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__umum"
                      onSelect={() => {
                        setCustomerId(null)
                        setPickerOpen(false)
                      }}
                    >
                      <Check className={cn("size-4 mr-2", !customerId ? "opacity-100" : "opacity-0")} />
                      Umum (tanpa pelanggan)
                    </CommandItem>
                    {customers.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={c.name}
                        onSelect={() => {
                          setCustomerId(c.id)
                          setPickerOpen(false)
                        }}
                      >
                        <Check className={cn("size-4 mr-2", customerId === c.id ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0">
                          <p className="truncate">{c.name}</p>
                          {c.phone && <p className="text-xs text-muted-foreground tabular">{formatPhoneDisplay(c.phone)}</p>}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              <div className="border-t p-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setPickerOpen(false)
                    setNewCustomerOpen(true)
                  }}
                >
                  <UserPlus className="size-4 mr-2" />
                  Pelanggan baru…
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Diskon — toggle Rp (nominal) / % (seluruh item) + pin "Tetap" */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Diskon</p>
              <div
                role="group"
                aria-label="Satuan diskon"
                className="inline-flex rounded-md border border-border/70 p-0.5 bg-muted/40"
              >
                {(["rp", "pct"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      // Ganti mode: nolkan input agar tidak ada nilai nyasar antar satuan.
                      setDiscountMode(m)
                      setDiscountInput(0)
                    }}
                    aria-pressed={discountMode === m}
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                      discountMode === m
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m === "rp" ? "Rp" : "%"}
                  </button>
                ))}
              </div>
              {/* Tombol DISKON TETAP: sematkan nilai diskon agar otomatis
                  terpakai lagi di transaksi berikutnya (tersimpan per kasir). */}
              <button
                type="button"
                onClick={onToggleDiscountPinned}
                aria-pressed={discountPinned}
                aria-label="Diskon tetap"
                title={
                  discountPinned
                    ? "Diskon tetap AKTIF — nilai ini otomatis dipakai lagi untuk transaksi berikutnya. Klik untuk melepas."
                    : "Sematkan diskon — nilai ini otomatis dipakai lagi untuk transaksi berikutnya (tanpa input ulang)."
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  discountPinned
                    ? "border-amber-500/50 bg-amber-100 text-amber-900 shadow-sm dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300"
                    : "border-border/70 bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Pin className={cn("size-3", discountPinned && "fill-current")} aria-hidden="true" />
                Tetap
              </button>
            </div>
            {discount > 0 && (
              <button
                onClick={onClearDiscount}
                className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                aria-label="Hapus diskon"
              >
                <X className="size-3" /> hapus
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type="number"
              inputMode={discountMode === "pct" ? "decimal" : "numeric"}
              step={discountMode === "pct" ? "0.01" : "1"}
              min={0}
              max={discountMode === "pct" ? 100 : netSubtotal}
              value={discountInput || ""}
              placeholder="0"
              onChange={(e) => {
                const raw = Number(e.target.value) || 0
                const v =
                  discountMode === "pct"
                    ? Math.max(0, Math.min(100, Math.round(raw * 100) / 100))
                    : Math.max(0, Math.min(netSubtotal, Math.floor(raw)))
                setDiscountInput(v)
              }}
              className="h-9 tabular pr-10"
              aria-label={discountMode === "pct" ? "Diskon dalam persen" : "Diskon dalam rupiah"}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground tabular">
              {discountMode === "pct" ? "%" : "Rp"}
            </span>
          </div>
          {discountMode === "pct" ? (
            <p className="text-xs text-muted-foreground tabular">
              {discount > 0 ? (
                <>
                  <span className="font-medium text-foreground">{formatPercentID(discountInput)}</span> dari seluruh item = <span className="font-medium text-foreground">− {formatIDR(discount)}</span>
                </>
              ) : (
                "Persen diskon berlaku ke semua item di keranjang."
              )}
            </p>
          ) : (
            discount > netSubtotal && <p className="text-xs text-destructive">Diskon tidak boleh melebihi subtotal.</p>
          )}
          {discountPinned && (
            <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-1" role="status">
              <Pin className="size-3 fill-current" aria-hidden="true" />
              Diskon tetap — otomatis dipakai lagi untuk transaksi berikutnya.
            </p>
          )}
        </div>

        {/* Totals */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular font-medium text-foreground">{formatIDR(subtotal)}</span>
          </div>
          {itemDiscountTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Diskon item</span>
              <span className="tabular font-medium text-amber-700 dark:text-amber-400">- {formatIDR(itemDiscountTotal)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>
              Diskon{itemDiscountTotal > 0 ? " transaksi" : ""}
              {discountMode === "pct" && discountInput > 0 ? ` (${formatPercentID(discountInput)})` : ""}
            </span>
            <span className="tabular font-medium text-foreground">- {formatIDR(discount)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary tabular">{formatIDR(total)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base font-bold shadow-sm active:scale-[0.98]"
          disabled={disabled || discount > netSubtotal || payLocked}
          onClick={onCheckout}
          title={payLocked ? "Terkunci — mulai shift terlebih dahulu untuk menerima pembayaran" : undefined}
          aria-describedby={payLocked ? "pay-locked-hint" : undefined}
        >
          Bayar — {formatIDR(total)}
        </Button>
        {payLocked ? (
          <p id="pay-locked-hint" className="text-[11px] text-destructive text-center" role="alert">
            Transaksi terkunci — mulai shift untuk menerima pembayaran.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground text-center">
            Stok &amp; total akan divalidasi ulang oleh server saat pembayaran.
          </p>
        )}
      </div>

      <NewCustomerDialog
        open={newCustomerOpen}
        onOpenChange={setNewCustomerOpen}
        onCreated={(c) => {
          setCustomerId(c.id)
          onCustomersChanged()
          toast.success(`Pelanggan ${c.name} ditambahkan.`)
        }}
      />
    </div>
  )
}

/* Chip diskon PER PRODUK pada tiap baris keranjang: popover input % / Rp.
   Nilai di-clamp sama seperti server: % 0–100 (2 desimal), Rp maks harga baris. */
function LineDiscountPopover({
  line,
  onApply,
}: {
  line: CartLine
  onApply: (itemId: string, mode: "rp" | "pct", value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"rp" | "pct">(line.discountMode)
  const [value, setValue] = useState(line.discountValue)
  const gross = lineGross(line)
  const active = lineDiscount(line) > 0

  function handleOpenChange(next: boolean) {
    if (next) {
      if (line.discountFromProduct && line.discountMode === "rp") {
        // Diskon produk = nominal per unit × qty. Saat diedit lewat chip,
        // mulai dari TOTAL efektif baris — simpan = jadi override manual.
        setMode("rp")
        setValue(lineDiscount(line))
      } else {
        // Mulai mengedit dari nilai baris saat ini.
        setMode(line.discountMode)
        setValue(line.discountValue)
      }
    }
    setOpen(next)
  }

  const preview =
    mode === "pct" ? Math.floor((gross * value) / 100) : Math.min(Math.floor(value), gross)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Diskon untuk ${line.item.name}`}
          title="Beri diskon khusus untuk item ini"
          className={cn(
            "inline-flex h-8 max-w-28 items-center gap-1 rounded-md border px-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            active
              ? "border-amber-500/50 bg-amber-100 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300"
              : "border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <Tag className="size-3 shrink-0" aria-hidden="true" />
          {active
            ? line.discountMode === "pct"
              ? formatPercentID(line.discountValue)
              : `−${formatIDR(lineDiscount(line)).replace("Rp ", "")}`
            : "Diskon"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <p className="text-xs font-semibold mb-2 truncate">Diskon — {line.item.name}</p>
        {line.discountFromProduct && line.discountMode === "rp" && line.discountValue > 0 && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-2">
            Mengikuti diskon produk: {formatIDR(Math.min(line.discountValue, line.item.sellingPrice))}/unit. Ubah nilai lalu
            Terapkan untuk override manual.
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <div
            role="group"
            aria-label="Satuan diskon item"
            className="inline-flex shrink-0 rounded-md border border-border/70 p-0.5 bg-muted/40"
          >
            {(["rp", "pct"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  // Ganti mode: nolkan nilai agar tidak ada angka nyasar antar satuan.
                  setMode(m)
                  setValue(0)
                }}
                aria-pressed={mode === m}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "rp" ? "Rp" : "%"}
              </button>
            ))}
          </div>
          <Input
            type="number"
            min={0}
            max={mode === "pct" ? 100 : gross}
            step={mode === "pct" ? "0.01" : "1"}
            value={value || ""}
            placeholder="0"
            onChange={(e) => {
              const raw = Number(e.target.value) || 0
              setValue(
                mode === "pct"
                  ? Math.max(0, Math.min(100, Math.round(raw * 100) / 100))
                  : Math.max(0, Math.min(gross, Math.floor(raw)))
              )
            }}
            className="h-8 tabular"
            aria-label="Nilai diskon item"
          />
          <span className="text-xs text-muted-foreground shrink-0 tabular">{mode === "pct" ? "%" : "Rp"}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Diskon</span>
          <span className="font-semibold tabular text-amber-700 dark:text-amber-400">− {formatIDR(preview)}</span>
        </div>
        <div className="mt-3 flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 flex-1"
            onClick={() => {
              onApply(line.item.id, "rp", 0)
              setOpen(false)
            }}
          >
            Hapus
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 flex-1"
            onClick={() => {
              onApply(line.item.id, mode, value)
              setOpen(false)
            }}
          >
            Terapkan
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (c: CustomerDTO) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName("")
      setPhone("")
      setError(null)
    }
  }, [open])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const customer = await api.post<CustomerDTO>("/api/customers", {
        name: name.trim(),
        phone: phone.trim() || null,
      })
      onCreated(customer)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Gagal menyimpan pelanggan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pelanggan Baru</DialogTitle>
          <DialogDescription>Data minimal: nama &amp; nomor WhatsApp (opsional).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="space-y-2">
            <Label htmlFor="nc-name">Nama</Label>
            <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-phone">Nomor HP / WhatsApp</Label>
            <Input id="nc-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxx" />
            <p className="text-xs text-muted-foreground">Format 08… atau 62… — otomatis dinormalisasi.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={saving || name.trim().length < 2}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
