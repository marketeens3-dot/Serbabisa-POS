// Detail proyek RAB: item anggaran (CRUD), realisasi (otomatis kasir + manual),
// ringkasan anggaran vs realisasi, aksi ubah status.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChartColumn, FolderKanban, Percent, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingRows, MoneyCell, PageHeader, StatCard } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateID, formatIDR, formatNumberID } from "@/lib/format";
import { ProjectStatusBadge } from "@/components/user/projects-view";

type DetailData = {
  project: {
    id: string; code: string; name: string; description: string | null
    status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
    budgetTotal: number; realizationTotal: number; remaining: number
    progressPercent: number | null
    customerId: string | null; startDate: string | null; endDate: string | null; createdAt: string
  }
  items: { id: string; name: string; quantity: number; unit: string; unitPrice: number; budgetAmount: number; note: string | null; realizationTotal: number }[]
  realizations: { id: string; rabItemId: string | null; transactionId: string | null; description: string; quantity: number; amount: number; source: string; createdAt: string }[]
  linkedTransactions: { count: number; total: number }
}

export default function ProjectDetailView({ projectId }: { projectId: string }) {
  const { data, error, loading, refresh } = useApi<DetailData>(`/api/projects/${projectId}`)
  const [itemFormOpen, setItemFormOpen] = useState(false)
  const [realFormOpen, setRealFormOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function changeStatus(status: string) {
    try {
      await api.patch(`/api/projects/${projectId}`, { action: "set-status", status })
      toast.success("Status proyek diperbarui.")
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal ubah status.")
    }
  }

  async function deleteRealization(rid: string) {
    setBusyId(rid)
    try {
      await api.del(`/api/projects/${projectId}/realizations/${rid}`)
      toast.success("Realisasi manual dihapus.")
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal hapus realisasi.")
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !data) return <div className="max-w-6xl mx-auto"><div className="p-4"><LoadingRows rows={8} /></div></div>
  if (error) return <div className="max-w-6xl mx-auto"><ErrorState message={error} onRetry={refresh} /></div>
  if (!data) return null

  const { project, items, realizations } = data
  const progress = project.progressPercent ?? 0

  return (
    <div className="max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" className="mb-2 -ml-2 gap-1.5 text-muted-foreground" onClick={() => (window.location.hash = "#/app/projects")}>
        <ArrowLeft className="size-4" /> Kembali ke daftar proyek
      </Button>
      <PageHeader
        title={project.name}
        description={`${project.code}${project.description ? ` — ${project.description}` : ""}${project.startDate ? ` · mulai ${formatDateID(project.startDate)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            {project.status !== "COMPLETED" && project.status !== "CANCELLED" && (
              <Button variant="outline" size="sm" onClick={() => changeStatus("COMPLETED")}>Tandai Selesai</Button>
            )}
            {project.status === "PLANNED" && (
              <Button size="sm" onClick={() => changeStatus("ACTIVE")}>Aktifkan</Button>
            )}
          </div>
        }
      />

      {/* Ringkasan */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Total anggaran" value={formatIDR(project.budgetTotal)} icon={FolderIcon} />
        <StatCard label="Realisasi" value={formatIDR(project.realizationTotal)} tone="warning" icon={ChartIcon} hint={`${data.linkedTransactions.count} transaksi kasir terkait`} />
        <StatCard label="Sisa anggaran" value={formatIDR(project.remaining)} tone={project.remaining < 0 ? "danger" : "success"} icon={WalletIcon} />
        <StatCard
          label="Progres anggaran"
          value={project.progressPercent === null ? "—" : `${progress}%`}
          tone={progress > 100 ? "danger" : "default"}
          icon={ProgressIcon}
        />
      </div>

      {project.budgetTotal > 0 && (
        <div className="mb-6">
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, progress)} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full transition-all ${progress > 100 ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {progress > 100
              ? `Realisasi melebihi anggaran ${progress - 100}% — review biaya proyek.`
              : `${formatIDR(project.realizationTotal)} dari ${formatIDR(project.budgetTotal)} anggaran terpakai.`}
          </p>
        </div>
      )}

      {/* Item anggaran */}
      <Card className="mb-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Item Anggaran ({items.length})</h3>
            <Button size="sm" onClick={() => setItemFormOpen(true)}><Plus className="size-3.5" />Item</Button>
          </div>
          {!items.length ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">Belum ada item anggaran. Tambahkan kebutuhan proyek (material, jasa, dsb.).</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Harga satuan</TableHead>
                  <TableHead className="text-right">Anggaran</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Realisasi item</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="text-right tabular text-muted-foreground">{formatNumberID(it.quantity)} {it.unit}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right tabular text-muted-foreground">{formatIDR(it.unitPrice)}</TableCell>
                    <TableCell className="text-right"><MoneyCell amount={it.budgetAmount} /></TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <span className={`tabular ${it.realizationTotal > it.budgetAmount ? "text-destructive" : "text-muted-foreground"}`}>
                        {formatIDR(it.realizationTotal)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Realisasi */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Realisasi Biaya ({realizations.length})</h3>
            <Button size="sm" variant="outline" onClick={() => setRealFormOpen(true)}><Plus className="size-3.5" />Realisasi Manual</Button>
          </div>
          {!realizations.length ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">
              Belum ada realisasi. Realisasi otomatis muncul saat transaksi kasir memilih proyek ini; biaya di luar kasir dicatat manual.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="hidden sm:table-cell">Sumber</TableHead>
                  <TableHead className="hidden md:table-cell">Tanggal</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {realizations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[240px] truncate" title={r.description}>
                      {r.description}
                      {r.rabItemId && <Badge variant="outline" className="ml-2 text-[10px]">anggaran</Badge>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className={r.source === "SALE" ? "bg-primary/5 text-primary border-0" : ""}>
                        {r.source === "SALE" ? "Kasir (otomatis)" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{formatDateID(r.createdAt)}</TableCell>
                    <TableCell className="text-right"><MoneyCell amount={r.amount} /></TableCell>
                    <TableCell>
                      {r.source === "MANUAL" && (
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" disabled={busyId === r.id} onClick={() => deleteRealization(r.id)} aria-label="Hapus realisasi">
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddItemDialog open={itemFormOpen} onOpenChange={setItemFormOpen} projectId={projectId} onSaved={() => { setItemFormOpen(false); refresh() }} />
      <AddRealizationDialog open={realFormOpen} onOpenChange={setRealFormOpen} projectId={projectId} items={items} onSaved={() => { setRealFormOpen(false); refresh() }} />
    </div>
  )
}

// Ikon kecil lokal (alias untuk StatCard).
const FolderIcon = FolderKanban
const ChartIcon = ChartColumn
const WalletIcon = Wallet
const ProgressIcon = Percent

function AddItemDialog({ open, onOpenChange, projectId, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; projectId: string; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ name: "", quantity: "", unit: "pcs", unitPrice: "" })

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) { setPrevOpen(open); if (open) { setFormError(null); setValues({ name: "", quantity: "", unit: "pcs", unitPrice: "" }) } }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const qty = Number(values.quantity) || 0
    const price = Number(values.unitPrice.replace(/[^0-9]/g, "")) || 0
    if (values.name.trim().length < 2 || qty <= 0 || price <= 0) {
      setFormError("Lengkapi nama, jumlah (>0), dan harga anggaran.")
      return
    }
    setSaving(true)
    try {
      await api.post(`/api/projects/${projectId}/items`, { name: values.name.trim(), quantity: qty, unit: values.unit.trim() || "pcs", unitPrice: price })
      toast.success("Item anggaran ditambahkan.")
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menambah item.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Item Anggaran</DialogTitle>
          <DialogDescription>Material, upah, atau kebutuhan lain dalam proyek.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="space-y-2">
            <Label htmlFor="rab-item-name">Nama item *</Label>
            <Input id="rab-item-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="mis. Semen 50kg" maxLength={150} required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rab-qty">Jumlah *</Label>
              <Input id="rab-qty" inputMode="decimal" value={values.quantity} onChange={(e) => setValues({ ...values, quantity: e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".") })} placeholder="10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rab-unit">Satuan</Label>
              <Input id="rab-unit" value={values.unit} onChange={(e) => setValues({ ...values, unit: e.target.value })} maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rab-price">Harga/unit *</Label>
              <Input id="rab-price" inputMode="numeric" value={values.unitPrice} onChange={(e) => setValues({ ...values, unitPrice: e.target.value.replace(/[^0-9]/g, "") })} placeholder="65000" className="tabular" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Tambah"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddRealizationDialog({ open, onOpenChange, projectId, items, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; projectId: string
  items: { id: string; name: string }[]; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ description: "", amount: "", rabItemId: "" })

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) { setPrevOpen(open); if (open) { setFormError(null); setValues({ description: "", amount: "", rabItemId: "" }) } }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(values.amount.replace(/[^0-9]/g, "")) || 0
    if (values.description.trim().length < 2 || amount <= 0) {
      setFormError("Isi keterangan dan nominal realisasi.")
      return
    }
    setSaving(true)
    try {
      await api.post(`/api/projects/${projectId}/realizations`, {
        description: values.description.trim(),
        amount,
        rabItemId: values.rabItemId || null,
      })
      toast.success("Realisasi manual dicatat.")
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal mencatat realisasi.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Realisasi Manual</DialogTitle>
          <DialogDescription>Untuk biaya proyek di luar kasir: upah tukang, sewa alat, dsb.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="space-y-2">
            <Label htmlFor="real-desc">Keterangan *</Label>
            <Input id="real-desc" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} placeholder="mis. Upah 2 tukang hari ke-3" maxLength={150} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="real-amount">Nominal (Rp) *</Label>
            <Input id="real-amount" inputMode="numeric" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="350000" className="tabular" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="real-rabitem">Tautkan ke item anggaran (opsional)</Label>
            <select id="real-rabitem" value={values.rabItemId} onChange={(e) => setValues({ ...values, rabItemId: e.target.value })}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">— Tanpa tautan —</option>
              {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
            </select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Catat"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
