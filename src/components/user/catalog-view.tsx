// View Produk & Jasa (satu komponen, dikendalikan prop type). CRUD + soft-delete + low stock.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, Package, PackagePlus, Plus, Search, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CatalogItemFormDialog } from "@/components/user/catalog-item-form";
import { MovementHistoryDialog } from "@/components/user/movement-history-dialog";
import { StockAdjustDialog } from "@/components/user/stock-adjust-dialog";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MoneyCell,
  PageHeader,
  PaginationControls,
  UserStatusBadge,
} from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApp } from "@/components/app/app-context";
import { useApi, useDebounced } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR, formatQty } from "@/lib/format";
import type { CatalogItemDTO, CategoryDTO, Paginated } from "@/lib/types";

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
        actions={
          <>
            <ExportMenu params={{ type: isProduct ? "products" : "services" }} />
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="size-4" />
              {isProduct ? "Tambah Produk" : "Tambah Jasa"}
            </Button>
          </>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isProduct ? "Cari nama / SKU / barcode…" : "Cari nama / SKU…"}
            className="pl-9"
            aria-label="Cari item"
          />
        </div>
        {isProduct && (
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[170px]" aria-label="Filter kategori">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]" aria-label="Filter status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Nonaktif</SelectItem>
            {isProduct && <SelectItem value="LOW_STOCK">Stok menipis</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[150px]" aria-label="Urutkan">
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

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !items.length ? (
          <div className="p-6">
            <EmptyState
              icon={isProduct ? Package : Wrench}
              title={isProduct ? "Belum ada produk" : "Belum ada jasa"}
              description={
                isProduct
                  ? "Tambahkan produk pertama Anda untuk mulai berjualan."
                  : "Tambahkan jasa pertama Anda untuk mulai berjualan."
              }
              action={
                <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
                  <Plus className="size-4" />
                  {isProduct ? "Tambah Produk" : "Tambah Jasa"}
                </Button>
              }
            />
          </div>
        ) : (
          // py-3 sel — baris data lebih lega di-densi; grid terasa profesional
          <Table className="[&_td]:py-3 [&_th]:py-2.5">
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden md:table-cell">SKU / Barcode</TableHead>
                <TableHead className="hidden sm:table-cell">Kategori</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                {isProduct && <TableHead className="text-right">Stok</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} className={item.isLowStock ? "bg-amber-500/5" : undefined}>
                  <TableCell className="font-medium max-w-[150px] sm:max-w-[220px]">
                    <p className="truncate">{item.name}</p>
                    {!item.isActive && <p className="text-xs text-muted-foreground">dinonaktifkan</p>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs tabular">
                    {item.sku ?? "—"}
                    {item.barcode ? ` / ${item.barcode}` : ""}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {item.categoryName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <MoneyCell amount={item.sellingPrice} className="font-semibold" />
                  </TableCell>
                  {isProduct && (
                    <TableCell className="text-right">
                      {item.isLowStock ? (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 tabular">
                          {formatQty(item.stockQty)} {item.unit}
                        </Badge>
                      ) : (
                        <span className="tabular text-muted-foreground">
                          {formatQty(item.stockQty)} {item.unit}
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    {item.isActive ? <UserStatusBadge status="ACTIVE" /> : <UserStatusBadge status="INACTIVE" />}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditing(item); setFormOpen(true) }}
                        aria-label={`Ubah ${item.name}`}
                      >
                        Ubah
                      </Button>
                      {isProduct && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0"
                            onClick={() => setAdjusting(item)}
                            aria-label={`Sesuaikan stok ${item.name}`}
                            title="Sesuaikan stok (opname)"
                          >
                            <PackagePlus className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 px-0"
                            onClick={() => setHistoryItem(item)}
                            aria-label={`Riwayat stok ${item.name}`}
                            title="Riwayat pergerakan stok"
                          >
                            <History className="size-4" />
                          </Button>
                        </>
                      )}
                      {item.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeactivating(item)}
                          aria-label={`Nonaktifkan ${item.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
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
