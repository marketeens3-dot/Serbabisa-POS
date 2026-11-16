// View Pelanggan: list + CRUD + cari + tombol WhatsApp.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageCircle, Phone, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CustomerFormFields } from "@/components/user/customer-form";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MoneyCell,
  PageHeader,
  PaginationControls,
} from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import type { CustomerDTO, Paginated } from "@/lib/types";

export default function CustomersView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerDTO | null>(null)
  const [pointsTarget, setPointsTarget] = useState<CustomerDTO | null>(null)

  useResetOnKeyChange(debounced, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    return params.toString()
  }, [debounced, page])

  const { data, error, loading, refresh } = useApi<Paginated<CustomerDTO>>(`/api/customers?${query}`)
  const customers = data?.data ?? []

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Pelanggan"
        description="Data pelanggan minimal — nama dan nomor WhatsApp saja sudah cukup."
        actions={
          <>
            <ExportMenu params={{ type: "customers" }} />
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="size-4" />
              Tambah Pelanggan
            </Button>
          </>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / telepon / email…"
          className="pl-9"
          aria-label="Cari pelanggan"
        />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !customers.length ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan agar bisa dipilih saat transaksi dan menerima nota WhatsApp."
              action={<Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-4" />Tambah Pelanggan</Button>}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden sm:table-cell">Telepon</TableHead>
                <TableHead className="hidden lg:table-cell">Transaksi</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Total belanja</TableHead>
                <TableHead className="hidden md:table-cell">Terakhir belanja</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0"
                        aria-hidden="true"
                      >
                        {initials(c.name)}
                      </span>
                      <a href={`#/app/customers/${c.id}`} className="hover:text-primary hover:underline truncate">
                        {c.name}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell tabular text-muted-foreground">
                    {c.phone ? formatPhoneDisplay(c.phone) : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <button
                      type="button"
                      onClick={() => setPointsTarget(c)}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-semibold tabular hover:bg-amber-500/20 transition-colors"
                      title="Klik untuk sesuaikan / redeem poin"
                    >
                      {c.points ?? 0} poin
                    </button>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular text-muted-foreground">{c.transactionCount ?? 0}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    <MoneyCell amount={c.totalSpent ?? 0} className="text-muted-foreground" />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {c.lastTransactionAt ? formatDateTimeID(c.lastTransactionAt) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.phone && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          aria-label={`Chat WhatsApp ${c.name}`}
                          onClick={() => window.open(`https://wa.me/${c.phone}`, "_blank", "noopener,noreferrer")}
                        >
                          <MessageCircle className="size-3.5 text-primary" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setFormOpen(true) }} aria-label={`Ubah ${c.name}`}>
                        Ubah
                      </Button>
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

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={() => {
          setFormOpen(false)
          refresh()
        }}
      />

      <PointsDialog
        target={pointsTarget}
        onOpenChange={(v) => !v && setPointsTarget(null)}
        onSaved={() => {
          setPointsTarget(null)
          refresh()
        }}
      />
    </div>
  )
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

/** Dialog sesuaikan/redeem poin loyalty (earn otomatis dari checkout). */
function PointsDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: CustomerDTO | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ points: "", type: "REDEEM", note: "" })

  const [prevTarget, setPrevTarget] = useState<CustomerDTO | null>(null)
  if (prevTarget !== target) {
    setPrevTarget(target)
    if (target) { setFormError(null); setValues({ points: "", type: "REDEEM", note: "" }) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setFormError(null)
    const raw = values.points.trim()
    const magnitude = Number(raw.replace(/[^0-9]/g, "")) || 0
    const sign = raw.trim().startsWith("-") ? -1 : 1
    const points = magnitude * sign
    if (magnitude <= 0) {
      setFormError("Isi jumlah poin (boleh diawali minus untuk menambah poin manual).")
      return
    }
    setSaving(true)
    try {
      const res = await api.post<{ points: number }>(`/api/customers/${target.id}/points`, {
        points: values.type === "ADJUST" ? points : -magnitude,
        type: values.type,
        note: values.note.trim() || null,
      })
      toast.success(`Poin ${target.name} sekarang ${res.points}.`)
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menyesuaikan poin.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Poin {target?.name ?? ""}
          </DialogTitle>
          <DialogDescription>
            {target ? `Saat ini: ${target.points ?? 0} poin. Earn otomatis: 1 poin per Rp 10.000 belanja.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
              {formError}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="pts-type">Jenis</Label>
            <select id="pts-type" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="REDEEM">Redeem (kurangi poin)</option>
              <option value="ADJUST">Koreksi (tambah / kurang manual)</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pts-amount">
              {values.type === "REDEEM" ? "Poin yang ditukar *" : "Jumlah poin (awali minus untuk mengurangi) *"}
            </Label>
            <Input id="pts-amount" value={values.points} onChange={(e) => setValues({ ...values, points: e.target.value.replace(/[^0-9-]/g, "") })} placeholder={values.type === "REDEEM" ? "50" : "50 / -50"} className="tabular" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pts-note">Catatan (opsional)</Label>
            <Textarea id="pts-note" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} maxLength={2000} placeholder="mis. tukar poin menjadi selimut" />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving || !target}>{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: CustomerDTO | null
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ name: "", phone: "", email: "", address: "", notes: "" })

  useEffect(() => {
    if (open) {
      setFormError(null)
      setValues({
        name: editing?.name ?? "",
        phone: editing?.phone ?? "",
        email: editing?.email ?? "",
        address: editing?.address ?? "",
        notes: editing?.notes ?? "",
      })
    }
  }, [open, editing])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (values.name.trim().length < 2) {
      setFormError("Nama minimal 2 karakter.")
      return
    }
    setSaving(true)
    const payload = {
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
      address: values.address.trim() || null,
      notes: values.notes.trim() || null,
    }
    try {
      if (editing) {
        await api.patch(`/api/customers/${editing.id}`, payload)
        toast.success(`Pelanggan "${payload.name}" diperbarui.`)
      } else {
        await api.post("/api/customers", payload)
        toast.success(`Pelanggan "${payload.name}" ditambahkan.`)
      }
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menyimpan pelanggan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Ubah Pelanggan" : "Pelanggan Baru"}</DialogTitle>
          <DialogDescription>
            Cukup isi yang diperlukan — nomor HP otomatis dinormalisasi ke format WhatsApp (62…).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
              {formError}
            </p>
          )}
          <CustomerFormFields values={values} onChange={setValues} />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
