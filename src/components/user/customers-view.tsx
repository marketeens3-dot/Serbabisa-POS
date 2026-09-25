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

      <div className="rounded-xl border bg-card overflow-hidden">
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
