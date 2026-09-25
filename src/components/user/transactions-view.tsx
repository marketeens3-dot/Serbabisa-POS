// Riwayat transaksi: filter tanggal/status/metode/pelanggan/invoice + pagination + ringkasan.
"use client";

import { useMemo, useState } from "react";
import { ReceiptText, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  MoneyCell,
  PageHeader,
  PaginationControls,
  PaymentMethodBadge,
  TransactionStatusBadge,
} from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import type { Paginated, TransactionDTO } from "@/lib/types";

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

export default function TransactionsView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [status, setStatus] = useState("ALL")
  const [paymentMethod, setStatus2] = useState("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(1)

  useResetOnKeyChange(`${debounced}|${status}|${paymentMethod}|${dateFrom}|${dateTo}`, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" })
    if (debounced) params.set("search", debounced)
    if (status !== "ALL") params.set("status", status)
    if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod)
    if (dateFrom) params.set("dateFrom", dateFrom)
    if (dateTo) params.set("dateTo", dateTo)
    return params.toString()
  }, [debounced, status, paymentMethod, dateFrom, dateTo, page])

  const { data, error, loading, refresh } = useApi<Paginated<TransactionDTO> & { summary: { completedCount: number; completedTotal: number } }>(
    `/api/transactions?${query}`
  )
  const rows = data?.data ?? []

  // Ekspor mengikuti filter TANGGAH saja (konsisten dengan data server-side
  // yang diexport penuh, bukan per-halaman tabel).
  const exportParams = { type: "transactions", dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Transaksi"
        description="Riwayat penjualan toko Anda."
        actions={
          <ExportMenu params={exportParams} label="Ekspor" />
        }
      />

      {/* Ringkasan selesai — aksen emerald */}
      {data?.summary && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-600/25 bg-emerald-600/5 px-4 py-3">
          <span
            className="size-9 rounded-lg bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <ReceiptText className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold tabular text-emerald-700 dark:text-emerald-400">
              {formatIDR(data.summary.completedTotal)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.summary.completedCount} transaksi selesai pada filter saat ini
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <Card className="mb-4">
        <CardContent className="p-3.5 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari invoice / pelanggan…"
              className="pl-9"
              aria-label="Cari transaksi"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter status" className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              <SelectItem value="COMPLETED">Selesai</SelectItem>
              <SelectItem value="VOID">Dibatalkan</SelectItem>
              <SelectItem value="REFUNDED">Direfund</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentMethod} onValueChange={setStatus2}>
            <SelectTrigger aria-label="Filter metode pembayaran" className="w-full">
              <SelectValue placeholder="Metode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua metode</SelectItem>
              <SelectItem value="CASH">Tunai</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="QRIS">QRIS</SelectItem>
              <SelectItem value="OTHER">Lainnya</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Tanggal dari" className="tabular" max={jakartaToday()} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Tanggal sampai" className="tabular" max={jakartaToday()} />
        </CardContent>
      </Card>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={8} /></div>
        ) : !rows.length ? (
          <div className="p-6">
            <EmptyState
              icon={ReceiptText}
              title="Belum ada transaksi"
              description="Transaksi akan muncul di sini setelah Anda menyelesaikan penjualan di kasir."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead className="hidden md:table-cell">Tanggal</TableHead>
                <TableHead className="hidden sm:table-cell">Pelanggan</TableHead>
                <TableHead className="hidden lg:table-cell">Kasir</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <a href={`#/app/transactions/${tx.id}`} className="font-medium tabular hover:text-primary hover:underline">
                      {tx.invoiceNumber}
                    </a>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {formatDateTimeID(tx.createdAt)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">{tx.customerName ?? "Umum"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">{tx.cashierName ?? "—"}</TableCell>
                  <TableCell><PaymentMethodBadge method={tx.paymentMethod} /></TableCell>
                  <TableCell><TransactionStatusBadge status={tx.status} /></TableCell>
                  <TableCell className="text-right">
                    <MoneyCell amount={tx.totalAmount} className={tx.status === "VOID" ? "line-through text-muted-foreground" : "font-semibold"} />
                    {tx.refundedAmount > 0 && (
                      <p className="text-xs tabular text-amber-700 dark:text-amber-400">
                        −{formatIDR(tx.refundedAmount)} direfund
                      </p>
                    )}
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
    </div>
  )
}
