// View Cashflow: ringkasan kas masuk/keluar + tabel entri + form manual.
// Entri otomatis (pelunasan tunai, PO tunai) ditandai dan tidak bisa diedit.
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Coins, Plus } from "lucide-react";
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
import { CASHFLOW_CATEGORY_PRESETS } from "@/lib/constants";

export type CashflowRow = {
  id: string
  direction: "IN" | "OUT"
  category: string
  amount: number
  note: string | null
  entryDate: string
  source: string
  refType: string | null
  refId: string | null
  createdAt: string
}

type CashflowList = { data: CashflowRow[]; page: number; pageSize: number; total: number; totalPages: number; summary: { totalIn: number; totalOut: number; net: number } }

export default function CashflowView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [page, setPage] = useState(1)
  const [direction, setDirection] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [formOpen, setFormOpen] = useState(false)

  useResetOnKeyChange(debounced, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    if (direction) params.set("direction", direction)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    return params.toString()
  }, [debounced, page, direction, dateFrom, dateTo])

  const { data, error, loading, refresh } = useApi<CashflowList>(`/api/cashflow?${query}`)
  const rows = data?.data ?? []
  const summary = data?.summary

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Kas & Cashflow"
        description="Uang masuk/keluar di luar kasir: gaji, sewa, setoran modal, pelunasan, pembelian tunai."
        actions={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" />Catat Kas</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Kas masuk (periode terpilih)" value={summary ? formatIDR(summary.totalIn) : "…"} tone="success" icon={ArrowUpCircle} loading={!summary} />
        <StatCard label="Kas keluar (periode terpilih)" value={summary ? formatIDR(summary.totalOut) : "…"} tone="danger" icon={ArrowDownCircle} loading={!summary} />
        <StatCard label="Net kas" value={summary ? formatIDR(summary.net) : "…"} tone={(summary?.net ?? 0) >= 0 ? "success" : "warning"} icon={Coins} loading={!summary} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4 max-w-3xl">
        <div className="relative flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kategori / catatan…" className="pl-9" aria-label="Cari entri kas" />
        </div>
        <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" aria-label="Arah kas">
          <option value="">Semua arah</option>
          <option value="IN">Masuk</option>
          <option value="OUT">Keluar</option>
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-auto" aria-label="Dari tanggal" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-auto" aria-label="Sampai tanggal" />
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-3xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !rows.length ? (
          <div className="p-6">
            <EmptyState icon={Coins} title="Belum ada entri kas" description="Catat pengeluaran operasional dan pemasukan non-penjualan agar cashflow lengkap." action={<Button onClick={() => setFormOpen(true)}><Plus className="size-4" />Catat Kas</Button>} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategori</TableHead>
                <TableHead className="hidden sm:table-cell">Arah</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead className="hidden md:table-cell">Tanggal</TableHead>
                <TableHead className="hidden lg:table-cell">Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.category}
                    {r.source !== "MANUAL" && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{r.source === "DEBT_PAYMENT" ? "otomatis · cicilan" : "otomatis · PO"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge className={`border-0 ${r.direction === "IN" ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                      {r.direction === "IN" ? "Masuk" : "Keluar"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right"><MoneyCell amount={r.amount} className={r.direction === "OUT" ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"} /></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{formatDateID(r.entryDate)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[220px] truncate" title={r.note ?? ""}>{r.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />}

      <AddCashflowDialog open={formOpen} onOpenChange={setFormOpen} onSaved={() => { setFormOpen(false); refresh() }} />
    </div>
  )
}

function AddCashflowDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [values, setValues] = useState({ direction: "OUT", category: "", amount: "", note: "", entryDate: "" })

  const [prevOpen, setPrevOpen] = useState(false)
  if (prevOpen !== open) { setPrevOpen(open); if (open) { setFormError(null); setValues({ direction: "OUT", category: "", amount: "", note: "", entryDate: "" }) } }

  const presets = values.direction === "IN" ? CASHFLOW_CATEGORY_PRESETS.IN : CASHFLOW_CATEGORY_PRESETS.OUT

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amount = Number(values.amount.replace(/[^0-9]/g, "")) || 0
    if (values.category.trim().length < 2 || amount <= 0) {
      setFormError("Isi kategori dan nominal (> 0).")
      return
    }
    setSaving(true)
    try {
      await api.post("/api/cashflow", {
        direction: values.direction,
        category: values.category.trim(),
        amount,
        note: values.note.trim() || null,
        entryDate: values.entryDate ? new Date(`${values.entryDate}T12:00:00+07:00`).toISOString() : null,
      })
      toast.success("Entri kas dicatat.")
      onSaved()
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Gagal mencatat kas.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Kas Masuk / Keluar</DialogTitle>
          <DialogDescription>Entri otomatis (cicilan tunai, pembelian PO) tidak perlu dicatat ulang di sini.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          {formError && <p className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5" role="alert">{formError}</p>}
          <div className="grid grid-cols-2 gap-2">
            {[{ k: "OUT", l: "Kas keluar" }, { k: "IN", l: "Kas masuk" }].map((d) => (
              <button key={d.k} type="button" onClick={() => setValues({ ...values, direction: d.k, category: "" })}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-all ${values.direction === d.k ? "border-transparent bg-primary/5 text-primary ring-2 ring-primary" : "text-muted-foreground hover:bg-muted/40"}`}
                aria-pressed={values.direction === d.k}>
                {d.l}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-category">Kategori *</Label>
            <Input id="cf-category" value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })} placeholder="mis. GAJI" maxLength={50} required />
            <div className="flex flex-wrap gap-1.5">
              {presets.map((c) => (
                <button key={c} type="button" onClick={() => setValues({ ...values, category: c })}
                  className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  {c.replaceAll("_", " ").toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cf-amount">Nominal (Rp) *</Label>
              <Input id="cf-amount" inputMode="numeric" value={values.amount} onChange={(e) => setValues({ ...values, amount: e.target.value.replace(/[^0-9]/g, "") })} className="tabular" placeholder="500000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-date">Tanggal</Label>
              <Input id="cf-date" type="date" value={values.entryDate} onChange={(e) => setValues({ ...values, entryDate: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-note">Catatan (opsional)</Label>
            <Textarea id="cf-note" value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} maxLength={2000} />
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
