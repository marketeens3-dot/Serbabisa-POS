// View Hutang Piutang: tab Piutang (jual tempo) & Hutang supplier (beli tempo),
// cicilan, umur jatuh tempo, catat hutang manual.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HandCoins, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingRows, MoneyCell, PageHeader, PaginationControls, StatCard } from "@/components/app/shared";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateID, formatIDR } from "@/lib/format";

export type DebtRow = {
  id: string
  type: "RECEIVABLE" | "PAYABLE"
  amount: number
  paidAmount: number
  remaining: number
  status: "UNPAID" | "PARTIAL" | "PAID"
  dueDate: string | null
  isOverdue: boolean
  daysOverdue: number
  customerId: string | null
  customerName: string | null
  supplierId: string | null
  supplierName: string | null
  transactionId: string | null
  invoiceNumber: string | null
  purchaseId: string | null
  purchaseCode: string | null
  note: string | null
  paymentCount: number
  createdAt: string
}

type DebtList = { data: DebtRow[]; page: number; pageSize: number; total: number; totalPages: number; summary: { receivableOutstanding: number; payableOutstanding: number } }

export default function DebtsView() {
  const [tab, setTab] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE")
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("UNPAID")
  const [payTarget, setPayTarget] = useState<DebtRow | null>(null)
  const [manualOpen, setManualOpen] = useState(false)

  useResetOnKeyChange(debounced, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20", type: tab })
    if (debounced) params.set("search", debounced)
    if (status) params.set("status", status)
    return params.toString()
  }, [debounced, page, tab, status])

  const { data, error, loading, refresh } = useApi<DebtList>(`/api/debts?${query}`)
  const rows = data?.data ?? []
  const summary = data?.summary

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Hutang & Piutang"
        description="Jual tempo otomatis jadi piutang; beli tempo otomatis jadi hutang supplier. Cicilan tunai masuk cashflow."
        actions={<Button onClick={() => setManualOpen(true)}><Plus className="size-4" />Catat Manual</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <StatCard label="Piutang pelanggan (belum lunas)" value={summary ? formatIDR(summary.receivableOutstanding) : "…"} tone="warning" icon={TrendingUp} loading={!summary} />
        <StatCard label="Hutang supplier (belum lunas)" value={summary ? formatIDR(summary.payableOutstanding) : "…"} tone="danger" icon={TrendingDown} loading={!summary} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4 max-w-2xl">
        <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Jenis hutang">
          {([{ k: "RECEIVABLE", l: "Piutang" }, { k: "PAYABLE", l: "Hutang" }] as const).map((t) => (
            <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => { setTab(t.k); setPage(1) }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.l}
            </button>
          ))}
        </div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / nota / catatan…" className="flex-1" aria-label="Cari hutang piutang" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="UNPAID">Belum bayar</option>
          <option value="PARTIAL">Sebagian</option>
          <option value="PAID">Lunas</option>
        </select>
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !rows.length ? (
          <div className="p-6">
            <EmptyState icon={HandCoins} title={tab === "RECEIVABLE" ? "Tidak ada piutang" : "Tidak ada hutang"}
              description={tab === "RECEIVABLE"
                ? "Transaksi kasir dengan metode TEMPO otomatis muncul di sini."
                : "PO pembelian yang diterima dengan pembayaran TEMPO otomatis muncul di sini."} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tab === "RECEIVABLE" ? "Pelanggan / Nota" : "Supplier / PO"}</TableHead>
                <TableHead className="text-right">Sisa</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Jatuh tempo</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <span className="block">{d.customerName ?? d.supplierName ?? "—"}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {d.invoiceNumber ? `Nota ${d.invoiceNumber}` : d.purchaseCode ? `PO ${d.purchaseCode}` : "manual"} · dari {formatIDR(d.amount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right"><MoneyCell amount={d.remaining} className="font-semibold" /></TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <Badge className={`border-0 ${d.status === "PAID" ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : d.status === "PARTIAL" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                        {d.status === "PAID" ? "Lunas" : d.status === "PARTIAL" ? "Sebagian" : "Belum bayar"}
                      </Badge>
                      {d.isOverdue && <Badge className="border-0 bg-destructive/10 text-destructive">Lewat {d.daysOverdue} hari</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{d.dueDate ? formatDateID(d.dueDate) : "—"}</TableCell>
                  <TableCell className="text-right">
                    {d.status !== "PAID" ? (
                      <Button size="sm" variant="outline" onClick={() => setPayTarget(d)}>Cicil</Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{d.paymentCount} cicilan</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <PayDebtDialog debt={payTarget} onOpenChange={(v) => !v && setPayTarget(null)} onSaved={() => { setPayTarget(null); refresh() }} />
      <ManualDebtDialog open={manualOpen} onOpenChange={setManualOpen} defaultType={tab} onSaved={() => { setManualOpen(false); refresh() }} />
    </div>
  )
}

function PayDebtDialog({ debt, onOpenChange, onSaved }: { debt: DebtRow | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ amount: "", method: "CASH", note: "" })

  const [prevTarget, setPrevTarget] = useState<DebtRow | null>(null)
  if (prevTarget !== debt) {
    setPrevTarget(debt)
    if (debt) { setFormError(null); setValues({ amount: String(debt.remaining), method: "CASH", note: "" }) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!debt) return
    setFormError(null)
    const amount = Number(values.amount.replace(/[^0-9]/g, "")) || 0
    if (amount <= 0 || amount > debt.remaining) {
      setFormError(`Nominal harus di antara Rp 1 — ${formatIDR(debt.remaining)}.`)
      return
    }
    setSaving(true)
    try {
      const res = await api.post<{ remaining: number; status: string }>(`/api/debts/${debt.id}/payments`, { amount, method: values.method, note: values.note.trim() || null })
      toast.success(res.status === "PAID" ? "Lunas! Hutang/piutang selesai." : `Cicilan dicatat. Sisa ${formatIDR(res.remaining)}.`)
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal mencatat cicilan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!debt} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Cicilan</DialogTitle>
          <DialogDescription>
            {debt ? `${debt.type === "RECEIVABLE" ? "Piutang" : "Hutang"} ${debt.customerName ?? debt.supplierName ?? ""} — sisa ${formatIDR(debt.remaining)} dari ${formatIDR(debt.amount)}.` : ""}
            {" "}Cicilan tunai otomatis tercatat di cashflow.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Nominal cicilan (Rp) *</Label>
            <Input id="pay-amount" inputMode="numeric" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value.replace(/[^0-9]/g, "") })} className="tabular" required />
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setValues({ ...values, amount: String(debt?.remaining ?? 0) })} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted">Lunas sekaligus</button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-method">Metode</Label>
            <select id="pay-method" value={values.method} onChange={(e) => setValues({ ...values, method: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="CASH">Tunai (auto cashflow)</option>
              <option value="TRANSFER">Transfer</option>
              <option value="QRIS">QRIS</option>
              <option value="OTHER">Lainnya</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Catatan (opsional)</Label>
            <Textarea id="pay-note" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} maxLength={2000} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Batal</Button>
            <Button type="submit" disabled={saving || !debt}>{saving ? "Menyimpan…" : "Simpan Cicilan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManualDebtDialog({ open, onOpenChange, defaultType, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; defaultType: "RECEIVABLE" | "PAYABLE"; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ type: defaultType, amount: "", dueDate: "", note: "" } as { type: "RECEIVABLE" | "PAYABLE"; amount: string; dueDate: string; note: string })
  const { data: customers } = useApi<{ data: { id: string; name: string }[] }>(open && values.type === "RECEIVABLE" ? "/api/customers?pageSize=100" : null)
  const { data: suppliers } = useApi<{ data: { id: string; name: string }[] }>(open && values.type === "PAYABLE" ? "/api/suppliers" : null)

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) { setPrevOpen(open); if (open) { setFormError(null); setValues({ type: defaultType, amount: "", dueDate: "", note: "" }) } }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(values.amount.replace(/[^0-9]/g, "")) || 0
    if (amount <= 0) { setFormError("Isi nominal."); return }
    const partnerId = values.type === "RECEIVABLE"
      ? (document.getElementById("debt-customer") as HTMLSelectElement | null)?.value
      : (document.getElementById("debt-supplier") as HTMLSelectElement | null)?.value
    if (!partnerId) { setFormError(values.type === "RECEIVABLE" ? "Pilih pelanggan." : "Pilih supplier."); return }
    setSaving(true)
    try {
      await api.post("/api/debts", {
        type: values.type,
        amount,
        customerId: values.type === "RECEIVABLE" ? partnerId : null,
        supplierId: values.type === "PAYABLE" ? partnerId : null,
        dueDate: values.dueDate ? new Date(`${values.dueDate}T12:00:00+07:00`).toISOString() : null,
        note: values.note.trim() || null,
      })
      toast.success("Hutang/piutang manual dicatat.")
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal mencatat.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Hutang / Piutang Manual</DialogTitle>
          <DialogDescription>Untuk hutang luar catatan atau piutang yang tidak lewat kasir.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="grid grid-cols-2 gap-2">
            {[{ k: "RECEIVABLE", l: "Piutang (pelanggan)" }, { k: "PAYABLE", l: "Hutang (supplier)" }].map((t) => (
              <button key={t.k} type="button" onClick={() => setValues({ ...values, type: t.k as "RECEIVABLE" | "PAYABLE" })}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${values.type === t.k ? "border-transparent bg-primary/5 text-primary ring-2 ring-primary" : "text-muted-foreground hover:bg-muted/40"}`}
                aria-pressed={values.type === t.k}>
                {t.l}
              </button>
            ))}
          </div>
          {values.type === "RECEIVABLE" ? (
            <div className="space-y-2">
              <Label htmlFor="debt-customer">Pelanggan *</Label>
              <select id="debt-customer" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">— Pilih pelanggan —</option>
                {(customers?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="debt-supplier">Supplier *</Label>
              <select id="debt-supplier" className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="">— Pilih supplier —</option>
                {(suppliers?.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="debt-amount">Nominal (Rp) *</Label>
              <Input id="debt-amount" inputMode="numeric" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value.replace(/[^0-9]/g, "") })} className="tabular" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="debt-due">Jatuh tempo</Label>
              <Input id="debt-due" type="date" value={values.dueDate} onChange={(e) => setValues({ ...values, dueDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="debt-note">Catatan (opsional)</Label>
            <Textarea id="debt-note" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} maxLength={2000} />
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
