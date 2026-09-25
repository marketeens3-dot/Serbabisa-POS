// View Kategori: CRUD ringan dengan nama unik per tenant.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FolderTree, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  UserStatusBadge,
} from "@/components/app/shared";
import { useApi, useDebounced } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import type { CategoryDTO } from "@/lib/types";

export default function CategoriesView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const { data, error, loading, refresh } = useApi<{ data: CategoryDTO[] }>(
    `/api/categories?all=1${debounced ? `&search=${encodeURIComponent(debounced)}` : ""}`
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryDTO | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const categories = (data?.data ?? []).filter((c) =>
    c.name.toLowerCase().includes(debounced.toLowerCase())
  )

  function openForm(cat: CategoryDTO | null) {
    setEditing(cat)
    setName(cat?.name ?? "")
    setDescription(cat?.description ?? "")
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (name.trim().length < 2) {
      setFormError("Nama kategori minimal 2 karakter.")
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/api/categories/${editing.id}`, { name: name.trim(), description: description.trim() || null })
        toast.success(`Kategori "${name.trim()}" diperbarui.`)
      } else {
        await api.post("/api/categories", { name: name.trim(), description: description.trim() || null })
        toast.success(`Kategori "${name.trim()}" ditambahkan.`)
      }
      setDialogOpen(false)
      refresh()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menyimpan kategori.")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(cat: CategoryDTO) {
    try {
      await api.patch(`/api/categories/${cat.id}`, { action: cat.isActive ? "deactivate" : "activate" })
      toast.success(cat.isActive ? `Kategori "${cat.name}" dinonaktifkan.` : `Kategori "${cat.name}" diaktifkan.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal mengubah status kategori.")
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="Kategori"
        description="Kelompokkan produk dan jasa Anda agar mudah dicari di kasir."
        actions={
          <Button onClick={() => openForm(null)}>
            <Plus className="size-4" />
            Tambah Kategori
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kategori…" className="pl-9" aria-label="Cari kategori" />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={6} /></div>
        ) : !categories.length ? (
          <div className="p-6">
            <EmptyState
              icon={FolderTree}
              title="Belum ada kategori"
              description="Tambahkan kategori seperti Minuman, Makanan, atau Jasa Bengkel."
              action={<Button onClick={() => openForm(null)}><Plus className="size-4" />Tambah Kategori</Button>}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead className="hidden sm:table-cell">Deskripsi</TableHead>
                <TableHead className="text-right">Jumlah item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm max-w-[260px] truncate">
                    {cat.description ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="tabular">{cat.itemCount}</Badge>
                  </TableCell>
                  <TableCell>
                    {cat.isActive ? <UserStatusBadge status="ACTIVE" /> : <UserStatusBadge status="INACTIVE" />}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openForm(cat)} aria-label={`Ubah kategori ${cat.name}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cat.isActive ? "text-destructive hover:text-destructive" : "text-primary hover:text-primary"}
                        onClick={() => handleToggleActive(cat)}
                      >
                        {cat.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => !saving && setDialogOpen(v)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Ubah Kategori" : "Kategori Baru"}</DialogTitle>
            <DialogDescription>Nama harus unik — kategori dengan nama sama akan ditolak.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <p className="text-sm text-destructive" role="alert">{formError}</p>}
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nama kategori *</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="cth: Minuman"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Deskripsi (opsional)</Label>
              <Textarea id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
