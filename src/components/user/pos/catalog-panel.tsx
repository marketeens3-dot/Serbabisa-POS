// Panel katalog POS: pencarian (barcode scanner-friendly), filter jenis/kategori,
// grid item dengan media pastel + emoji (mobile: kartu horizontal ala referensi).
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Flame, Info, Leaf, Plus, ScanBarcode, Search, SearchX, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QtyDialog } from "@/components/user/pos/qty-dialog";
import { LongPressTip, dismissLongPressTip, useLongPressTipVisible } from "@/components/user/pos/long-press-tip";
import { cn } from "@/lib/utils";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api } from "@/lib/api-client";
import { formatIDR, formatQty } from "@/lib/format";
import { ShortcutHints } from "@/components/user/pos/shortcut-hints";
import { itemEmoji, categoryEmoji } from "@/lib/catalog-visual";
import { usePastelFor } from "@/lib/use-pastel";
import { useApp } from "@/components/app/app-context";
import type { CatalogItemDTO, CategoryDTO, Paginated } from "@/lib/types";

type TypeFilter = "ALL" | "PRODUCT" | "SERVICE"
type TopSoldEntry = { item: CatalogItemDTO; soldQty: number }

/** Tekan-tahan kartu 500 ms → dialog jumlah (bukan +1). */
const LONG_PRESS_MS = 500

/* Tip "Enter" sekali per perangkat — dibaca lewat useSyncExternalStore (bukan
   state+effect) supaya bebas cascading render dan aman hydration: snapshot
   server selalu false, client membaca localStorage setelah mount. */
const TIP_ENTER_KEY = "sb-tip-enter"
function subscribeTipChange(cb: () => void) {
  const handler = () => cb()
  window.addEventListener("storage", handler) // perubahan dari tab lain
  window.addEventListener("sb-tip-change", handler) // perubahan di tab ini
  return () => {
    window.removeEventListener("storage", handler)
    window.removeEventListener("sb-tip-change", handler)
  }
}
function getTipEnterVisible(): boolean {
  try {
    return localStorage.getItem(TIP_ENTER_KEY) !== "1"
  } catch {
    return true // penyimpanan tak tersedia → tampilkan tanpa mengingat penutupan
  }
}

export function CatalogPanel({
  searchInputRef,
  onAdd,
}: {
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onAdd: (item: CatalogItemDTO, qty?: number) => void
}) {
  const pastel = usePastelFor()
  const [search, setSearch] = useState("")
  const [type, setType] = useState<TypeFilter>("ALL")
  const [categoryId, setCategoryId] = useState<string>("ALL")
  const [page, setPage] = useState(1)
  const { navigate } = useApp()

  // Tip "Enter" ala referensi — sekali tampil per perangkat, bisa ditutup,
  // dan hanya di tampilan default (tersembunyi saat sedang mencari).
  // Ditambah: disembunyikan selama tip tekan-tahan tampil — dua banner tips
  // menumpuk terlalu banyak di layar ponsel; tampilkan satu per satu.
  const enterTipVisible = useSyncExternalStore(subscribeTipChange, getTipEnterVisible, () => false)
  const longPressTipVisible = useLongPressTipVisible()
  function dismissEnterTip() {
    try {
      localStorage.setItem(TIP_ENTER_KEY, "1")
    } catch {
      // abaikan — tip tetap ditutup untuk sesi ini
    }
    window.dispatchEvent(new Event("sb-tip-change"))
  }
  // Akumulasi item dari semua halaman yang sudah dimuat (fold-on-arrival,
  // lihat komentar di bawah). Menggantikan pola lama "salin data lama saat
  // klik" yang ber-RACE: saat fetch berikutnya berjalan, data masih halaman
  // lama → render transien menampilkan item GANDA (key duplikat) →
  // rekonsiliasi React meninggalkan node DOM basi yang menumpuk.
  const [appended, setAppended] = useState<CatalogItemDTO[]>([])
  // Penanda halaman terakhir yang sudah dilipat (identitas objek hasil fetch).
  const [foldedData, setFoldedData] = useState<Paginated<CatalogItemDTO> | null>(null)

  const debouncedSearch = useDebounced(search, 300)
  const { data: categories } = useApi<{ data: CategoryDTO[] }>("/api/categories")
  // Item terlaris 30 hari — baris cepat "Sering dijual" (cache server 5 menit).
  const { data: topSold } = useApi<{ data: TopSoldEntry[] }>("/api/catalog/top-sold")

  /* Tekan-tahan kartu produk & chip "Sering dijual" → dialog input jumlah.
     Timer dibatalkan bila jari/pointer bergerak keluar atau diangkat sebelum
     500 ms (ketukan biasa tetap menjadi +1). Flag longPressed mencegah click
     yang menyusul dialog. pressId menyalakan bar progres tipis di elemen yang
     sedang ditahan — umpan balik visual bahwa tahan = aksi, bukan macet. */
  const [qtyTarget, setQtyTarget] = useState<CatalogItemDTO | null>(null)
  const [pressId, setPressId] = useState<string | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const startPress = useCallback((item: CatalogItemDTO) => {
    longPressed.current = false
    setPressId(item.id)
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      setPressId(null)
      setQtyTarget(item)
      // Pengguna baru saja menemukan tekan-tahan — tips tidak diperlukan lagi.
      dismissLongPressTip()
    }, LONG_PRESS_MS)
  }, [])
  const cancelPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
    setPressId(null)
  }, [])
  useEffect(() => cancelPress, [cancelPress])

  const query = new URLSearchParams({
    ...(type !== "ALL" ? { type } : {}),
    search: debouncedSearch,
    ...(categoryId !== "ALL" ? { categoryId } : {}),
    status: "ACTIVE",
    pageSize: "36",
    page: String(page),
  }).toString()
  const { data, loading } = useApi<Paginated<CatalogItemDTO>>(`/api/catalog?${query}`)

  // Reset ke halaman 1 ketika filter berubah (pola adjust-state, tanpa effect).
  // Daftar akumulasi TIDAK di-reset: konten lama tetap tampil saat fetch baru
  // berjalan (tanpa kedipan kosong), lalu digantikan saat halaman 1 tiba.
  useResetOnKeyChange(`${debouncedSearch}|${type}|${categoryId}`, () => {
    setPage(1)
  })

  // Enter = barcode lookup (scanner keyboard-wedge mengetik kode + Enter) atau pilih hasil pertama.
  const handleSearchKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return
      const q = search.trim()
      if (!q) return
      e.preventDefault()
      // Pola kode barcode/SKU → lookup exact.
      if (/^[0-9A-Za-z-]{4,}$/.test(q)) {
        try {
          const res = await api.get<Paginated<CatalogItemDTO>>(`/api/catalog?barcode=${encodeURIComponent(q)}`)
          const item = res.data[0]
          if (item) {
            onAdd(item)
            setSearch("")
            return
          }
        } catch {
          // lanjut ke fallback pencarian
        }
      }
      // Fallback: tambahkan hasil pertama dari pencarian aktif.
      const first = (data?.data ?? [])[0]
      if (first) {
        onAdd(first)
        setSearch("")
      }
    },
    [search, data, onAdd]
  )

  // Lipat halaman yang BARU tiba ke daftar akumulasi — pola resmi "adjusting
  // state during render" (https://react.dev/learn/you-might-not-need-an-effect).
  // Identitas objek (bukan nilai) menentukan kebaruan: setiap hasil fetch diproses
  // tepat sekali — halaman 1 MENGGANTI daftar (filter/pencarian baru), halaman
  // berikutnya DITAMBAHKAN. Data basi yang sudah dilipat tidak diproses ulang.
  if (data && data !== foldedData) {
    setFoldedData(data)
    setAppended(data.page === 1 ? data.data : (prev) => [...prev, ...data.data])
  }

  const items = appended
  const canLoadMore = !!data && page < data.totalPages && !loading

  // Baris "Sering dijual" hanya relevan di tampilan default — disembunyikan
  // saat pengguna mencari / memfilter agar hasilnya bersih (min. 3 item).
  const showTopSold =
    (topSold?.data.length ?? 0) >= 3 && !debouncedSearch && type === "ALL" && categoryId === "ALL"

  function loadMore() {
    // Cukup naikkan halaman — useApi me-fetch halaman baru, lalu lipat ke
    // daftar saat tiba (fold-on-arrival di atas). Tanpa penyalinan manual
    // yang ber-RACE dengan data basi.
    setPage((p) => p + 1)
  }

  return (
    <div className="space-y-3">
      {/* Bar pencarian + tombol Scan (ala referensi) — scanner keyboard-wedge
          mengetik ke kolom ini, jadi "Scan" cukup memfokuskan kolom pencarian. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Cari produk / jasa / barcode…"
            className="pl-9.5 pr-14 h-11 text-base rounded-full bg-card shadow-sm"
            aria-label="Cari produk atau jasa"
            autoFocus
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Bersihkan pencarian"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : (
            <kbd className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Ctrl + K
            </kbd>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => searchInputRef.current?.focus()}
          className="h-11 rounded-full gap-1.5 px-4 border-primary/30 text-primary hover:bg-primary/5 shadow-sm shrink-0 font-semibold"
          aria-label="Mulai scan barcode — fokus ke kolom pencarian"
          title="Scanner barcode mengetik ke kolom pencarian — klik, lalu scan"
        >
          <ScanBarcode className="size-4" aria-hidden="true" />
          Scan
        </Button>
      </div>

      {/* Banner tip biru ala referensi — kontekstual, sekali per perangkat, dan
          hanya SATU banner tips pada satu waktu (tip tekan-tahan menang). */}
      {enterTipVisible && !search && !longPressTipVisible && (
        <div
          className="flex items-center gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.08] px-3.5 py-2.5"
          role="status"
        >
          <span
            className="size-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <Info className="size-4" />
          </span>
          <p className="text-xs text-foreground flex-1 min-w-0">
            <span className="font-semibold">Tip:</span> tekan Enter pada kolom pencarian untuk langsung mencari produk
          </p>
          <button
            type="button"
            onClick={dismissEnterTip}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/60 transition-colors"
            aria-label="Tutup tip"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Baris cepat "Sering dijual" — hanya di tampilan default (tanpa pencarian/
          filter) agar tidak menambah kebisingan saat kasir sedang mencari. 
          Sekali-tap langsung masuk keranjang: pintasan terbesar untuk item laris. */}
      {showTopSold && (
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Flame className="size-4 text-orange-500" aria-hidden="true" />
            <p className="text-sm font-bold">Sering Dijual</p>
          </div>
          <div
            role="group"
            aria-label="Tambah cepat item yang sering dijual"
            className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {(topSold?.data ?? []).map(({ item, soldQty }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (longPressed.current) {
                    longPressed.current = false
                    return
                  }
                  onAdd(item)
                }}
                onPointerDown={() => startPress(item)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
                className="group/qs relative shrink-0 inline-flex items-center gap-2.5 h-12 rounded-xl border border-border/70 bg-card pl-3.5 pr-3 shadow-sm transition-all select-none hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96]"
                aria-label={`Tambah ${item.name} ke keranjang, harga ${formatIDR(item.sellingPrice - (item.discountAmount ?? 0))}${(item.discountAmount ?? 0) > 0 ? ` (diskon dari ${formatIDR(item.sellingPrice)})` : ""}, terjual ${formatQty(soldQty)} kali dalam 30 hari. Tahan untuk memasukkan jumlah.`}
              >
                <span
                  className="relative size-9 rounded-full overflow-hidden flex items-center justify-center text-lg shrink-0 ring-1 ring-inset ring-black/[0.04]"
                  style={{ background: pastel(item.id) }}
                  aria-hidden="true"
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    itemEmoji(item.name, item.type)
                  )}
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-sm font-medium max-w-[150px] truncate">{item.name}</span>
                  <span className="flex items-center gap-1.5">
                    {(item.discountAmount ?? 0) > 0 ? (
                      <>
                        <span className="text-[11px] text-primary font-semibold tabular">
                          {formatIDR(item.sellingPrice - (item.discountAmount ?? 0))}
                        </span>
                        <span className="text-[10px] text-muted-foreground line-through tabular">
                          {formatIDR(item.sellingPrice)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[11px] text-primary font-semibold tabular">{formatIDR(item.sellingPrice)}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular" aria-hidden="true">·</span>
                    <span className="text-[10px] text-muted-foreground tabular">{formatQty(soldQty)}× terjual</span>
                  </span>
                </span>
                <span
                  className="size-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 transition-transform group-hover/qs:scale-110"
                  aria-hidden="true"
                >
                  <Plus className="size-3.5" />
                </span>
                {/* Bar progres tekan-tahan (500 ms) */}
                {pressId === item.id && (
                  <span
                    className="sb-press-fill absolute inset-x-0 bottom-0 h-[3px] rounded-b-xl bg-primary/70"
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
          {/* Isyarat gulir: gradien halus di tepi kanan (non-interaktif) */}
          <div
            className="pointer-events-none absolute top-8 bottom-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
            aria-hidden="true"
          />
        </div>
      )}

      {/* Tips onboarding tekan-tahan (sekali tampil per perangkat, bisa ditutup) */}
      <LongPressTip />

      {/* Petunjuk shortcut (hanya desktop) */}
      <ShortcutHints />

      {/* Filter jenis — chip pill ala referensi (aktif = solid primary) */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter jenis item">
        {(
          [
            { key: "ALL", label: "Semua" },
            { key: "PRODUCT", label: "Produk" },
            { key: "SERVICE", label: "Jasa" },
          ] as { key: TypeFilter; label: string }[]
        ).map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={type === f.key}
            onClick={() => setType(f.key)}
            className={cn(
              "px-4 h-10 text-sm rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96]",
              type === f.key
                ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground tabular">
          {data?.total ?? 0} item
        </span>
      </div>

      {/* Kategori: chip horizontal sekali-tap — jauh lebih cepat daripada dropdown
          di ponsel/tablet. Baris digulir ke samping bila kategori banyak; scrollbar
          disembunyikan, gradien tipis di kanan memberi isyarat bisa digeser.
          Header "Kategori | Lihat Semua" ala referensi (hanya mobile). */}
      {(categories?.data?.length ?? 0) > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 lg:hidden">
            <div className="flex items-center gap-1.5">
              <Leaf className="size-4 text-emerald-500" aria-hidden="true" />
              <h2 className="text-sm font-bold">Kategori</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/app/products")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              aria-label="Lihat semua produk di halaman Produk"
            >
              Lihat Semua
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="relative">
            <div
              role="group"
              aria-label="Filter kategori"
              className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {[{ id: "ALL", name: "Semua kategori" }, ...(categories?.data ?? [])].map((c) => {
                const active = categoryId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 h-10 inline-flex items-center gap-1.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96]",
                      active
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/30"
                    )}
                  >
                    <span aria-hidden="true">{c.id === "ALL" ? "🛒" : categoryEmoji(c.name)}</span>
                    {c.name}
                  </button>
                )
              })}
            </div>
            {/* Isyarat gulir: gradien halus di tepi kanan (non-interaktif) */}
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent"
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {/* Grid item */}
      {loading && !items.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-card p-3 flex sm:flex-col flex-row gap-3">
              <Skeleton className="size-20 sm:size-auto sm:w-full sm:h-28 rounded-xl shrink-0" />
              <div className="flex flex-col flex-1 min-w-0 space-y-2 py-1">
                <Skeleton className="h-3.5 w-4/5 rounded" />
                <Skeleton className="h-3 w-2/5 rounded" />
                <div className="mt-auto flex items-center justify-between">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="size-8 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <div className="flex flex-col items-center justify-center py-14 rounded-xl border border-dashed bg-muted/20 text-center px-6">
          <div
            className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-4"
            aria-hidden="true"
          >
            <SearchX className="size-6 text-primary" />
          </div>
          <p className="text-base font-semibold">Tidak ada item yang cocok</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
            Coba kata kunci lain, atau tambahkan item baru di halaman Produk/Jasa.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((item) => {
            const outOfStock = item.type === "PRODUCT" && item.stockQty <= 0
            const lowStock = item.isLowStock && !outOfStock
            return (
              <button
                key={item.id}
                onClick={() => {
                  // Setelah tekan-tahan (dialog jumlah), click lanjutan diabaikan.
                  if (longPressed.current) {
                    longPressed.current = false
                    return
                  }
                  onAdd(item)
                }}
                onPointerDown={() => startPress(item)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()}
                disabled={outOfStock}
                className={cn(
                  "group relative flex sm:flex-col flex-row items-stretch gap-2 sm:gap-3 rounded-2xl border bg-card p-2.5 sm:p-3 text-left transition-all select-none",
                  "focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.98]",
                  outOfStock
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                )}
                aria-label={`Tambah ${item.name} ke keranjang, harga ${formatIDR(item.sellingPrice - (item.discountAmount ?? 0))}${(item.discountAmount ?? 0) > 0 ? ` (diskon dari ${formatIDR(item.sellingPrice)})` : ""}${outOfStock ? ", stok habis" : ""}. Tahan untuk memasukkan jumlah.`}
              >
                {/* Media pastel + emoji — mobile: kotak kiri (ala referensi);
                    desktop: penuh di atas kartu. Badge status menempel di pojok
                    media (bukan kartu) agar tidak menimpa nama di kartu sempit. */}
                <span
                  className={cn(
                    "relative w-14 h-14 sm:w-full sm:h-28 rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center text-3xl sm:text-5xl",
                    "ring-1 ring-inset ring-black/[0.04]",
                    outOfStock && "grayscale"
                  )}
                  style={{ background: pastel(item.id) }}
                  aria-hidden="true"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    itemEmoji(item.name, item.type)
                  )}
                  {item.type === "PRODUCT" ? (
                    <span
                      className={cn(
                        "absolute top-0.5 right-0.5 rounded-full px-1 py-px text-[8.5px] sm:text-[9.5px] font-semibold tabular leading-none",
                        outOfStock
                          ? "bg-destructive/10 text-destructive"
                          : lowStock
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-background/90 text-muted-foreground ring-1 ring-inset ring-border/60"
                      )}
                    >
                      {outOfStock ? "Habis" : `${formatQty(item.stockQty)} ${item.unit}`}
                    </span>
                  ) : (
                    <span className="absolute top-0.5 right-0.5 rounded-full px-1 py-px text-[8.5px] sm:text-[9.5px] font-semibold leading-none bg-primary/10 text-primary">
                      Jasa
                    </span>
                  )}
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <p className="text-[13px] sm:text-sm font-medium leading-tight line-clamp-2 sm:min-h-[2.4em]">{item.name}</p>
                  <div className="mt-auto pt-1 sm:pt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
                    <span className="flex flex-col items-start leading-tight">
                      <span
                        className={cn(
                          "text-[13px] sm:text-sm font-semibold tabular whitespace-nowrap",
                          outOfStock ? "text-muted-foreground line-through" : "text-primary"
                        )}
                      >
                        {formatIDR(item.sellingPrice - (item.discountAmount ?? 0))}
                      </span>
                      {(item.discountAmount ?? 0) > 0 && !outOfStock && (
                        <span className="text-[10px] text-muted-foreground line-through tabular whitespace-nowrap">
                          {formatIDR(item.sellingPrice)}
                        </span>
                      )}
                    </span>
                    {/* Tombol + bulat ala referensi — selalu terlihat */}
                    <span
                      className={cn(
                        "size-7 sm:size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 self-end transition-transform",
                        !outOfStock && "group-hover:scale-110 group-active:scale-95"
                      )}
                      aria-hidden="true"
                    >
                      <Plus className="size-3.5 sm:size-4" />
                    </span>
                  </div>
                </div>
                {/* Bar progres tekan-tahan (500 ms) */}
                {pressId === item.id && (
                  <span
                    className="sb-press-fill absolute inset-x-0 bottom-0 h-[3px] rounded-b-2xl bg-primary/70"
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>
      )}

      {canLoadMore && (
        <Button variant="outline" className="w-full active:scale-[0.99]" onClick={loadMore} disabled={loading}>
          Tampilkan lebih banyak
        </Button>
      )}

      {/* Dialog jumlah — dibuka lewat tekan-tahan kartu produk (500 ms).
          Flag longPressed di-reset di sini: pada tekan-tahan, click pasca-dialog
          tidak selalu terpicu (pointerup mendarat di overlay) — tanpa reset,
          ketukan sah berikutnya akan tertelan sekali. */}
      <QtyDialog
        item={qtyTarget}
        onOpenChange={(v) => {
          if (!v) {
            setQtyTarget(null)
            longPressed.current = false
          }
        }}
        onConfirm={(item, qty) => {
          onAdd(item, qty)
          longPressed.current = false
        }}
      />
    </div>
  )
}
