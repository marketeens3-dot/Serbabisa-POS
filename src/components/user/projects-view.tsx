// View RAB (Rencana Anggaran Biaya): daftar proyek + buat proyek baru.
// Detail proyek (item anggaran & realisasi) di #/app/projects/[id].
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderKanban, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MoneyCell, EmptyState, ErrorState, LoadingRows, PageHeader, PaginationControls } from "@/components/app/shared";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateID, formatIDR } from "@/lib/format";
import type { Paginated } from "@/lib/types";

export type ProjectRow = {
  id: string
  code: string
  name: string
  description: string | null
  status: "PLANNED" | "ACTIVE" | "COMPLETED" | "CANCELLED"
  budgetTotal: number
  realizationTotal: number
  itemCount: number
  customerId: string | null
  customerName: string | null
  customerPhone: string | null
  startDate: string | null
  endDate: string | null
  createdAt: string
}

export const PROJECT_STATUS_TONES: Record<ProjectRow["status"], string> = {
  PLANNED: "bg-muted text-muted-foreground",
  ACTIVE: "bg-primary/10 text-primary",
  COMPLETED: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  CANCELLED: "bg-destructive/10 text-destructive",
}

export const PROJECT_STATUS_LABELS: Record<ProjectRow["status"], string> = {
  PLANNED: "Direncanakan",
  ACTIVE: "Berjalan",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
}

export function ProjectStatusBadge({ status }: { status: ProjectRow["status"] }) {
  return <Badge className={`${PROJECT_STATUS_TONES[status]} border-0`}>{PROJECT_STATUS_LABELS[status]}</Badge>
}

export default function ProjectsView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  useResetOnKeyChange(debounced, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    if (status) params.set("status", status)
    return params.toString()
  }, [debounced, page, status])

  const { data, error, loading, refresh } = useApi<Paginated<ProjectRow>>(`/api/projects?${query}`)
  const projects = data?.data ?? []

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Proyek / RAB"
        description="Rencana Anggaran Biaya per proyek — anggaran vs realisasi otomatis terisi dari kasir."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            Proyek Baru
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-4 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / kode proyek…" className="pl-9" aria-label="Cari proyek" />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          aria-label="Filter status proyek"
        >
          <option value="">Semua status</option>
          <option value="PLANNED">Direncanakan</option>
          <option value="ACTIVE">Berjalan</option>
          <option value="COMPLETED">Selesai</option>
          <option value="CANCELLED">Dibatalkan</option>
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={6} /></div>
        ) : !projects.length ? (
          <div className="p-6">
            <EmptyState
              icon={FolderKanban}
              title="Belum ada proyek"
              description="Buat proyek untuk melacak anggaran dan realisasinya — penjualan via kasir dengan pilihan proyek otomatis tercatat sebagai realisasi."
              action={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" />Proyek Baru</Button>}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyek</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Pelanggan</TableHead>
                <TableHead className="text-right">Anggaran</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Realisasi</TableHead>
                <TableHead className="hidden md:table-cell text-right">Sisa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                const remaining = p.budgetTotal - p.realizationTotal
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <a href={`#/app/projects/${p.id}`} className="hover:text-primary hover:underline">
                        <span className="block">{p.name}</span>
                        <span className="text-xs text-muted-foreground font-normal">{p.code} · {p.itemCount} item anggaran</span>
                      </a>
                    </TableCell>
                    <TableCell><ProjectStatusBadge status={p.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{p.customerName ?? "—"}</TableCell>
                    <TableCell className="text-right"><MoneyCell amount={p.budgetTotal} /></TableCell>
                    <TableCell className="hidden sm:table-cell text-right">
                      <span className="tabular">{formatIDR(p.realizationTotal)}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <span className={`tabular ${remaining < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {formatIDR(remaining)}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      )}

      <CreateProjectDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => { setFormOpen(false); refresh() }}
      />
    </div>
  )
}

function CreateProjectDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ name: "", code: "", description: "", startDate: "", endDate: "" })

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) { setFormError(null); setValues({ name: "", code: "", description: "", startDate: "", endDate: "" }) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (values.name.trim().length < 2) { setFormError("Nama proyek minimal 2 karakter."); return }
    setSaving(true)
    try {
      await api.post("/api/projects", {
        name: values.name.trim(),
        code: values.code.trim() || null,
        description: values.description.trim() || null,
        startDate: values.startDate ? new Date(`${values.startDate}T00:00:00+07:00`).toISOString() : null,
        endDate: values.endDate ? new Date(`${values.endDate}T23:59:59+07:00`).toISOString() : null,
      })
      toast.success(`Proyek "${values.name.trim()}" dibuat.`)
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal membuat proyek.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Proyek / RAB Baru</DialogTitle>
          <DialogDescription>Kode proyek otomatis dibuat (RAB-YYYY-NNNN) bila dikosongkan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="proj-name">Nama proyek *</Label>
            <Input id="proj-name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="mis. Renovasi Toko Jl. Merdeka" maxLength={150} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-code">Kode (opsional)</Label>
            <Input id="proj-code" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value })} placeholder="RAB-2026-0001" maxLength={40} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="proj-start">Mulai</Label>
              <Input id="proj-start" type="date" value={values.startDate} onChange={(e) => setValues({ ...values, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-end">Selesai (target)</Label>
              <Input id="proj-end" type="date" value={values.endDate} onChange={(e) => setValues({ ...values, endDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Deskripsi (opsional)</Label>
            <Textarea id="proj-desc" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} rows={2} maxLength={1000} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Buat Proyek"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
