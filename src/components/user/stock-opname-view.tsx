// View Stok Opname: hitung fisik beberapa produk sekaligus → stok diset ke fisik,
// selisih tercatat sebagai mutasi ADJUSTMENT. Riwayat opname di bawah.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingRows, PageHeader, PaginationControls } from "@/components/app/shared";
import { useApi, useDebounced } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeID, formatNumberID } from "@/lib/format";

type OpnameRow = { id: string; note: string | null; itemCount: number; createdAt: string }
type OpnameList = { data: OpnameRow[]; page: number; pageSize: number; total: number; totalPages: number }
type CatalogRow = { id: string; name: string; stockQty: number; unit: string }
type OpnameLine = { catalogItemId: string; name: string; systemQty: number; unit: string; physicalQty: string }

export default function StockOpnameView() {
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const { data, error, loading, refresh } = useApi<OpnameList>(`/api/stock-opname?page=${page}&pageSize=10`)

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Stok Opname"
        description="Hitung fisik, samakan stok sistem. Selisih tercatat di riwayat mutasi dengan alasan OPNAME."
        actions={<Button onClick={() => setOpen(true)}><Plus className="size-4" />Opname Baru</Button>}
      />

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={6} /></div>
        ) : !(data?.data ?? []).length ? (
          <div className="p-6">
            <EmptyStateLocal onOpen={() => setOpen(true)} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead className="text-right">Jumlah produk dihitung</TableHead>
                <TableHead className="hidden sm:table-cell">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.data ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{formatDateTimeID(o.createdAt)}</TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">{o.itemCount}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground max-w-[280px] truncate" title={o.note ?? ""}>{o.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <OpnameDialog open={open} onOpenChange={setOpen} onSaved={() => { setOpen(false); refresh() }} />
    </div>
  )
}

function EmptyStateLocal({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed bg-muted/20">
      <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-4" aria-hidden="true">
        <ClipboardCheck className="size-6 text-primary" />
      </div>
      <p className="text-base font-semibold">Belum ada opname</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">Rutin lakukan opname agar stok sistem sesuai fisik dan selisih terdeteksi.</p>
      <div className="mt-5"><Button onClick={onOpen}><Plus className="size-4" />Opname Baru</Button></div>
    </div>
  )
}

function OpnameDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [note, setNote] = useState("")
  const [lines, setLines] = useState<OpnameLine[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<{ itemCount: number; changedCount: number } | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams({ type: "PRODUCT", pageSize: "8", status: "ACTIVE" })
    if (debounced) params.set("search", debounced)
    return params.toString()
  }, [debounced])
  const { data: catalog, refresh: refreshCatalog } = useApi<{ data: CatalogRow[] }>(open ? `/api/catalog?${query}` : null)

  function addLine(item: CatalogRow) {
    if (lines.some((l) => l.catalogItemId === item.id)) {
      toast.info(`${item.name} sudah ada di daftar hitung.`)
      return
    }
    setLines((prev) => [...prev, { catalogItemId: item.id, name: item.name, systemQty: item.stockQty, unit: item.unit, physicalQty: String(item.stockQty) }])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!lines.length) { setFormError("Pilih minimal 1 produk."); return }
    const items = lines.map((l) => ({ catalogItemId: l.catalogItemId, physicalQty: Number(l.physicalQty.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0 }))
    setSaving(true)
    try {
      const res = await api.post<{ itemCount: number; changedCount: number }>("/api/stock-opname", { note: note.trim() || null, items })
      setResult({ itemCount: res.itemCount, changedCount: res.changedCount })
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menyimpan opname.")
    } finally {
      setSaving(false)
    }
  }

  function closeResult() {
    setResult(null)
    setLines([])
    setNote("")
    setSearch("")
    refreshCatalog()
  }

  return (
    <>
      <Dialog open={open && !result} onOpenChange={(v) => !saving && onOpenChange(v)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Opname Stok Baru</DialogTitle>
            <DialogDescription>Cari produk, isi jumlah fisik hasil hitung. Stok sistem diset ke jumlah fisik saat disimpan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk…" className="pl-9" aria-label="Cari produk" />
            </div>
            {!!(catalog?.data ?? []).length && (
              <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                {(catalog?.data ?? []).map((c) => (
                  <button key={c.id} type="button" onClick={() => addLine(c)} className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-left">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2 tabular">sistem: {formatNumberID(c.stockQty)} {c.unit}</span>
                  </button>
                ))}
              </div>
            )}

            {!!lines.length && (
              <div className="space-y-2">
                <Label>Hasil hitung fisik</Label>
                <div className="rounded-lg border divide-y">
                  {lines.map((l, i) => {
                    const physical = Number(l.physicalQty.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0
                    const diff = Math.round((physical - l.systemQty) * 1000) / 1000
                    return (
                      <div key={l.catalogItemId} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{l.name}</p>
                          <p className="text-xs text-muted-foreground tabular">sistem: {formatNumberID(l.systemQty)} {l.unit}</p>
                        </div>
                        <Input
                          value={l.physicalQty}
                          onChange={(e) => setLines((prev) => prev.map((p, j) => (j === i ? { ...p, physicalQty: e.target.value.replace(/[^0-9.,]/g, "") } : p)))}
                          inputMode="decimal"
                          className="w-28 h-8 tabular"
                          aria-label={`Stok fisik ${l.name}`}
                        />
                        <span className={`w-16 text-right text-xs tabular shrink-0 ${diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {diff > 0 ? `+${formatNumberID(diff)}` : diff === 0 ? "cocok" : formatNumberID(diff)}
                        </span>
                        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} aria-label={`Hapus ${l.name}`}>×</Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="opname-note">Catatan (opsional)</Label>
              <Textarea id="opname-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="mis. opname gudang akhir bulan" />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
              <Button type="submit" disabled={saving || !lines.length}>{saving ? "Menyimpan…" : `Simpan Opname (${lines.length} produk)`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!result} onOpenChange={(v) => !v && closeResult()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" />Opname tersimpan</DialogTitle>
            <DialogDescription>
              {result?.itemCount} produk dihitung, {result?.changedCount} selisih sudah disesuaikan (tercatat sebagai mutasi OPNAME).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={closeResult}>Selesai</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
