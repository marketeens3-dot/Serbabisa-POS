// Detail user oleh Super Admin: profil, toko, statistik, aksi (edit/aktif/nonaktif/reset), audit.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Activity, ArrowLeft, Copy, KeyRound, Power, Save, ShieldAlert, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ErrorState, LoadingRows, PageHeader, UserStatusBadge, MoneyCell } from "@/components/app/shared";
import { actionLabel } from "@/components/admin/admin-dashboard-view";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeID, formatIDR } from "@/lib/format";

type Detail = {
  user: import("@/lib/types").AdminUserDTO
  stats: { transactionCount: number; totalSales: number }
  auditEvents: import("@/lib/types").AuditLogDTO[]
}

export default function AdminUserDetailView({ userId }: { userId: string }) {
  const { data, error, loading, refresh } = useApi<Detail>(`/api/admin/users/${userId}`)
  const [editValues, setEditValues] = useState<Record<string, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<null | { action: "deactivate" | "activate" | "reset" }>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <a href="#/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <ArrowLeft className="size-4" /> Kembali ke daftar user
        </a>
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }

  const user = data?.user

  async function runAction(action: "deactivate" | "activate" | "reset") {
    setBusy(true)
    try {
      const res = await api.patch<{ temporaryPassword?: string }>(`/api/admin/users/${userId}`, { action })
      if (action === "reset" && res.temporaryPassword) {
        setTempPassword(res.temporaryPassword)
      } else {
        toast.success(
          action === "deactivate" ? "User dinonaktifkan — semua sesinya dicabut."
          : action === "activate" ? "User diaktifkan kembali."
          : "Akses di-reset."
        )
        setConfirm(null)
      }
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Aksi gagal.")
    } finally {
      setBusy(false)
      if (action !== "reset") setConfirm(null)
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editValues) return
    setSaving(true)
    try {
      await api.patch(`/api/admin/users/${userId}`, {
        fullName: editValues.fullName?.trim() || undefined,
        email: editValues.email?.trim() || undefined,
        businessName: editValues.businessName?.trim() || undefined,
        whatsappNumber: editValues.whatsappNumber?.trim() || null,
        address: editValues.address?.trim() || null,
      })
      toast.success("Data user diperbarui.")
      setEditValues(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal memperbarui user.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <a href="#/admin/users" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <ArrowLeft className="size-4" /> Kembali ke daftar user
      </a>

      {loading || !user ? (
        <LoadingRows rows={6} />
      ) : (
        <>
          <PageHeader
            title={user.fullName}
            description={`${user.email} · ${user.tenant?.businessName ?? "tanpa toko"}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {user.status === "ACTIVE" ? (
                  <Button variant="destructive" onClick={() => setConfirm({ action: "deactivate" })} className="active:scale-[0.98]">
                    <Power className="size-4" />
                    Nonaktifkan
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setConfirm({ action: "activate" })} className="active:scale-[0.98]">
                    <Power className="size-4" />
                    Aktifkan
                  </Button>
                )}
                <Button variant="outline" onClick={() => setConfirm({ action: "reset" })} className="active:scale-[0.98]">
                  <KeyRound className="size-4" />
                  Reset Akses
                </Button>
                {editValues ? (
                  <Button variant="ghost" onClick={() => setEditValues(null)}>Batal edit</Button>
                ) : (
                  <Button onClick={() => setEditValues({
                    fullName: user.fullName,
                    email: user.email,
                    businessName: user.tenant?.businessName ?? "",
                    whatsappNumber: user.tenant?.whatsappNumber ?? "",
                    address: user.tenant?.address ?? "",
                  })} className="active:scale-[0.98]">
                    Ubah data
                  </Button>
                )}
              </div>
            }
          />

          <div className="grid lg:grid-cols-3 gap-4 lg:gap-5">
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Profil</CardTitle>
                </CardHeader>
                <CardContent>
                  {editValues ? (
                    <form onSubmit={saveEdit} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="eu-name">Nama</Label>
                          <Input id="eu-name" value={editValues.fullName ?? ""} onChange={(e) => setEditValues({ ...editValues, fullName: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="eu-email">Email (login)</Label>
                          <Input id="eu-email" type="email" value={editValues.email ?? ""} onChange={(e) => setEditValues({ ...editValues, email: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="eu-store">Nama toko</Label>
                          <Input id="eu-store" value={editValues.businessName ?? ""} onChange={(e) => setEditValues({ ...editValues, businessName: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="eu-wa">WhatsApp toko</Label>
                          <Input id="eu-wa" value={editValues.whatsappNumber ?? ""} onChange={(e) => setEditValues({ ...editValues, whatsappNumber: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eu-addr">Alamat toko</Label>
                        <Input id="eu-addr" value={editValues.address ?? ""} onChange={(e) => setEditValues({ ...editValues, address: e.target.value })} />
                      </div>
                      <Button type="submit" disabled={saving} className="active:scale-[0.98]">
                        <Save className="size-4" />
                        {saving ? "Menyimpan…" : "Simpan perubahan"}
                      </Button>
                    </form>
                  ) : (
                    <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <Row label="Status" value={<UserStatusBadge status={user.status} />} />
                      <Row label="Role" value={<Badge variant="outline">Kasir</Badge>} />
                      <Row label="Nomor HP" value={user.phone ?? "—"} />
                      <Row label="Wajib ganti password" value={user.mustChangePassword ? "Ya" : "Tidak"} />
                      <Row label="Login terakhir" value={<span className="tabular">{user.lastLoginAt ? formatDateTimeID(user.lastLoginAt) : "Belum pernah"}</span>} />
                      <Row label="Dibuat" value={<span className="tabular">{formatDateTimeID(user.createdAt)}</span>} />
                      <Row label="Transaksi" value={<span className="tabular">{`${data?.stats.transactionCount ?? 0} transaksi`}</span>} />
                      <Row label="Total penjualan" value={<MoneyCell amount={data?.stats.totalSales ?? 0} className="font-semibold" />} />
                    </dl>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Aktivitas user (10 event terakhir)</CardTitle>
                </CardHeader>
                <CardContent>
                  {!data?.auditEvents?.length ? (
                    <div className="rounded-xl border border-dashed bg-muted/20 py-10 flex flex-col items-center text-center">
                      <div
                        className="size-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-3"
                        aria-hidden="true"
                      >
                        <Activity className="size-5 text-primary" />
                      </div>
                      <p className="text-sm font-semibold">Belum ada aktivitas</p>
                      <p className="text-xs text-muted-foreground mt-1">Event audit terkait user ini akan muncul di sini.</p>
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {data.auditEvents.map((ev) => (
                        <li key={ev.id} className="py-2.5 px-2 -mx-2 rounded-lg hover:bg-muted/40 transition-colors flex items-start gap-3 text-sm">
                          <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{actionLabel(ev.action)}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDateTimeID(ev.createdAt)}
                              {ev.actorName ? ` · oleh ${ev.actorName}` : ""}
                              {ev.metadata && typeof ev.metadata === "object" && "reason" in (ev.metadata as Record<string, unknown>) && typeof (ev.metadata as Record<string, unknown>).reason === "string"
                                ? ` · alasan: ${(ev.metadata as Record<string, unknown>).reason}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Toko</CardTitle>
                <CardDescription>Tenant milik user ini</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {user.tenant ? (
                  <>
                    <Row label="Nama" value={user.tenant.businessName} />
                    <Row label="Slug" value={<span className="font-mono text-xs">{user.tenant.slug}</span>} />
                    <Row label="Status toko" value={<UserStatusBadge status={user.tenant.isActive ? "ACTIVE" : "INACTIVE"} />} />
                    <Row label="Dibuat" value={<span className="tabular">{formatDateTimeID(user.tenant.createdAt)}</span>} />
                    <p className="text-xs text-muted-foreground pt-1">
                      Ubah detail toko lainnya di halaman Toko.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 py-8 flex flex-col items-center text-center">
                    <div
                      className="size-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 flex items-center justify-center mb-3"
                      aria-hidden="true"
                    >
                      <Store className="size-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">User ini tidak memiliki toko.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Konfirmasi aksi */}
      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              {confirm?.action === "deactivate" && "Nonaktifkan user ini?"}
              {confirm?.action === "activate" && "Aktifkan kembali user ini?"}
              {confirm?.action === "reset" && "Reset akses user ini?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.action === "deactivate" &&
                "User tidak dapat masuk lagi dan semua sesi aktifnya langsung dicabut. Transaksi lama tetap utuh."}
              {confirm?.action === "activate" &&
                "User dapat kembali masuk dengan password yang sama (atau password sementara bila belum diganti)."}
              {confirm?.action === "reset" &&
                "Password baru (sementara) dibuat, semua sesi dicabut, dan user wajib ganti password saat login berikutnya. Password lama tidak pernah ditampilkan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (confirm) runAction(confirm.action)
              }}
              disabled={busy}
              className={confirm?.action === "deactivate" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {busy ? "Memproses…" : "Ya, lanjutkan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog password sementara (tampil sekali) */}
      <AlertDialog open={!!tempPassword} onOpenChange={(v) => !v && setTempPassword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Akses di-reset</AlertDialogTitle>
            <AlertDialogDescription>
              Password sementara baru — tampil SEKALI ini saja. User wajib menggantinya saat login berikutnya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-base font-bold tracking-wider select-all">{tempPassword}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (tempPassword) {
                    await navigator.clipboard.writeText(tempPassword).catch(() => undefined)
                    toast.success("Password disalin.")
                  }
                }}
              >
                <Copy className="size-4" />
                Salin
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setTempPassword(null)}>Konfirmasi &amp; tutup</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  )
}
