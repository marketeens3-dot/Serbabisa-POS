// Manajemen toko (tenant): daftar + edit info + aktif/nonaktif.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Power, Search, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PaginationControls, UserStatusBadge } from "@/components/app/shared";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeID } from "@/lib/format";
import { cn } from "@/lib/utils";

// Gaya kolom header tabel — uppercase muted (bahasa desain tabel proyek).
const TH = "text-xs uppercase tracking-wide text-muted-foreground font-medium";

type TenantRow = {
  id: string
  businessName: string
  slug: string
  phone: string | null
  whatsappNumber: string | null
  address: string | null
  isActive: boolean
  createdAt: string
  owner: { id: string; fullName: string; email: string; phone: string | null; status: string; lastLoginAt: string | null } | null
  transactionCount: number
  itemCount: number
}

export default function AdminTenantsView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [status, setStatus] = useState("ALL")
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<TenantRow | null>(null)
  const [toggling, setToggling] = useState<TenantRow | null>(null)

  useResetOnKeyChange(`${debounced}|${status}`, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    if (status !== "ALL") params.set("status", status)
    return params.toString()
  }, [debounced, status, page])

  const { data, error, loading, refresh } = useApi<{ data: TenantRow[]; page: number; totalPages: number; total: number }>(
    `/api/admin/tenants?${query}`
  )
  const tenants = data?.data ?? []

  async function handleToggle() {
    if (!toggling) return
    const action = toggling.isActive ? "deactivate" : "activate"
    try {
      await api.patch(`/api/admin/tenants/${toggling.id}`, { action })
      toast.success(
        action === "deactivate"
          ? `Toko "${toggling.businessName}" dinonaktifkan — kasirnya ikut dinonaktifkan & sesi dicabut.`
          : `Toko "${toggling.businessName}" diaktifkan kembali.`
      )
      setToggling(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal mengubah status toko.")
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Toko"
        description={
          data
            ? `Setiap user memiliki satu toko terisolasi — datanya tidak dapat saling diakses. Total ${data.total} toko.`
            : "Setiap user memiliki satu toko terisolasi — datanya tidak dapat saling diakses."
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama toko / slug…" className="pl-9 pr-9" aria-label="Cari toko" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="Bersihkan pencarian"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]" aria-label="Filter status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua status</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !tenants.length ? (
          <div className="p-6">
            <EmptyState icon={Store} title="Belum ada toko" description="Toko dibuat otomatis saat Super Admin menambahkan user baru." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Nama toko</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Pemilik</TableHead>
                <TableHead className={cn(TH, "hidden sm:table-cell text-right")}>Transaksi</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell text-right")}>Item</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>Dibuat</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={cn(TH, "text-right")}>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id} className={cn("hover:bg-muted/40", !t.isActive && "opacity-70")}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-8 rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <Building2 className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate">{t.businessName}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.owner ? (
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.owner.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{t.owner.email}</p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right tabular text-muted-foreground">{t.transactionCount}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right tabular text-muted-foreground">{t.itemCount}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm tabular">{formatDateTimeID(t.createdAt)}</TableCell>
                  <TableCell>
                    {t.isActive ? <UserStatusBadge status="ACTIVE" /> : <UserStatusBadge status="INACTIVE" />}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 px-0 active:scale-[0.96]"
                        onClick={() => setEditing(t)}
                        aria-label={`Ubah toko ${t.businessName}`}
                        title="Ubah data toko"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "size-8 px-0 active:scale-[0.96]",
                          t.isActive ? "text-destructive hover:text-destructive" : "text-primary hover:text-primary"
                        )}
                        onClick={() => setToggling(t)}
                        aria-label={t.isActive ? `Nonaktifkan toko ${t.businessName}` : `Aktifkan toko ${t.businessName}`}
                        title={t.isActive ? "Nonaktifkan toko" : "Aktifkan toko"}
                      >
                        <Power className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > 20 && (
        <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      )}

      <EditTenantDialog tenant={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />

      <AlertDialog open={!!toggling} onOpenChange={(v) => !v && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.isActive ? "Nonaktifkan" : "Aktifkan"} toko &ldquo;{toggling?.businessName}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.isActive
                ? "Seluruh user di toko ini ikut dinonaktifkan dan sesinya dicabut. Data transaksi tetap utuh."
                : "User pada toko ini yang nonaktif karena penonaktifan toko akan diaktifkan kembali."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggle}
              className={toggling?.isActive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              Ya, lanjutkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EditTenantDialog({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: TenantRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState({ businessName: "", phone: "", whatsappNumber: "", address: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tenant) {
      setValues({
        businessName: tenant.businessName,
        phone: tenant.phone ?? "",
        whatsappNumber: tenant.whatsappNumber ?? "",
        address: tenant.address ?? "",
      })
      setError(null)
    }
  }, [tenant])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant) return
    setError(null)
    if (values.businessName.trim().length < 2) {
      setError("Nama toko minimal 2 karakter.")
      return
    }
    setSaving(true)
    try {
      await api.patch(`/api/admin/tenants/${tenant.id}`, {
        businessName: values.businessName.trim(),
        phone: values.phone.trim() || null,
        whatsappNumber: values.whatsappNumber.trim() || null,
        address: values.address.trim() || null,
      })
      toast.success("Data toko diperbarui.")
      onSaved()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Gagal menyimpan data toko.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!tenant} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah Toko</DialogTitle>
          <DialogDescription>{tenant?.businessName}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="et-name">Nama toko</Label>
            <Input id="et-name" value={values.businessName} onChange={(e) => setValues({ ...values, businessName: e.target.value })} required minLength={2} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="et-phone">Telepon</Label>
              <Input id="et-phone" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} inputMode="tel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="et-wa">WhatsApp</Label>
              <Input id="et-wa" value={values.whatsappNumber} onChange={(e) => setValues({ ...values, whatsappNumber: e.target.value })} inputMode="tel" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="et-addr">Alamat</Label>
            <Input id="et-addr" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} maxLength={500} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="active:scale-[0.98]">Batal</Button>
            <Button type="submit" disabled={saving} className="active:scale-[0.98]">{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
