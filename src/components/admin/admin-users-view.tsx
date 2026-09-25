// Manajemen user oleh Super Admin: daftar, cari, filter, tambah user (tenant+profile+template atomic),
// hasil password sementara ditampilkan SATU KALI.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Copy, KeyRound, Plus, Search, ShieldCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  PaginationControls,
  UserStatusBadge,
} from "@/components/app/shared";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeID } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminUserDTO, Paginated } from "@/lib/types";

// Gaya kolom header tabel — uppercase muted (bahasa desain tabel proyek).
const TH = "text-xs uppercase tracking-wide text-muted-foreground font-medium";

export default function AdminUsersView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [status, setStatus] = useState("ALL")
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)

  useResetOnKeyChange(`${debounced}|${status}`, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    if (status !== "ALL") params.set("status", status)
    return params.toString()
  }, [debounced, status, page])

  const { data, error, loading, refresh } = useApi<Paginated<AdminUserDTO>>(`/api/admin/users?${query}`)
  const users = data?.data ?? []

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Manajemen Pengguna"
        description={
          data
            ? `Buat, aktifkan, nonaktifkan, dan reset akses akun kasir — ${data.total} user terdaftar.`
            : "Buat, aktifkan, nonaktifkan, dan reset akses akun kasir."
        }
        actions={
          <Button onClick={() => setCreateOpen(true)} className="active:scale-[0.98]">
            <UserPlus className="size-4" />
            Tambah User
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau toko…"
            className="pl-9 pr-9"
            aria-label="Cari user"
          />
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
        ) : !users.length ? (
          <div className="p-6">
            <EmptyState
              icon={UserPlus}
              title={debounced || status !== "ALL" ? "Tidak ada user yang cocok" : "Belum ada user"}
              description={
                debounced || status !== "ALL"
                  ? "Coba kata kunci atau filter lain."
                  : "Tambahkan user kasir pertama — tenant dan template nota dibuat otomatis."
              }
              action={<Button onClick={() => setCreateOpen(true)} className="active:scale-[0.98]"><Plus className="size-4" />Tambah User</Button>}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Nama</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Email</TableHead>
                <TableHead className={cn(TH, "hidden sm:table-cell")}>Toko</TableHead>
                <TableHead className={TH}>Status</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>Login terakhir</TableHead>
                <TableHead className={cn(TH, "hidden xl:table-cell")}>Dibuat</TableHead>
                <TableHead className={cn(TH, "text-right")}>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="hover:bg-muted/40">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="size-8 rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 flex items-center justify-center text-xs font-semibold shrink-0"
                        aria-hidden="true"
                      >
                        {initials(u.fullName)}
                      </span>
                      <a href={`#/admin/users/${u.id}`} className="font-medium hover:text-primary hover:underline truncate max-w-[150px] sm:max-w-none rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        {u.fullName}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground max-w-[220px] truncate">{u.email}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[140px]">{u.tenant?.businessName ?? "—"}</span>
                      {u.tenant && !u.tenant.isActive && <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400 shrink-0">toko off</Badge>}
                    </div>
                  </TableCell>
                  <TableCell><UserStatusBadge status={u.status} /></TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm tabular">
                    {u.lastLoginAt ? formatDateTimeID(u.lastLoginAt) : "Belum pernah"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-muted-foreground text-sm tabular">
                    {formatDateTimeID(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      href={`#/admin/users/${u.id}`}
                      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:scale-[0.96]"
                      aria-label={`Lihat detail ${u.fullName}`}
                      title="Lihat detail user"
                    >
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </a>
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

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
  )
}

type CreateResult = { user: AdminUserDTO; temporaryPassword: string }

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<"form" | "result">("form")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [values, setValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    businessName: "",
    whatsappNumber: "",
    address: "",
  })

  useEffect(() => {
    if (open) {
      setStep("form")
      setResult(null)
      setError(null)
      setCopied(false)
      setValues({ fullName: "", email: "", phone: "", businessName: "", whatsappNumber: "", address: "" })
    }
  }, [open])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (values.fullName.trim().length < 2 || values.businessName.trim().length < 2) {
      setError("Nama user dan nama toko minimal 2 karakter.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
      setError("Email tidak valid.")
      return
    }
    setSaving(true)
    try {
      const res = await api.post<CreateResult>("/api/admin/users", {
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || null,
        businessName: values.businessName.trim(),
        whatsappNumber: values.whatsappNumber.trim() || null,
        address: values.address.trim() || null,
      })
      setResult(res)
      setStep("result")
      onCreated()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Gagal membuat user.")
    } finally {
      setSaving(false)
    }
  }

  async function copyPassword() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      setCopied(true)
      toast.success("Password disalin ke clipboard.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Gagal menyalin — catat password secara manual.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Tambah User Kasir</DialogTitle>
              <DialogDescription>
                Tenant, profil, dan template nota dibuat otomatis dalam satu transaksi atomik.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">
                  {error}
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="cu-name">Nama lengkap *</label>
                <Input id="cu-name" value={values.fullName} onChange={(e) => setValues({ ...values, fullName: e.target.value })} placeholder="cth: Andi Pratama" autoFocus required />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cu-email">Email *</label>
                  <Input id="cu-email" type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="andi@toko.com" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cu-phone">Nomor HP</label>
                  <Input id="cu-phone" inputMode="tel" value={values.phone} onChange={(e) => setValues({ ...values, phone: e.target.value })} placeholder="08xxxxxxx" />
                </div>
              </div>
              <div className="border-t pt-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Informasi toko</p>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cu-store">Nama toko *</label>
                  <Input id="cu-store" value={values.businessName} onChange={(e) => setValues({ ...values, businessName: e.target.value })} placeholder="cth: Toko Maju Jaya" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cu-wa">Nomor WhatsApp toko</label>
                  <Input id="cu-wa" inputMode="tel" value={values.whatsappNumber} onChange={(e) => setValues({ ...values, whatsappNumber: e.target.value })} placeholder="08xxxxxxx" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="cu-addr">Alamat toko</label>
                  <Input id="cu-addr" value={values.address} onChange={(e) => setValues({ ...values, address: e.target.value })} placeholder="Jl. …" />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="active:scale-[0.98]">Batal</Button>
                <Button type="submit" disabled={saving} className="active:scale-[0.98]">
                  <KeyRound className="size-4" />
                  {saving ? "Membuat…" : "Buat user & password sementara"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          result && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" />
                  User berhasil dibuat
                </DialogTitle>
                <DialogDescription>
                  Password sementara hanya ditampilkan SEKALI ini — tidak disimpan plaintext di database.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-xl border bg-muted/40 p-4 space-y-2.5 text-sm">
                  <Row label="Nama" value={result.user.fullName} />
                  <Row label="Email" value={result.user.email} />
                  <Row label="Toko" value={result.user.tenant?.businessName ?? "—"} />
                  <Row label="Role" value="Kasir (USER)" />
                </div>
                <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Password sementara</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 font-mono text-base font-bold tracking-wider select-all">{result.temporaryPassword}</code>
                    <Button variant="outline" size="sm" onClick={copyPassword}>
                      <Copy className="size-4" />
                      {copied ? "Tersalin" : "Salin"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2.5">
                    User wajib mengganti password ini saat login pertama.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full active:scale-[0.98]" onClick={() => onOpenChange(false)}>
                  Konfirmasi &amp; tutup
                </Button>
              </DialogFooter>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  )
}
