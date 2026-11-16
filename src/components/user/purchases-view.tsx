// View Pembelian: kelola supplier + PO (draft → order → terima barang).
// Terima barang: stok naik, HPP update, tunai → cashflow otomatis / tempo → hutang.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, PackageCheck, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingRows, MoneyCell, PageHeader, PaginationControls } from "@/components/app/shared";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateID, formatIDR, formatNumberID } from "@/lib/format";

type SupplierRow = { id: string; name: string; phone: string | null; address: string | null; notes: string | null; isActive: boolean; purchaseCount: number }
type PurchaseRow = { id: string; code: string; supplierId: string; supplierName: string; status: "DRAFT" | "ORDERED" | "RECEIVED" | "CANCELLED"; totalAmount: number; itemCount: number; note: string | null; orderedAt: string | null; receivedAt: string | null; createdAt: string }
type CatalogRow = { id: string; name: string; stockQty: number; unit: string; sellingPrice: number }
type PurchasesList = { data: PurchaseRow[]; page: number; pageSize: number; total: number; totalPages: number }

const PO_STATUS_TONES: Record<PurchaseRow["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ORDERED: "bg-primary/10 text-primary",
  RECEIVED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-destructive/10 text-destructive",
}
const PO_STATUS_LABELS: Record<PurchaseRow["status"], string> = {
  DRAFT: "Draft", ORDERED: "Diorder", RECEIVED: "Diterima", CANCELLED: "Dibatalkan",
}

export default function PurchasesView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [page, setPage] = useState(1)
  const [poOpen, setPoOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRow | null>(null)

  useResetOnKeyChange(debounced, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    return params.toString()
  }, [debounced, page])

  const { data, error, loading, refresh } = useApi<PurchasesList>(`/api/purchases?${query}`)
  const rows = data?.data ?? []

  async function submitPo(po: PurchaseRow) {
    try {
      await api.patch(`/api/purchases/${po.id}`, { action: "submit" })
      toast.success(`PO ${po.code} dikirim ke ${po.supplierName}.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal kirim PO.")
    }
  }

  async function cancelPo(po: PurchaseRow) {
    try {
      await api.patch(`/api/purchases/${po.id}`, { action: "cancel" })
      toast.success(`PO ${po.code} dibatalkan.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal batalkan PO.")
    }
  }

  async function deletePo(po: PurchaseRow) {
    try {
      await api.del(`/api/purchases/${po.id}`)
      toast.success("PO draft dihapus.")
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal hapus PO.")
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Pembelian & Supplier"
        description="PO pembelian barang — terima barang otomatis menambah stok dan memperbarui HPP."
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierOpen(true)}><Building2 className="size-4" />Supplier</Button>
            <Button onClick={() => setPoOpen(true)}><Plus className="size-4" />PO Baru</Button>
          </>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode PO / supplier…" className="pl-9" aria-label="Cari PO" />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !rows.length ? (
          <div className="p-6">
            <EmptyState icon={Truck} title="Belum ada PO" description="Buat purchase order ke supplier. Saat barang diterima, stok dan HPP diperbarui otomatis."
              action={<Button onClick={() => setPoOpen(true)}><Plus className="size-4" />PO Baru</Button>} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Supplier</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden md:table-cell">Diterima</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-medium">
                    <span className="block">{po.code}</span>
                    <span className="text-xs text-muted-foreground font-normal">{po.itemCount} item</span>
                  </TableCell>
                  <TableCell><Badge className={`border-0 ${PO_STATUS_TONES[po.status]}`}>{PO_STATUS_LABELS[po.status]}</Badge></TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{po.supplierName}</TableCell>
                  <TableCell className="text-right"><MoneyCell amount={po.totalAmount} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{po.receivedAt ? formatDateID(po.receivedAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {po.status === "DRAFT" && (
                        <>
                          <Button size="sm" onClick={() => submitPo(po)}>Kirim</Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePo(po)} aria-label="Hapus draft">Hapus</Button>
                        </>
                      )}
                      {po.status === "ORDERED" && (
                        <>
                          <Button size="sm" onClick={() => setReceiveTarget(po)}><PackageCheck className="size-3.5" />Terima</Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelPo(po)}>Batal</Button>
                        </>
                      )}
                      {po.status === "RECEIVED" && <span className="text-xs text-muted-foreground">Selesai ✓</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <CreatePoDialog open={poOpen} onOpenChange={setPoOpen} onSaved={() => { setPoOpen(false); refresh() }} />
      <SupplierDialog open={supplierOpen} onOpenChange={setSupplierOpen} />
      <ReceivePoDialog po={receiveTarget} onOpenChange={(v) => !v && setReceiveTarget(null)} onSaved={() => { setReceiveTarget(null); refresh() }} />
    </div>
  )
}

function SupplierDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, loading, refresh } = useApi<{ data: SupplierRow[] }>(open ? "/api/suppliers?includeInactive=1" : null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<SupplierRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState({ name: "", phone: "", address: "", notes: "" })

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) { setPrevOpen(open); if (open) setFormOpen(false) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = { name: values.name.trim(), phone: values.phone.trim() || null, address: values.address.trim() || null, notes: values.notes.trim() || null }
    try {
      if (editing) await api.patch(`/api/suppliers/${editing.id}`, payload)
      else await api.post("/api/suppliers", payload)
      toast.success(editing ? "Supplier diperbarui." : "Supplier ditambahkan.")
      setFormOpen(false)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyimpan supplier.")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s: SupplierRow) {
    try {
      await api.patch(`/api/suppliers/${s.id}`, { action: s.isActive ? "deactivate" : "activate" })
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal ubah status supplier.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Supplier</DialogTitle>
          <DialogDescription>Daftar pemasok barang.</DialogDescription>
        </DialogHeader>
        <Button size="sm" variant="outline" className="w-fit" onClick={() => { setEditing(null); setValues({ name: "", phone: "", address: "", notes: "" }); setFormOpen(true) }}>
          <Plus className="size-3.5" />Supplier Baru
        </Button>
        {loading ? <LoadingRows rows={4} /> : !(data?.data ?? []).length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Belum ada supplier.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden sm:table-cell">Telepon</TableHead>
                <TableHead className="hidden md:table-cell text-right">PO</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.data ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.name}
                    {!s.isActive && <Badge variant="outline" className="ml-2 text-[10px]">nonaktif</Badge>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-right text-muted-foreground">{s.purchaseCount}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setValues({ name: s.name, phone: s.phone ?? "", address: s.address ?? "", notes: s.notes ?? "" }); setFormOpen(true) }}>Ubah</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>{s.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={formOpen} onOpenChange={(v) => !saving && setFormOpen(v)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Ubah Supplier" : "Supplier Baru"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sup-name">Nama *</Label>
                <Input id="sup-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} maxLength={150} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sup-phone">Telepon</Label>
                <Input id="sup-phone" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} placeholder="08xx…" maxLength={30} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sup-address">Alamat</Label>
                <Textarea id="sup-address" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} rows={2} maxLength={500} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sup-notes">Catatan</Label>
                <Textarea id="sup-notes" value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} rows={2} maxLength={2000} />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Batal</Button>
                <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

function CreatePoDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { data: suppliers } = useApi<{ data: SupplierRow[] }>(open ? "/api/suppliers" : null)
  const { data: catalog } = useApi<{ data: CatalogRow[] }>(open ? "/api/catalog?type=PRODUCT&pageSize=100&status=ACTIVE" : null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState("")
  const [note, setNote] = useState("")
  const [lines, setLines] = useState<{ catalogItemId: string; quantity: string; unitCost: string }[]>([{ catalogItemId: "", quantity: "", unitCost: "" }])

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) { setFormError(null); setSupplierId(""); setNote(""); setLines([{ catalogItemId: "", quantity: "", unitCost: "" }]) }
  }

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost.replace(/[^0-9]/g, "")) || 0), 0)

  function setLine(idx: number, patch: Partial<{ catalogItemId: string; quantity: string; unitCost: string }>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function pickCatalog(idx: number, itemId: string) {
    // Prefill HPP tidak dimungkinkan (costPrice tidak dikirim ke client kasir —
    // sensitif), jadi harga beli diisi manual oleh pemilik.
    setLine(idx, { catalogItemId: itemId })
  }

  async function handleSave(submit: boolean) {
    setFormError(null)
    if (!supplierId) { setFormError("Pilih supplier."); return }
    const items = lines
      .filter((l) => l.catalogItemId && Number(l.quantity) > 0 && Number(l.unitCost.replace(/[^0-9]/g, "")) > 0)
      .map((l) => ({ catalogItemId: l.catalogItemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost.replace(/[^0-9]/g, "")) }))
    if (!items.length) { setFormError("Isi minimal 1 item dengan jumlah & harga beli."); return }
    setSaving(true)
    try {
      const res = await api.post<{ code: string }>("/api/purchases", { supplierId, note: note.trim() || null, submit, items })
      toast.success(submit ? `PO ${res.code} dibuat & dikirim.` : `PO ${res.code} disimpan sebagai draft.`)
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal membuat PO.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PO Pembelian Baru</DialogTitle>
          <DialogDescription>Simpan sebagai draft dulu, atau langsung kirim ke supplier.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="space-y-2">
            <Label htmlFor="po-supplier">Supplier *</Label>
            <select id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">— Pilih supplier —</option>
              {(suppliers?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Item pembelian</Label>
            {lines.map((l, i) => (
              /* Baris item: mobile = 2 baris (produk penuh, lalu Qty+Harga+hapus
                 sebaris) agar tak meluber keluar dialog; desktop = 4 kolom ala
                 spreadsheet. sm:contents → anak div dalam jadi sel grid desktop. */
              <div key={i} className="flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-[1fr_80px_110px_auto] sm:gap-2">
                <select
                  value={l.catalogItemId}
                  onChange={(e) => pickCatalog(i, e.target.value)}
                  className="w-full min-w-0 h-9 rounded-md border border-input bg-transparent px-2 text-sm sm:flex-1"
                  aria-label={`Item ${i + 1}`}
                >
                  <option value="">— Pilih produk —</option>
                  {(catalog?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} (stok {formatNumberID(c.stockQty)})</option>)}
                </select>
                <div className="flex flex-1 min-w-0 items-center gap-2 sm:contents">
                  <Input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })} placeholder="Qty" className="h-9 flex-1 min-w-14" aria-label="Jumlah" />
                  <Input inputMode="numeric" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value.replace(/[^0-9]/g, "") })} placeholder="Harga beli" className="h-9 flex-1 min-w-20 tabular" aria-label="Harga beli" />
                  <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} disabled={lines.length <= 1} aria-label="Hapus baris">
                    ×
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, { catalogItemId: "", quantity: "", unitCost: "" }])}>
              <Plus className="size-3.5" />Tambah baris
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="po-note">Catatan (opsional)</Label>
            <Textarea id="po-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} />
          </div>

          <div className="rounded-lg border bg-muted/40 px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold">
            <span className="text-muted-foreground">Total PO</span>
            <span className="tabular">{formatIDR(total)}</span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
          <Button type="button" variant="outline" onClick={() => handleSave(false)} disabled={saving}>Simpan Draft</Button>
          <Button type="button" onClick={() => handleSave(true)} disabled={saving}>{saving ? "Menyimpan…" : "Simpan & Kirim"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceivePoDialog({ po, onOpenChange, onSaved }: { po: PurchaseRow | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ paymentMethod: "CASH", dueDays: "30" })

  const [prevTarget, setPrevTarget] = useState<PurchaseRow | null>(null)
  if (prevTarget !== po) {
    setPrevTarget(po)
    if (po) { setFormError(null); setValues({ paymentMethod: "CASH", dueDays: "30" }) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!po) return
    setFormError(null)
    setSaving(true)
    try {
      const res = await api.post<{ debtId: string | null }>(`/api/purchases/${po.id}/receive`, {
        paymentMethod: values.paymentMethod,
        dueDays: values.paymentMethod === "TEMPO" ? Number(values.dueDays) || 30 : undefined,
      })
      toast.success(res.debtId ? `Barang diterima. Hutang ${formatIDR(po.totalAmount)} otomatis tercatat.` : "Barang diterima — stok & HPP diperbarui.")
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menerima barang.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!po} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Terima Barang — {po?.code}</DialogTitle>
          <DialogDescription>
            Stok bertambah, HPP diupdate. Total {po ? formatIDR(po.totalAmount) : ""} dari {po?.supplierName}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="space-y-2">
            <Label htmlFor="recv-method">Pembayaran ke supplier</Label>
            <select id="recv-method" value={values.paymentMethod} onChange={(e) => setValues({ ...values, paymentMethod: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="CASH">Tunai — kas keluar otomatis tercatat</option>
              <option value="TEMPO">Tempo — jadi hutang supplier</option>
            </select>
          </div>
          {values.paymentMethod === "TEMPO" && (
            <div className="space-y-2">
              <Label htmlFor="recv-due">Jatuh tempo (hari)</Label>
              <Input id="recv-due" inputMode="numeric" value={values.dueDays} onChange={(e) => setValues({ ...values, dueDays: e.target.value.replace(/[^0-9]/g, "") })} className="tabular" />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving || !po}>{saving ? "Memproses…" : "Konfirmasi Terima"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
