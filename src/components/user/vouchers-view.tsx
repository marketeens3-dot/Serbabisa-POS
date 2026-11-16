// View Voucher/Promo: CRUD voucher diskon (persen/nominal) — dipakai di kasir.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Percent, Plus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/app/shared";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateID, formatIDR } from "@/lib/format";

type VoucherRow = {
  id: string; code: string; type: "PERCENT" | "FIXED"; value: number; minPurchase: number
  maxDiscount: number | null; usageLimit: number | null; usageCount: number
  isActive: boolean; expiresAt: string | null; createdAt: string
}

export default function VouchersView() {
  const { data, error, loading, refresh } = useApi<{ data: VoucherRow[] }>("/api/vouchers")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<VoucherRow | null>(null)

  async function toggleActive(v: VoucherRow) {
    try {
      await api.patch(`/api/vouchers/${v.id}`, { isActive: !v.isActive })
      toast.success(v.isActive ? `Voucher ${v.code} dinonaktifkan.` : `Voucher ${v.code} diaktifkan.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal ubah voucher.")
    }
  }

  async function remove(v: VoucherRow) {
    try {
      await api.del(`/api/vouchers/${v.id}`)
      toast.success(`Voucher ${v.code} dihapus.`)
      refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal hapus voucher.")
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Voucher & Promo"
        description="Diskon persen atau nominal dengan syarat minimal belanja — dipakai kasir dengan kode."
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-4" />Voucher Baru</Button>
        }
      />

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={6} /></div>
        ) : !(data?.data ?? []).length ? (
          <div className="p-6">
            <EmptyState icon={Ticket} title="Belum ada voucher" description="Buat voucher promosi, mis. PROMO10 = diskon 10% minimal belanja 100rb."
              action={<Button onClick={() => { setEditing(null); setFormOpen(true) }}><Plus className="size-4" />Voucher Baru</Button>} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Diskon</TableHead>
                <TableHead className="hidden sm:table-cell">Syarat</TableHead>
                <TableHead className="hidden md:table-cell">Pemakaian</TableHead>
                <TableHead className="hidden lg:table-cell">Kedaluwarsa</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.data ?? []).map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-semibold">{v.code}
                    {!v.isActive && <Badge variant="outline" className="ml-2 text-[10px]">nonaktif</Badge>}
                  </TableCell>
                  <TableCell>
                    {v.type === "PERCENT" ? `${v.value}%${v.maxDiscount ? ` (maks ${formatIDR(v.maxDiscount)})` : ""}` : formatIDR(v.value)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{v.minPurchase > 0 ? `min. ${formatIDR(v.minPurchase)}` : "tanpa syarat"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground tabular">{v.usageCount}{v.usageLimit ? ` / ${v.usageLimit}` : ""}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{v.expiresAt ? formatDateID(v.expiresAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(v); setFormOpen(true) }}>Ubah</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(v)}>{v.isActive ? "Nonaktif" : "Aktif"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(v)}>Hapus</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <VoucherFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={() => { setFormOpen(false); refresh() }} />
    </div>
  )
}

function VoucherFormDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: VoucherRow | null; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ code: "", type: "PERCENT", value: "", minPurchase: "", maxDiscount: "", usageLimit: "", expiresAt: "" } as { code: string; type: "PERCENT" | "FIXED"; value: string; minPurchase: string; maxDiscount: string; usageLimit: string; expiresAt: string })

  const [prevKey, setPrevKey] = useState<string>("")
  const key = `${open}-${editing?.id ?? "new"}`
  if (prevKey !== key) {
    setPrevKey(key)
    if (open) {
      setFormError(null)
      setValues(editing
        ? {
            code: editing.code, type: editing.type,
            value: String(editing.value),
            minPurchase: editing.minPurchase ? String(editing.minPurchase) : "",
            maxDiscount: editing.maxDiscount ? String(editing.maxDiscount) : "",
            usageLimit: editing.usageLimit ? String(editing.usageLimit) : "",
            expiresAt: editing.expiresAt ? editing.expiresAt.slice(0, 10) : "",
          }
        : { code: "", type: "PERCENT", value: "", minPurchase: "", maxDiscount: "", usageLimit: "", expiresAt: "" })
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const num = (s: string) => Number(s.replace(/[^0-9]/g, "")) || 0
    const value = num(values.value)
    if (values.code.trim().length < 3 || value <= 0) { setFormError("Isi kode (min 3 karakter) dan nilai voucher."); return }
    if (values.type === "PERCENT" && value > 100) { setFormError("Persen maksimal 100."); return }
    setSaving(true)
    const payload = {
      code: values.code.trim().toUpperCase(),
      type: values.type,
      value,
      minPurchase: num(values.minPurchase),
      maxDiscount: values.maxDiscount ? num(values.maxDiscount) : null,
      usageLimit: values.usageLimit ? num(values.usageLimit) : null,
      expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59+07:00`).toISOString() : null,
    }
    try {
      if (editing) await api.patch(`/api/vouchers/${editing.id}`, payload)
      else await api.post("/api/vouchers", payload)
      toast.success(editing ? "Voucher diperbarui." : `Voucher ${payload.code} dibuat.`)
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal menyimpan voucher.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Percent className="size-4 text-primary" />{editing ? "Ubah Voucher" : "Voucher Baru"}</DialogTitle>
          <DialogDescription>Kode voucher unik per toko, disimpan huruf besar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-code">Kode *</Label>
              <Input id="v-code" value={values.code} onChange={(e) => setValues({ ...values, code: e.target.value.toUpperCase().replace(/[^A-Za-z0-9_-]/g, "") })} placeholder="PROMO10" maxLength={30} className="font-mono" disabled={!!editing} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-type">Jenis</Label>
              <select id="v-type" value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value as "PERCENT" | "FIXED" })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="PERCENT">Persen (%)</option>
                <option value="FIXED">Nominal (Rp)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-value">{values.type === "PERCENT" ? "Persen diskon *" : "Nominal diskon (Rp) *"}</Label>
              <Input id="v-value" inputMode="numeric" value={values.value} onChange={(e) => setValues({ ...values, value: e.target.value.replace(/[^0-9]/g, "") })} placeholder={values.type === "PERCENT" ? "10" : "50000"} className="tabular" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-min">Minimal belanja (Rp)</Label>
              <Input id="v-min" inputMode="numeric" value={values.minPurchase} onChange={(e) => setValues({ ...values, minPurchase: e.target.value.replace(/[^0-9]/g, "") })} placeholder="0" className="tabular" />
            </div>
          </div>
          {values.type === "PERCENT" && (
            <div className="space-y-2">
              <Label htmlFor="v-max">Maksimal diskon (Rp, opsional)</Label>
              <Input id="v-max" inputMode="numeric" value={values.maxDiscount} onChange={(e) => setValues({ ...values, maxDiscount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="mis. 100000" className="tabular" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="v-limit">Batas pemakaian</Label>
              <Input id="v-limit" inputMode="numeric" value={values.usageLimit} onChange={(e) => setValues({ ...values, usageLimit: e.target.value.replace(/[^0-9]/g, "") })} placeholder="kosong = tanpa batas" className="tabular" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="v-exp">Kedaluwarsa</Label>
              <Input id="v-exp" type="date" value={values.expiresAt} onChange={(e) => setValues({ ...values, expiresAt: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
