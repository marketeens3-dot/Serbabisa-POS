// POS / Kasir — layout utama: banner shift (atas), katalog (kiri) + keranjang
// (kanan). Mobile ala referensi: satu halaman gulir — header brand + sapaan,
// kartu shift/penjualan, katalog, dan keranjang sebagai sheet melayang di atas
// bar "Menu | Bayar Sekanang" + bottom nav. Keranjang baru dikosongkan HANYA
// setelah RPC sukses (gagal → keranjang tetap agar bisa diperbaiki).
// Shortcut kasir: F2 "/" / Ctrl+K fokus cari · F4 parkir keranjang · F8 / Ctrl+Enter bayar.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ArrowRight, Bell, CreditCard, Plus, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";
import { CatalogPanel } from "@/components/user/pos/catalog-panel";
import { CartPanel } from "@/components/user/pos/cart-panel";
import { CheckoutDialog } from "@/components/user/pos/checkout-dialog";
import { PosSuccess } from "@/components/user/pos/pos-success";
import { ShiftBanner } from "@/components/user/pos/shift-banner";
import { UserMenu } from "@/components/app/user-menu";
import SyncIndicator from "@/components/app/sync-indicator";
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
import {
  lineDiscount,
  lineGross,
  productLineDiscount,
  type CartLine,
} from "@/components/user/pos/cart-math";
import { dismissParkedCartTip } from "@/components/user/pos/parked-cart-tip";
import { loadPinnedDiscount, savePinnedDiscount } from "@/components/user/pos/pinned-discount";
import { useApp } from "@/components/app/app-context";
import { useIsBelowLg } from "@/hooks/use-mobile";
import { api } from "@/lib/api-client";
import { formatIDR, formatPercentID, formatQty } from "@/lib/format";
import { playCartTick, playCheckoutSuccess } from "@/lib/pos-sound";
import type { InvoiceTemplateConfig } from "@/lib/invoice";
import type { CatalogItemDTO, InvoiceTemplateDTO, Paginated, TransactionDTO } from "@/lib/types";

export type { CartLine } from "@/components/user/pos/cart-math";

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
  const { user, navigate, logout, stockAlertCount } = useApp()
  const isBelowLg = useIsBelowLg()
  const tenantId = user.tenant?.id ?? null
  // Maskot sapaan: false = coba muat /public/mascot/<tenantId>.png (ada → gambar
  // maskot toko, khusus Platter Tea saat ini); true / tanpa tenant → emoji blob.
  const [mascotFailed, setMascotFailed] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  /* Diskon transaksi: mode "rp" (nominal manual) atau "pct" (persen diterapkan ke
     SELURUH item di keranjang — otomatis jadi harga diskon). discountInput = nilai
     mentah sesuai mode; discount (turunan) = nominal Rp efektif yang dikirim server. */
  const [discountMode, setDiscountMode] = useState<"rp" | "pct">("rp")
  const [discountInput, setDiscountInput] = useState(0)
  /* Tombol DISKON TETAP (pin): saat aktif, mode + nilai diskon dipertahankan
     lintas transaksi, parkir, dan reload halaman (localStorage per tenant) —
     kasir promo (mis. member 10%) tidak perlu input ulang tiap nota. */
  const [discountPinned, setDiscountPinned] = useState(false)
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

  // Pulihkan diskon tersemat begitu tenant diketahui — berlaku juga setelah reload.
  useEffect(() => {
    if (!tenantId) return
    const pinned = loadPinnedDiscount(tenantId)
    if (pinned) {
      setDiscountMode(pinned.mode)
      setDiscountInput(pinned.value)
      setDiscountPinned(true)
    }
  }, [tenantId])

  // Saat pin aktif, setiap perubahan diskon langsung tersimpan — termasuk
  // hasil resume keranjang parkir yang membawa diskonnya sendiri.
  useEffect(() => {
    if (!tenantId || !discountPinned) return
    savePinnedDiscount(tenantId, { mode: discountMode, value: discountInput })
  }, [tenantId, discountPinned, discountMode, discountInput])

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
      // Ctrl/Cmd+K — ala desain referensi (badge "Ctrl + K" di kolom cari).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !typing) {
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
      // Diskon default dari master produk (Rp/unit) — ikut otomatis ke keranjang.
      setCart((prev) => [...prev, { item, quantity: qty, ...productLineDiscount(item) }])
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

  // Diskon per produk (per baris keranjang) — persen atau nominal Rp.
  // Mengubah lewat chip = override manual (lepas dari master produk).
  const setLineDiscount = useCallback((itemId: string, mode: "rp" | "pct", value: number) => {
    setCart((prev) =>
      prev.map((l) =>
        l.item.id === itemId
          ? { ...l, discountMode: mode, discountValue: value, discountFromProduct: false }
          : l
      )
    )
  }, [])

  const subtotal = useMemo(() => cart.reduce((s, l) => s + lineGross(l), 0), [cart])
  // Total diskon per produk (Σ diskon baris) — dipisah dari diskon transaksi.
  const itemDiscountTotal = useMemo(() => cart.reduce((s, l) => s + lineDiscount(l), 0), [cart])
  // Nominal diskon transaksi efektif (Rp): mode % dibulatkan ke bawah — rumus SAMA
  // dengan server (floor(subtotalNet × pct / 100)) agar angka di layar = angka di
  // nota = angka di database. Basis persen = subtotal NET (setelah diskon per item).
  const discount = useMemo(
    () =>
      discountMode === "pct"
        ? Math.floor(((subtotal - itemDiscountTotal) * discountInput) / 100)
        : discountInput,
    [discountMode, discountInput, subtotal, itemDiscountTotal]
  )
  const discountPercentSent = discountMode === "pct" ? discountInput : 0

  async function handleCheckout(payload: {
    paymentMethod: string
    paidAmount: number
    taxAmount: number
    notes: string | null
    voucherCode: string | null
    projectId: string | null
    dueDays?: number
  }) {
    setSubmitting(true)
    try {
      const res = await api.post<{ transaction: TransactionDTO; idempotentReplay: boolean }>("/api/transactions", {
        items: cart.map((l) => ({
          catalogItemId: l.item.id,
          quantity: l.quantity,
          // Diskon per item: kirim nominal EFEKTIF baris (diskon produk ikut
          // qty sudah dihitung lineDiscount) — server validasi ulang batasnya.
          discountPercent: l.discountMode === "pct" ? l.discountValue : 0,
          discountAmount: l.discountMode === "rp" ? lineDiscount(l) : 0,
        })),
        customerId,
        discountAmount: discount,
        discountPercent: discountPercentSent,
        taxAmount: payload.taxAmount,
        paymentMethod: payload.paymentMethod,
        paidAmount: payload.paidAmount,
        notes: payload.notes,
        voucherCode: payload.voucherCode,
        projectId: payload.projectId,
        dueDays: payload.dueDays,
        idempotencyKey,
      })
      // SUKSES → baru bersihkan keranjang + refresh total live shift.
      setSuccessTx(res.transaction)
      playCheckoutSuccess()
      setCart([])
      setCustomerId(null)
      // Diskon tetap aktif → pertahankan nilai untuk transaksi berikutnya.
      if (!discountPinned) {
        setDiscountMode("rp")
        setDiscountInput(0)
      }
      setCheckoutOpen(false)
      void shift.refetch()
      if (!res.idempotentReplay) {
        toast.success(`Transaksi ${res.transaction.invoiceNumber} berhasil disimpan.`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  /* Toggle tombol "Tetap": menyematkan nilai diskon saat ini (bila > 0) agar
     otomatis terpakai lagi di transaksi berikutnya. */
  const toggleDiscountPinned = useCallback(() => {
    if (!tenantId) return
    const next = !discountPinned
    setDiscountPinned(next)
    if (next) {
      savePinnedDiscount(tenantId, { mode: discountMode, value: discountInput })
      if (discountInput > 0) {
        const label = discountMode === "pct" ? formatPercentID(discountInput) : formatIDR(discountInput)
        toast.success(`Diskon ${label} disematkan — otomatis dipakai untuk transaksi berikutnya.`)
      } else {
        toast.info("Diskon tetap aktif — isi nilainya, otomatis tersimpan untuk transaksi berikutnya.")
      }
    } else {
      savePinnedDiscount(tenantId, null)
      toast.info("Diskon tetap dilepas — diskon kembali kosong setelah transaksi.")
    }
  }, [tenantId, discountPinned, discountMode, discountInput])

  /* "Hapus" diskon transaksi: sekalian melepas pin — kasir yang sengaja
     mengosongkan diskon tidak mengharapkan nilai lama muncul lagi nanti. */
  const clearDiscount = useCallback(() => {
    setDiscountInput(0)
    if (discountPinned && tenantId) {
      setDiscountPinned(false)
      savePinnedDiscount(tenantId, null)
    }
  }, [discountPinned, tenantId])

  function startNewTransaction() {
    setSuccessTx(null)
    setIdempotencyKey("")
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

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
        discountMode: l.discountMode,
        discountValue: l.discountValue,
        discountFromProduct: l.discountFromProduct ?? false,
      })),
      customerId,
      discount,
      discountPct: discountPercentSent,
      parkedAt: new Date().toISOString(),
    }
    const ok = appendParkedCart(tenantId, snapshot)
    if (!ok) {
      toast.error("Gagal menyimpan keranjang tertahan — penyimpanan browser bermasalah.")
      return false
    }
    setCart([])
    setCustomerId(null)
    // Diskon tetap aktif → pertahankan nilai untuk keranjang berikutnya.
    if (!discountPinned) {
      setDiscountMode("rp")
      setDiscountInput(0)
    }
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
        if (item)
          lines.push({
            item,
            quantity: line.qty,
            // Parkiran lama (sebelum fitur diskon) tidak punya field ini.
            discountMode: line.discountMode ?? "rp",
            discountValue: line.discountValue ?? 0,
            discountFromProduct: line.discountFromProduct ?? false,
          })
        else dropped.push(line.name)
      }
      if (!lines.length) {
        toast.error(`Keranjang "${pc.label}" tidak bisa dilanjutkan — semua itemnya sudah tidak tersedia.`)
        return // pertahankan di daftar agar pengguna bisa menghapus sendiri
      }
      removeParkedCart(tenantId, pc.id)
      setCart(lines)
      setCustomerId(pc.customerId)
      // Pulihkan diskon: prioritas mode % bila tersimpan (fidelitas UX);
      // parkir lama tanpa discountPct kembali sebagai nominal Rp.
      if (pc.discountPct && pc.discountPct > 0) {
        setDiscountMode("pct")
        setDiscountInput(pc.discountPct)
      } else {
        setDiscountMode("rp")
        setDiscountInput(pc.discount)
      }
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
      itemDiscountTotal={itemDiscountTotal}
      discount={discount}
      discountMode={discountMode}
      discountInput={discountInput}
      setDiscountMode={setDiscountMode}
      setDiscountInput={setDiscountInput}
      discountPinned={discountPinned}
      onToggleDiscountPinned={toggleDiscountPinned}
      onClearDiscount={clearDiscount}
      customerId={customerId}
      setCustomerId={setCustomerId}
      customersVersion={customersVersion}
      onCustomersChanged={() => setCustomersVersion((v) => v + 1)}
      onSetQty={setQty}
      onRemove={removeLine}
      onSetLineDiscount={setLineDiscount}
      onCheckout={openCheckout}
      disabled={cart.length === 0}
      payLocked={payLocked}
      parkedCarts={parked.carts}
      onPark={() => setParkDialogOpen(true)}
      onResumeParked={handleRequestResume}
      onDeleteParked={(pc) => setDeleteTarget(pc)}
      mobileSheet={isBelowLg}
    />
  )

  return (
    // pb mobile: 128px — menutup bar Bayar melayang (48px @ 70.4px) + bottom
    // nav (64px) + safe-area, agar kartu katalog terakhir tak tertutup tombol.
    <div className="max-w-[1600px] mx-auto max-lg:pb-32">
      {/* ---------- Header mobile ala referensi: brand + sapaan + notifikasi ---------- */}
      <header className="lg:hidden mb-4">
        <div className="flex items-center gap-2.5">
          {/* Logo TOKO (diunggah dari Pengaturan → profil toko); tanpa logo →
              fallback ke logo Serbabisa. */}
          {user.tenant?.logoUrl ? (
            <img
              src={user.tenant.logoUrl}
              alt={`Logo ${user.tenant.businessName ?? "toko"}`}
              className="size-9 rounded-lg object-cover shrink-0 ring-1 ring-border/60"
            decoding="async"
            />
          ) : (
            <img src="/logo-icon.png" alt="" className="h-9 w-auto" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-lg tracking-tight leading-tight truncate">
              {user.tenant?.businessName ?? "Serbabisa"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">Transaksi cepat, lebih mudah</p>
          </div>
          <SyncIndicator />
          <StockAlertBell navigate={navigate} alertCount={stockAlertCount} />
          <UserMenu
            user={user}
            onProfile={() => navigate("/app/profile")}
            onLogout={logout}
            isAdmin={user.role === "SUPER_ADMIN"}
            showThemeItem
          />
        </div>
        <div className="relative mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-extrabold tracking-tight">Selamat Datang!</h1>
            <p className="text-sm text-muted-foreground mt-1">Semangat berjualan hari ini 💪</p>
          </div>
          {/* Maskot sapaan: tenant dengan aset maskot (/public/mascot/<tenantId>.png)
              memakai gambar khusus — Platter Tea punya maskot gelas melambai "Hai!".
              Tenant lain (tanpa file) → fallback emoji dalam blob pastel + gelembung
              keranjang. aria-hidden: murni dekoratif. */}
          <div className="relative shrink-0 flex items-start" aria-hidden="true">
            {user.tenant && !mascotFailed ? (
              <img
                key={user.tenant.id}
                src={`/mascot/${user.tenant.id}.png`}
                alt=""
                onError={() => setMascotFailed(true)}
                className="size-20 -mr-1 object-contain object-bottom drop-shadow-sm"
                draggable={false}
              />
            ) : (
              <>
                <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center text-4xl rotate-6">
                  🧋
                </div>
                <div className="absolute -bottom-1.5 -left-2.5 size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md">
                  <ShoppingCart className="size-3.5" />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

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
              < lg: satu halaman gulir — katalog penuh, keranjang jadi sheet melayang
              di atas bar Menu/Bayar (selalu terlihat, tanpa tab).
              ≥ lg: dua kolom berdampingan, keranjang sticky. Panel terpasang sekali
              — nol fetch ganda, ref pencarian konsisten. */}
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:gap-5 lg:items-start">
            <div className="min-w-0">
              <CatalogPanel searchInputRef={searchInputRef} onAdd={addToCart} />
            </div>

            {/* Keranjang. MOBILE: PORTAL ke body — leluhur .sb-fade-in (animation
                fill both) menjadi containing block position:fixed, sehingga sheet
                tertambat di dasar KONTEN, bukan viewport (bug yang sama dengan
                chip "masuk keranjang" di bawah). Desktop: kolom kanan sticky.
                Satu instance saja — dipilih lewat breakpoint hook, nol fetch ganda. */}
            {isBelowLg ? (
              createPortal(
                // bottom tepat di atas bar Menu/Bayar (4.4rem + 48px + safe-area):
                // tanpa celah, agar konten katalog tidak "terselip" di antara
                // sheet dan bar.
                <div
                  className="fixed inset-x-3 z-30 no-print bottom-[calc(7.4rem+env(safe-area-inset-bottom))]"
                >
                  {cartPanel}
                </div>,
                document.body
              )
            ) : (
              <div className="outline-none lg:sticky lg:top-20">{cartPanel}</div>
            )}
          </div>

          {/* ---------- Bar aksi bawah (mobile ala referensi): Bayar Sekarang.
              Tombol "Menu" pindah ke bottom nav (ujung kanan, sebelah Pengaturan)
              — bar ini khusus aksi keranjang. Keranjang KOSONG: pill status ringan
              menggantikan tombol Bayar besar yang disabled.
              PORTAL ke body — alasan sama dengan sheet keranjang di atas. */}
          {createPortal(
            <div
              className="fixed inset-x-3 bottom-[4.4rem] z-40 flex items-center gap-2 lg:hidden no-print"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {cart.length === 0 ? (
                <div
                  className="flex-1 h-12 rounded-full border border-border/60 bg-card/95 backdrop-blur-xl px-4 flex items-center gap-2.5 shadow-md text-sm text-muted-foreground"
                  role="status"
                >
                  <ShoppingCart className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">Keranjang kosong — pilih produk untuk mulai</span>
                </div>
              ) : (
                <Button
                  className="flex-1 h-12 rounded-full text-base font-bold gap-2 shadow-lg shadow-primary/25 active:scale-[0.98]"
                  disabled={submitting || discount > subtotal - itemDiscountTotal || payLocked}
                  onClick={openCheckout}
                  title={payLocked ? "Terkunci — mulai shift terlebih dahulu untuk menerima pembayaran" : undefined}
                  aria-label={`Bayar Sekarang — ${formatIDR(Math.max(0, subtotal - itemDiscountTotal - discount))}`}
                >
                  <CreditCard className="size-4.5" aria-hidden="true" />
                  Bayar Sekarang
                  <ArrowRight className="size-4.5" aria-hidden="true" />
                </Button>
              )}
            </div>,
            document.body
          )}
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
            className="fixed top-[4.75rem] left-1/2 -translate-x-1/2 lg:top-auto lg:bottom-8 z-40 pointer-events-none no-print"
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
        itemDiscountTotal={itemDiscountTotal}
        discount={discount}
        discountPercent={discountPercentSent}
        submitting={submitting}
        hasCustomer={!!customerId}
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

/* ---------- Lonceng notifikasi (header mobile POS) ----------
   Lonceng = notifikasi sungguhan, bukan navigasi diam-diam: klik membuka
   popover berisi daftar produk yang stoknya menyentuh ambang minimum
   (endpoint ringan /api/catalog/stock-alerts, cache 2 menit) + pintasan ke
   halaman Stok. Tanpa peringatan → state kosong yang jujur. */
type StockAlertEntry = { id: string; name: string; stockQty: number; minStockQty: number; unit: string }

function StockAlertBell({ navigate, alertCount }: { navigate: (p: string) => void; alertCount: number }) {
  const [open, setOpen] = useState(false)
  const { data, loading } = useApi<{ data: StockAlertEntry[]; count: number }>(
    open ? "/api/catalog/stock-alerts" : null
  )
  const entries = data?.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative size-9 flex items-center justify-center rounded-full bg-card border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={alertCount > 0 ? `${alertCount} notifikasi stok menipis` : "Notifikasi"}
          aria-haspopup="dialog"
        >
          <Bell className="size-4.5" aria-hidden="true" />
          {alertCount > 0 && (
            <span
              className="absolute -top-1 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9.5px] font-bold leading-none flex items-center justify-center tabular-nums ring-2 ring-background"
              aria-hidden="true"
            >
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-sm font-semibold">Notifikasi</p>
        <p className="text-xs text-muted-foreground mb-2">Stok produk yang perlu diisi ulang.</p>
        {loading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/40 px-3 py-3 text-center">
            Tidak ada notifikasi — semua stok aman.
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto -mx-1 px-1">
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      navigate("/app/products/stok")
                    }}
                    className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors flex items-center gap-2"
                  >
                    <span className="size-1.5 rounded-full bg-red-500 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-xs font-medium block leading-tight truncate">{e.name}</span>
                      <span className="text-[11px] text-destructive block leading-tight tabular">
                        Stok {formatQty(e.stockQty)} {e.unit} · min {formatQty(e.minStockQty)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate("/app/products/stok")
            }}
            className="w-full mt-2 text-xs font-semibold text-primary text-center rounded-md py-1.5 hover:bg-primary/5 transition-colors"
          >
            Lihat semua di Stok →
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
