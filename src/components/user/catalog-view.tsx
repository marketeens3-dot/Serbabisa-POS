// View Produk & Jasa (satu komponen, dikendalikan prop type). CRUD + soft-delete + low stock.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpDown, History, LayoutGrid, MoreVertical, Package, PackagePlus, Pencil, Plus, Search, Trash2, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CatalogItemFormDialog } from "@/components/user/catalog-item-form";
import { MovementHistoryDialog } from "@/components/user/movement-history-dialog";
import { StockAdjustDialog } from "@/components/user/stock-adjust-dialog";
import { itemEmoji, pastelFor } from "@/lib/catalog-visual";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MoneyCell,
  PageHeader,
  PaginationControls,
} from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApp } from "@/components/app/app-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR, formatQty } from "@/lib/format";
import type { CatalogItemDTO, CategoryDTO, Paginated } from "@/lib/types";

// Pill status ala desain: titik + "Aktif" hijau lembut / "Nonaktif" abu.
function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        active
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/60")} aria-hidden="true" />
      {active ? "Aktif" : "Nonaktif"}
    </span>
  )
}

export default function CatalogView({ type, initialStatus }: { type: "PRODUCT" | "SERVICE"; initialStatus?: string }) {
  const { navigate, refreshStockAlerts } = useApp()
  const isProduct = type === "PRODUCT"
  const [search, setSearch] = useState("")
  const [categoryId, setCategoryId] = useState("ALL")
  // Preset filter via route — mis. /app/products/stok (pintasan badge stok menipis).
  const [status, setStatus] = useState(initialStatus ?? "ACTIVE")
  const [sort, setSort] = useState("name")
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogItemDTO | null>(null)
  const [adjusting, setAdjusting] = useState<CatalogItemDTO | null>(null)
  const [historyItem, setHistoryItem] = useState<CatalogItemDTO | null>(null)
  const [deactivating, setDeactivating] = useState<CatalogItemDTO | null>(null)
  const [busy, setBusy] = useState(false)

  const debouncedSearch = useDebounced(search)
  const { data: categories } = useApi<{ data: CategoryDTO[] }>("/api/categories")

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, categoryId, status, sort])

  const query = useMemo(() => {
    const params = new URLSearchParams({
      type,
      search: debouncedSearch,
      status,
      sort,
      page: String(page),
      pageSize: "20",
    })
    if (categoryId !== "ALL") params.set("categoryId", categoryId)
    return params.toString()
  }, [type, debouncedSearch, categoryId, status, sort, page])

  const { data, error, loading, refresh } = useApi<Paginated<CatalogItemDTO>>(`/api/catalog?${query}`)

  const items = data?.data ?? []

  async function handleDeactivate() {
    if (!deactivating) return
    setBusy(true)
    try {
      await api.patch(`/api/catalog/${deactivating.id}`, { action: "deactivate" })
      toast.success(`${isProduct ? "Produk" : "Jasa"} "${deactivating.name}" dinonaktifkan.`)
      setDeactivating(null)
      refresh()
      refreshStockAlerts()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menonaktifkan item.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title={isProduct ? "Produk" : "Jasa"}
        description={
          isProduct
            ? "Kelola produk fisik — stok, harga, SKU, dan barcode."
            : "Kelola jasa layanan Anda — jasa tidak mengurangi stok."
        }
      />

      {/* Baris 1 ala desain: pill kategori + tombol gradien Tambah */}
      <div className="flex flex-wrap gap-2.5 mb-2.5">
        {isProduct && (
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger
              className="flex-1 min-w-[140px] max-w-[220px] h-11 rounded-full bg-card shadow-sm ring-1 ring-black/[0.03] font-semibold"
              aria-label="Filter kategori"
            >
              <LayoutGrid className="size-4 text-primary shrink-0" aria-hidden="true" />
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua kategori</SelectItem>
              {(categories?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          onClick={() => { setEditing(null); setFormOpen(true) }}
          className="flex-1 min-w-[160px] max-w-[260px] h-11 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700 font-semibold"
        >
          <Plus className="size-4" />
          {isProduct ? "Tambah Produk" : "Tambah Jasa"}
        </Button>
      </div>

      {/* Baris 2: pencarian besar rounded-full + ekspor */}
      <div className="flex gap-2.5 mb-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isProduct ? "Cari nama / SKU / barcode…" : "Cari nama / SKU…"}
            className="pl-10 h-11 rounded-full bg-card shadow-sm"
            aria-label="Cari item"
          />
        </div>
        <ExportMenu params={{ type: isProduct ? "products" : "services" }} />
      </div>

      {/* Baris 3: chip filter (status ⚡ + urutan) ala desain */}
      <div className="flex gap-2.5 mb-4">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="flex-1 min-w-0 h-10 rounded-full bg-card shadow-sm text-sm font-medium" aria-label="Filter status">
            <Zap className="size-3.5 text-amber-500 shrink-0" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Nonaktif</SelectItem>
            {isProduct && <SelectItem value="LOW_STOCK">Stok menipis</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="flex-1 min-w-0 h-10 rounded-full bg-card shadow-sm text-sm font-medium" aria-label="Urutkan">
            <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <SelectValue placeholder="Urutkan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nama A–Z</SelectItem>
            <SelectItem value="newest">Terbaru</SelectItem>
            <SelectItem value="price_asc">Harga terendah</SelectItem>
            <SelectItem value="price_desc">Harga tertinggi</SelectItem>
            {isProduct && <SelectItem value="stock_asc">Stok tersedikit</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !items.length ? (
          (() => {
            /* Empty state cerdas: (1) filter aktif → ajak reset, jangan bilang
               "belum ada produk" saat produknya ada tapi tidak lolos filter;
               (2) halaman Stok tanpa hasil = kabar baik (stok aman);
               (3) benar-benar kosong → ajak tambah item pertama. */
            const defaultStatus = initialStatus ?? "ACTIVE"
            const filterActive = search.trim() !== "" || categoryId !== "ALL" || status !== defaultStatus
            if (filterActive) {
              return (
                <EmptyState
                  icon={isProduct ? Package : Wrench}
                  title={isProduct ? "Tidak ada produk yang cocok" : "Tidak ada jasa yang cocok"}
                  description="Coba ubah kata kunci, kategori, atau status — atau reset filter."
                  action={
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => { setSearch(""); setCategoryId("ALL"); setStatus(defaultStatus); setPage(1) }}
                    >
                      <Search className="size-4" />
                      Reset filter
                    </Button>
                  }
                />
              )
            }
            if (initialStatus === "LOW_STOCK") {
              return (
                <EmptyState
                  icon={isProduct ? Package : Wrench}
                  title="Semua stok aman 🎉"
                  description="Tidak ada produk yang menyentuh ambang minimum. Laporan stok menipis akan muncul di sini."
                />
              )
            }
            return (
              <EmptyState
                icon={isProduct ? Package : Wrench}
                title={isProduct ? "Belum ada produk" : "Belum ada jasa"}
                description={
                  isProduct
                    ? "Tambahkan produk pertama Anda untuk mulai berjualan."
                    : "Tambahkan jasa pertama Anda untuk mulai berjualan."
                }
                action={
                  <Button className="rounded-full" onClick={() => { setEditing(null); setFormOpen(true) }}>
                    <Plus className="size-4" />
                    {isProduct ? "Tambah Produk" : "Tambah Jasa"}
                  </Button>
                }
              />
            )
          })()
        ) : (
          // py-3.5 sel — baris data lega ala desain; kartu rounded-3xl
          <Table className="[&_td]:py-3.5 [&_th]:py-3 [&_th]:text-xs [&_th]:font-bold">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Nama Produk</TableHead>
                <TableHead className="hidden lg:table-cell">SKU / Barcode</TableHead>
                <TableHead className="hidden lg:table-cell">Kategori</TableHead>
                <TableHead>Harga</TableHead>
                {isProduct && <TableHead>Stok</TableHead>}
                {/* Status: kini TAMPIL di ponsel ala desain (pill hijau ●). */}
                <TableHead>Status</TableHead>
                <TableHead className="text-right"><span className="sr-only">Aksi</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={item.isLowStock ? "bg-amber-500/5" : undefined}>
                  <TableCell className="font-semibold max-w-[110px] sm:max-w-[180px] lg:max-w-[220px]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Thumbnail gambar produk (WebP) — fallback emoji, sudut
                          lebih membulat (rounded-2xl) ala desain */}
                      <span
                        className="relative size-11 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-lg ring-1 ring-inset ring-border/50"
                        style={{ background: pastelFor(item.id) }}
                        aria-hidden="true"
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
                        ) : (
                          itemEmoji(item.name, item.type)
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate">{item.name}</p>
                        {!item.isActive && <p className="text-[11px] text-muted-foreground">dinonaktifkan</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-xs tabular">
                    {item.sku ?? "—"}
                    {item.barcode ? ` / ${item.barcode}` : ""}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {item.categoryName ?? "—"}
                  </TableCell>
                  <TableCell>
                    {item.discountAmount > 0 ? (
                      <div className="flex flex-col leading-tight">
                        <MoneyCell amount={item.sellingPrice - item.discountAmount} className="font-bold whitespace-nowrap" />
                        <span className="text-[11px] text-muted-foreground line-through tabular whitespace-nowrap">
                          {formatIDR(item.sellingPrice)}
                        </span>
                      </div>
                    ) : (
                      <MoneyCell amount={item.sellingPrice} className="font-bold whitespace-nowrap" />
                    )}
                  </TableCell>
                  {isProduct && (
                    <TableCell>
                      {item.isLowStock ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 px-2.5 py-1 text-xs font-bold tabular whitespace-nowrap">
                          {formatQty(item.stockQty)} {item.unit}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400 px-2.5 py-1 text-xs font-bold tabular whitespace-nowrap">
                          {formatQty(item.stockQty)} {item.unit}
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <StatusPill active={item.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Semua aksi dipindah ke menu kebab ⋯ ala desain — baris
                        lebih bersih; aksi tetap lengkap & mudah dijangkau. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label={`Menu aksi untuk ${item.name}`}>
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => { setEditing(item); setFormOpen(true) }}>
                          <Pencil className="size-4" />
                          Ubah
                        </DropdownMenuItem>
                        {isProduct && (
                          <>
                            <DropdownMenuItem onClick={() => setAdjusting(item)}>
                              <PackagePlus className="size-4" />
                              Sesuaikan stok
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setHistoryItem(item)}>
                              <History className="size-4" />
                              Riwayat stok
                            </DropdownMenuItem>
                          </>
                        )}
                        {item.isActive && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeactivating(item)}
                              className="text-destructive focus:text-destructive focus:bg-destructive/10"
                            >
                              <Trash2 className="size-4" />
                              Nonaktifkan
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      )}

      <CatalogItemFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        type={type}
        item={editing}
        categories={categories?.data ?? []}
        onSaved={() => {
          setFormOpen(false)
          refresh()
          refreshStockAlerts()
        }}
      />

      {isProduct && (
        <>
          <StockAdjustDialog
            open={!!adjusting}
            onOpenChange={(v) => !v && setAdjusting(null)}
            item={adjusting}
            onSaved={() => {
              setAdjusting(null)
              refresh()
              refreshStockAlerts()
            }}
          />
          <MovementHistoryDialog
            open={!!historyItem}
            onOpenChange={(v) => !v && setHistoryItem(null)}
            item={historyItem}
          />
        </>
      )}

      <AlertDialog open={!!deactivating} onOpenChange={(v) => !v && setDeactivating(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Nonaktifkan {isProduct ? "produk" : "jasa"} &ldquo;{deactivating?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Item tidak lagi muncul di kasir, tetapi riwayat transaksi lama tetap utuh. Item bisa diaktifkan kembali.
              {deactivating && isProduct && ` Stok saat ini: ${formatQty(deactivating.stockQty)} ${deactivating.unit}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "Memproses…" : "Ya, nonaktifkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
