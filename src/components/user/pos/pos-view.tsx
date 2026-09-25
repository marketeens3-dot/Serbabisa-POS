// POS / Kasir — layout utama: banner shift (atas), katalog (kiri) + keranjang
// (kanan), mobile pakai tab. Keranjang baru dikosongkan HANYA setelah RPC sukses
// (gagal → keranjang tetap agar bisa diperbaiki).
// Shortcut kasir: F2 "/" fokus cari · F4 parkir keranjang · F8 / Ctrl+Enter bayar.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Plus, ScanBarcode, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { CatalogPanel } from "@/components/user/pos/catalog-panel";
import { CartPanel } from "@/components/user/pos/cart-panel";
import { CheckoutDialog } from "@/components/user/pos/checkout-dialog";
import { PosSuccess } from "@/components/user/pos/pos-success";
import { ShiftBanner } from "@/components/user/pos/shift-banner";
import { useShift } from "@/components/user/pos/use-shift";
import {
  DeleteParkedDialog,
  ParkCartDialog,
  ResumeConfirmDialog,
  appendParkedCart,
  removeParkedCart,
  useParkedCarts,
  type ParkedCart,
} from "@/components/user/pos/parked-carts";
import { dismissParkedCartTip } from "@/components/user/pos/parked-cart-tip";
import { useApp } from "@/components/app/app-context";
import { api } from "@/lib/api-client";
import { formatQty } from "@/lib/format";
import { playCartTick, playCheckoutSuccess } from "@/lib/pos-sound";
import type { InvoiceTemplateConfig } from "@/lib/invoice";
import type { CatalogItemDTO, InvoiceTemplateDTO, Paginated, TransactionDTO } from "@/lib/types";

export type CartLine = { item: CatalogItemDTO; quantity: number }

/** Ada dialog/alert/sheet terbuka? Shortcut tidak boleh mencuri tombol (Esc tetap natural via Radix). */
function anyOverlayOpen(): boolean {
  return !!document.querySelector('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]')
}

/** Ambil item katalog AKTIF berdasarkan id — paginasi sampai semua id ditemukan (umumnya 1 halaman). */
async function fetchActiveItems(ids: Set<string>): Promise<Map<string, CatalogItemDTO>> {
  const found = new Map<string, CatalogItemDTO>()
  let page = 1
  for (let guard = 0; guard < 30; guard++) {
    const res = await api.get<Paginated<CatalogItemDTO>>(`/api/catalog?status=ACTIVE&pageSize=100&page=${page}`)
    for (const item of res.data) {
      if (ids.has(item.id) && !found.has(item.id)) found.set(item.id, item)
    }
    if (found.size >= ids.size || page >= res.totalPages) break
    page += 1
  }
  return found
}

export default function PosView() {
  const { user } = useApp()
  const tenantId = user.tenant?.id ?? null
  const [cart, setCart] = useState<CartLine[]>([])
  /* Tab POS di layar < lg (ponsel/tablet): satu instance CatalogPanel & CartPanel
     dipasang sekali — visibilitas via CSS. Lebih ringan daripada memasang dua
     instance (fetch katalog ganda) dan searchInputRef selalu menunjuk input yang
     terlihat. Di layar ≥ lg tab disembunyikan: katalog + keranjang berdampingan. */
  const [posTab, setPosTab] = useState<"catalog" | "cart">("catalog")
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [discount, setDiscount] = useState(0)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successTx, setSuccessTx] = useState<TransactionDTO | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [templateConfig, setTemplateConfig] = useState<InvoiceTemplateConfig | null>(null)
  const [customersVersion, setCustomersVersion] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Sesi kasir (shift) — total live di-refresh setelah checkout sukses + poll 30 dtk.
  const shift = useShift()
  // Toko mewajibkan shift aktif & kasir belum buka shift → tombol Bayar terkunci
  // (server tetap menjaga dengan guard SHIFT_REQUIRED 409 — ini lapisan UX).
  const payLocked = shift.requireActiveShift && !shift.session

  /* Feedback visual "item masuk keranjang": chip melayang singkat + badge tab
     Keranjang memantul. Penting di ponsel/tablet (keranjang tak terlihat saat
     berada di tab Katalog) dan saat scan barcode. */
  const [addedFlash, setAddedFlash] = useState<{ name: string; qty: number; n: number } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashAdded = useCallback((name: string, qty: number) => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setAddedFlash({ name, qty, n: Date.now() })
    flashTimer.current = setTimeout(() => setAddedFlash(null), 1400)
    playCartTick() // bunyi konfirmasi singkat (bisa dimatikan di Pengaturan → Preferensi)
  }, [])
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  // Parkir keranjang (localStorage per tenant).
  const parked = useParkedCarts(tenantId)
  const [parkDialogOpen, setParkDialogOpen] = useState(false)
  const [resumeTarget, setResumeTarget] = useState<ParkedCart | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ParkedCart | null>(null)
  const [resuming, setResuming] = useState(false)

  // Template default untuk print nota.
  useEffect(() => {
    api
      .get<{ data: InvoiceTemplateDTO[] }>("/api/invoice-templates")
      .then((res) => {
        const def = res.data.find((t) => t.isDefault) ?? res.data[0]
        if (def) setTemplateConfig(def.config)
      })
      .catch(() => undefined)
  }, [])

  const openCheckout = useCallback(() => {
    if (payLocked) {
      toast.error("Shift wajib aktif sebelum transaksi. Buka shift dahulu di halaman Kasir.")
      return
    }
    setIdempotencyKey(crypto.randomUUID())
    setCheckoutOpen(true)
  }, [payLocked])

  // Shortcut global kasir: "/" & F2 fokus pencarian, F4 parkir keranjang, F8/Ctrl+Enter bayar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable === true
      const overlayOpen = anyOverlayOpen()

      if (overlayOpen) return // dialog menangani tombolnya sendiri (Esc tetap bekerja)

      if ((e.key === "/" || e.key === "F2") && !typing) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (e.key === "F4") {
        e.preventDefault()
        if (cart.length > 0) setParkDialogOpen(true)
        return
      }
      if (e.key === "F8" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        if (cart.length > 0 && !submitting) openCheckout()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cart.length, submitting, openCheckout])

  const addToCart = useCallback((item: CatalogItemDTO, qty = 1) => {
    if (item.type === "PRODUCT" && item.stockQty <= 0) {
      toast.error(`Stok ${item.name} habis.`)
      return
    }
    const existing = cart.find((l) => l.item.id === item.id)
    if (existing) {
      const nextQty = Math.round((existing.quantity + qty) * 1000) / 1000
      if (item.type === "PRODUCT" && nextQty > item.stockQty) {
        toast.error(`Stok ${item.name} hanya ${item.stockQty} ${item.unit}.`)
        return
      }
      setCart((prev) => prev.map((l) => (l.item.id === item.id ? { ...l, quantity: nextQty } : l)))
    } else {
      setCart((prev) => [...prev, { item, quantity: qty }])
    }
    flashAdded(item.name, qty)
  }, [cart, flashAdded])

  const setQty = useCallback((itemId: string, qty: number) => {
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.item.id !== itemId)
        : prev.map((l) => (l.item.id === itemId ? { ...l, quantity: Math.round(qty * 1000) / 1000 } : l))
    )
  }, [])

  const removeLine = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== itemId))
  }, [])

  const subtotal = useMemo(() => cart.reduce((s, l) => s + Math.round(l.quantity * l.item.sellingPrice), 0), [cart])
  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart])

  // Badge Keranjang "pop" saat jumlah bertambah (setelah cartCount terdefinisi).
  const prevCountRef = useRef(0)
  const [popKey, setPopKey] = useState(0)
  useEffect(() => {
    if (cartCount > prevCountRef.current) setPopKey(Date.now())
    prevCountRef.current = cartCount
  }, [cartCount])
  async function handleCheckout(payload: {
    paymentMethod: string
    paidAmount: number
    taxAmount: number
    notes: string | null
  }) {
    setSubmitting(true)
    try {
      const res = await api.post<{ transaction: TransactionDTO; idempotentReplay: boolean }>("/api/transactions", {
        items: cart.map((l) => ({ catalogItemId: l.item.id, quantity: l.quantity })),
        customerId,
        discountAmount: discount,
        taxAmount: payload.taxAmount,
        paymentMethod: payload.paymentMethod,
        paidAmount: payload.paidAmount,
        notes: payload.notes,
        idempotencyKey,
      })
      // SUKSES → baru bersihkan keranjang + refresh total live shift.
      setSuccessTx(res.transaction)
      playCheckoutSuccess()
      setCart([])
      setCustomerId(null)
      setDiscount(0)
      setCheckoutOpen(false)
      void shift.refetch()
      if (!res.idempotentReplay) {
        toast.success(`Transaksi ${res.transaction.invoiceNumber} berhasil disimpan.`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  function startNewTransaction() {
    setSuccessTx(null)
    setIdempotencyKey("")
    setPosTab("catalog") // ponsel/tablet: mulai transaksi baru dari katalog
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  /* Navigasi keyboard tablist (roving tabindex) — Arrow/Home/End pindah tab. */
  const onTablistKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const tabs = ["catalog", "cart"] as const
      const idx = tabs.indexOf(posTab)
      let next = -1
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length
      else if (e.key === "Home") next = 0
      else if (e.key === "End") next = tabs.length - 1
      if (next < 0) return
      e.preventDefault()
      setPosTab(tabs[next])
      document.getElementById(`pos-tab-${tabs[next]}`)?.focus()
    },
    [posTab]
  )

  /* ------------------------- Parkir keranjang ------------------------- */

  function parkCurrentCart(label: string, silent = false): boolean {
    if (!tenantId || !cart.length) return false
    const snapshot: ParkedCart = {
      id: crypto.randomUUID(),
      label: label.trim() || `Pelanggan ${parked.carts.length + 1}`,
      lines: cart.map((l) => ({
        itemId: l.item.id,
        name: l.item.name,
        qty: l.quantity,
        unitPrice: l.item.sellingPrice,
        unit: l.item.unit,
        type: l.item.type,
      })),
      customerId,
      discount,
      parkedAt: new Date().toISOString(),
    }
    const ok = appendParkedCart(tenantId, snapshot)
    if (!ok) {
      toast.error("Gagal menyimpan keranjang tertahan — penyimpanan browser bermasalah.")
      return false
    }
    setCart([])
    setCustomerId(null)
    setDiscount(0)
    // Pengguna baru saja memarkir keranjang pertama — tips parkir tidak
    // diperlukan lagi (fitur sudah ditemukan).
    dismissParkedCartTip()
    if (!silent) toast.success(`Keranjang ditahan sebagai "${snapshot.label}".`)
    return true
  }

  function handleRequestResume(pc: ParkedCart) {
    if (resuming) return
    if (cart.length > 0) setResumeTarget(pc)
    else void performResume(pc, false)
  }

  async function performResume(pc: ParkedCart, parkCurrentFirst: boolean) {
    if (!tenantId || resuming) return
    if (parkCurrentFirst && cart.length > 0) {
      parkCurrentCart(`Pelanggan ${parked.carts.length + 1}`, true)
    }
    setResuming(true)
    try {
      // Petakan ulang ke katalog aktif terkini — item yang hilang dibuang.
      const items = await fetchActiveItems(new Set(pc.lines.map((l) => l.itemId)))
      const lines: CartLine[] = []
      const dropped: string[] = []
      for (const line of pc.lines) {
        const item = items.get(line.itemId)
        if (item) lines.push({ item, quantity: line.qty })
        else dropped.push(line.name)
      }
      if (!lines.length) {
        toast.error(`Keranjang "${pc.label}" tidak bisa dilanjutkan — semua itemnya sudah tidak tersedia.`)
        return // pertahankan di daftar agar pengguna bisa menghapus sendiri
      }
      removeParkedCart(tenantId, pc.id)
      setCart(lines)
      setCustomerId(pc.customerId)
      setDiscount(pc.discount)
      if (dropped.length) {
        toast.warning(`Keranjang "${pc.label}" dilanjutkan. Item tidak tersedia dibuang: ${dropped.join(", ")}.`)
      } else {
        toast.success(`Keranjang "${pc.label}" dilanjutkan.`)
      }
    } catch {
      toast.error("Gagal mengambil keranjang. Periksa koneksi lalu coba lagi.")
    } finally {
      setResuming(false)
    }
  }

  const defaultParkLabel = `Pelanggan ${parked.carts.length + 1}`

  const cartPanel = (
    <CartPanel
      cart={cart}
      subtotal={subtotal}
      discount={discount}
      setDiscount={setDiscount}
      customerId={customerId}
      setCustomerId={setCustomerId}
      customersVersion={customersVersion}
      onCustomersChanged={() => setCustomersVersion((v) => v + 1)}
      onSetQty={setQty}
      onRemove={removeLine}
      onCheckout={openCheckout}
      disabled={cart.length === 0}
      payLocked={payLocked}
      parkedCarts={parked.carts}
      onPark={() => setParkDialogOpen(true)}
      onResumeParked={handleRequestResume}
      onDeleteParked={(pc) => setDeleteTarget(pc)}
    />
  )

  return (
    <div className="max-w-[1600px] mx-auto">
      <ShiftBanner shift={shift} />

      {successTx ? (
        <PosSuccess
          transaction={successTx}
          config={templateConfig}
          store={user.tenant!}
          onNewTransaction={startNewTransaction}
        />
      ) : (
        <>
          {/* ---------- SATU LAYOUT UNTUK SEMUA UKURAN LAYAR ----------
              < lg: segmented control Katalog ↔ Keranjang (sticky di bawah topbar).
              ≥ lg: dua kolom berdampingan, tab disembunyikan. Panel tetap terpasang
              (hanya disembunyikan CSS) — nol fetch ganda, ref pencarian konsisten. */}
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:gap-5 lg:items-start">
            {/* Segmented control — ponsel/tablet; sticky agar bisa berpindah tab
                kapan pun tanpa scroll ke atas. */}
            <div className="sticky top-14 z-10 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-2 -mt-1 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 lg:hidden">
              <div
                role="tablist"
                aria-label="Mode kasir"
                onKeyDown={onTablistKeyDown}
                className="grid grid-cols-2 bg-muted text-muted-foreground rounded-lg p-[3px]"
              >
                <button
                  type="button"
                  role="tab"
                  id="pos-tab-catalog"
                  aria-selected={posTab === "catalog"}
                  aria-controls="pos-panel-catalog"
                  data-state={posTab === "catalog" ? "active" : "inactive"}
                  tabIndex={posTab === "catalog" ? 0 : -1}
                  onClick={() => setPosTab("catalog")}
                  className={cn(
                    "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground",
                    "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[2px] focus-visible:outline-1 data-[state=active]:shadow-sm active:scale-[0.97]"
                  )}
                >
                  <ScanBarcode className="size-4" aria-hidden="true" />
                  Katalog
                </button>
                <button
                  type="button"
                  role="tab"
                  id="pos-tab-cart"
                  aria-selected={posTab === "cart"}
                  aria-controls="pos-panel-cart"
                  data-state={posTab === "cart" ? "active" : "inactive"}
                  tabIndex={posTab === "cart" ? 0 : -1}
                  onClick={() => setPosTab("cart")}
                  className={cn(
                    "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground",
                    "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[2px] focus-visible:outline-1 data-[state=active]:shadow-sm active:scale-[0.97]"
                  )}
                >
                  <ShoppingCart className="size-4" aria-hidden="true" />
                  Keranjang
                  {cartCount > 0 && (
                    <span
                      key={popKey}
                      className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 tabular min-w-5 sb-pop"
                    >
                      {Math.round(cartCount * 100) / 100}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Panel katalog — terlihat saat tab Katalog aktif (< lg) / selalu (≥ lg) */}
            <div
              role="tabpanel"
              id="pos-panel-catalog"
              aria-labelledby="pos-tab-catalog"
              className={cn("min-w-0 outline-none max-lg:mt-2", posTab === "catalog" ? "block" : "hidden", "lg:block")}
            >
              <CatalogPanel searchInputRef={searchInputRef} onAdd={addToCart} />
            </div>

            {/* Panel keranjang — sticky di layar lebar */}
            <div
              role="tabpanel"
              id="pos-panel-cart"
              aria-labelledby="pos-tab-cart"
              className={cn("outline-none max-lg:mt-2 lg:sticky lg:top-20", posTab === "cart" ? "block" : "hidden", "lg:block")}
            >
              {cartPanel}
            </div>
          </div>
        </>
      )}

      {/* Chip konfirmasi "masuk keranjang" — muncul singkat lalu memudar.
          PORTAL ke body: leluhur .sb-fade-in menjadikan containing block untuk
          position:fixed (transform identity-matrix tersisa dari animasi) —
          tanpa portal, chip tertambat di dasar konten panjang, bukan viewport. */}
      {addedFlash &&
        createPortal(
          <div
            key={addedFlash.n}
            className="fixed bottom-[4.75rem] lg:bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-none no-print"
            role="status"
            aria-live="polite"
          >
            <div className="sb-added-chip flex items-center gap-2 rounded-full bg-primary text-primary-foreground pl-3 pr-4 py-2 shadow-lg text-sm font-medium">
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="max-w-[55vw] truncate">
                {addedFlash.qty > 1 ? `${formatQty(addedFlash.qty)} × ` : ""}
                {addedFlash.name}
              </span>
            </div>
          </div>,
          document.body
        )}

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        subtotal={subtotal}
        discount={discount}
        submitting={submitting}
        onSubmit={handleCheckout}
      />

      {/* Dialog parkir keranjang */}
      <ParkCartDialog
        open={parkDialogOpen}
        onOpenChange={setParkDialogOpen}
        defaultLabel={defaultParkLabel}
        itemCount={cart.length}
        onSubmit={(label) => {
          parkCurrentCart(label)
          setParkDialogOpen(false)
        }}
      />
      <ResumeConfirmDialog
        target={resumeTarget}
        onOpenChange={() => setResumeTarget(null)}
        onChoose={(parkCurrentFirst) => {
          const target = resumeTarget
          setResumeTarget(null)
          if (target) void performResume(target, parkCurrentFirst)
        }}
      />
      <DeleteParkedDialog
        target={deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (tenantId && deleteTarget) {
            removeParkedCart(tenantId, deleteTarget.id)
            toast.success(`Keranjang tertahan "${deleteTarget.label}" dihapus.`)
          }
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}
