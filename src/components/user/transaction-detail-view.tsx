// Detail transaksi: items snapshot, totals, void (dengan alasan wajib), cetak nota, kirim WhatsApp.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Ban, Download, MessageCircle, Printer, RotateCcw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ErrorState,
  MoneyCell,
  PageHeader,
  PaymentMethodBadge,
  TransactionStatusBadge,
} from "@/components/app/shared";
import { InvoiceRenderer, type InvoiceStore } from "@/components/invoice/invoice-renderer";
import { InvoiceJpgCapture, useInvoiceJpg } from "@/components/invoice/download-invoice";
import { RefundDialog } from "@/components/user/refund-dialog";
import { PrintableInvoice, usePrintInvoice } from "@/components/invoice/print-invoice";
import { DEFAULT_INVOICE_CONFIG, type InvoiceTemplateConfig } from "@/lib/invoice";
import { useApp } from "@/components/app/app-context";
import { useApi } from "@/hooks/use-api";
import { api, ApiClientError } from "@/lib/api-client";
import { formatDateTimeLongID, formatIDR, formatPercentID, formatQty } from "@/lib/format";
import type { InvoiceTemplateDTO, TransactionDTO, WaLinkResult } from "@/lib/types";

export default function TransactionDetailView({ transactionId }: { transactionId: string }) {
  const { user } = useApp()
  const { data: tx, error, loading, refresh } = useApi<TransactionDTO>(`/api/transactions/${transactionId}`)
  const { data: templates } = useApi<{ data: InvoiceTemplateDTO[] }>("/api/invoice-templates")

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState("")
  const [refundOpen, setRefundOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [voidError, setVoidError] = useState<string | null>(null)

  // Masih ada item yang bisa direfund (qty > refundedQty).
  const hasRefundable = !!tx && (tx.items ?? []).some((it) => it.quantity - it.refundedQty > 0.0005)

  const config: InvoiceTemplateConfig = (() => {
    const def = templates?.data.find((t) => t.isDefault) ?? templates?.data[0]
    return def?.config ?? DEFAULT_INVOICE_CONFIG
  })()
  const printInvoice = usePrintInvoice(config.paperSize)
  // Dipanggil sebelum early-return (aturan hooks) — tx boleh null saat memuat.
  const jpg = useInvoiceJpg({ transaction: tx, config, store: {
    businessName: user.tenant?.businessName ?? "",
    address: user.tenant?.address ?? null,
    phone: user.tenant?.phone ?? null,
    whatsappNumber: user.tenant?.whatsappNumber ?? null,
    logoUrl: user.tenant?.logoUrl ?? null,
  } })

  useEffect(() => {
    if (voidOpen) {
      setVoidReason("")
      setVoidError(null)
    }
  }, [voidOpen])

  async function handleVoid() {
    setVoidError(null)
    if (voidReason.trim().length < 3) {
      setVoidError("Alasan pembatalan wajib diisi (minimal 3 karakter).")
      return
    }
    setBusy(true)
    try {
      await api.post(`/api/transactions/${transactionId}/void`, { reason: voidReason.trim() })
      toast.success("Transaksi dibatalkan dan stok produk dikembalikan.")
      setVoidOpen(false)
      refresh()
    } catch (err) {
      setVoidError(err instanceof ApiClientError ? err.message : "Gagal membatalkan transaksi.")
    } finally {
      setBusy(false)
    }
  }

  async function handleWhatsApp() {
    try {
      const res = await api.post<WaLinkResult>("/api/whatsapp", { transactionId })
      window.open(res.url, "_blank", "noopener,noreferrer")
      toast.info("WhatsApp dibuka — pesan nota sudah disiapkan, silakan kirim dari WhatsApp.")
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Gagal menyiapkan pesan WhatsApp.")
    }
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <a href="#/app/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-4" /> Kembali ke riwayat
        </a>
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }

  const store: InvoiceStore = {
    businessName: user.tenant?.businessName ?? "",
    address: user.tenant?.address ?? null,
    phone: user.tenant?.phone ?? null,
    whatsappNumber: user.tenant?.whatsappNumber ?? null,
    logoUrl: user.tenant?.logoUrl ?? null,
  }

  return (
    <div className="max-w-6xl mx-auto">
      <a href="#/app/transactions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Kembali ke riwayat
      </a>

      {loading || !tx ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <PageHeader
            title={tx.invoiceNumber}
            description={`${formatDateTimeLongID(tx.createdAt)} · Kasir: ${tx.cashierName ?? "—"}`}
            actions={
              <>
                {tx.status === "COMPLETED" && (
                  <>
                    <Button variant="outline" onClick={printInvoice}>
                      <Printer className="size-4" />
                      Cetak Nota
                    </Button>
                    <Button variant="outline" onClick={() => void jpg.downloadJpg()} disabled={jpg.downloading}>
                      <Download className="size-4" />
                      {jpg.downloading ? "Menyiapkan…" : "Unduh JPG"}
                    </Button>
                    <Button variant="outline" onClick={handleWhatsApp}>
                      <MessageCircle className="size-4" />
                      Kirim via WhatsApp
                    </Button>
                    {tx.status === "COMPLETED" && hasRefundable && (
                      <Button
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRefundOpen(true)}
                      >
                        <RotateCcw className="size-4" />
                        Refund
                      </Button>
                    )}
                    <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                      <Ban className="size-4" />
                      Batalkan
                    </Button>
                  </>
                )}
              </>
            }
          />

          <div className="grid lg:grid-cols-5 gap-5 items-start">
            <div className="lg:col-span-3 space-y-4">
              {/* Info utama */}
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <TransactionStatusBadge status={tx.status} />
                    <PaymentMethodBadge method={tx.paymentMethod} />
                    {tx.customerName ? (
                      <Badge variant="outline">Pelanggan: {tx.customerName}</Badge>
                    ) : (
                      <Badge variant="outline">Pelanggan umum</Badge>
                    )}
                  </div>
                  <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <Row label="Nomor invoice" value={<span className="tabular font-semibold">{tx.invoiceNumber}</span>} />
                    <Row label="Tanggal" value={formatDateTimeLongID(tx.createdAt)} />
                    <Row label="Kasir" value={tx.cashierName ?? "—"} />
                    <Row label="Pelanggan" value={tx.customerName ?? "Umum"} />
                  </dl>
                  {tx.notes && (
                    <p className="mt-4 text-sm text-muted-foreground border-t pt-3">
                      <span className="font-medium text-foreground">Catatan: </span>
                      {tx.notes}
                    </p>
                  )}
                  {tx.status === "VOID" && (
                    <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
                      <p className="font-semibold text-destructive flex items-center gap-2">
                        <Ban className="size-4 shrink-0" aria-hidden="true" />
                        Transaksi dibatalkan
                      </p>
                      <p className="text-muted-foreground mt-1.5">
                        {formatDateTimeLongID(tx.voidedAt!)} — Alasan: {tx.voidReason ?? "-"}
                      </p>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        Stok produk telah dikembalikan. Transaksi VOID tidak dihitung dalam penjualan.
                      </p>
                    </div>
                  )}
                  {tx.refundedAmount > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
                      <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-2">
                        <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                        Refund transaksi
                      </p>
                      <p className="text-muted-foreground mt-1.5">
                        Total direfund: <span className="font-semibold text-foreground tabular">{formatIDR(tx.refundedAmount)}</span> dari {formatIDR(tx.totalAmount)}
                      </p>
                      <p className="text-muted-foreground mt-1.5">
                        {tx.refundedAt ? formatDateTimeLongID(tx.refundedAt) : "—"} — Alasan: {tx.refundReason ?? "-"}
                      </p>
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {tx.status === "REFUNDED"
                          ? "Seluruh item telah direfund. Stok produk terkait telah dikembalikan."
                          : "Refund parsial — sebagian item telah direfund dan stoknya dikembalikan."}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Item */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Item ({tx.items?.length ?? 0})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Harga</TableHead>
                        <TableHead className="text-right pr-5">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tx.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="pl-5 max-w-[240px]">
                            <p className="font-medium truncate">{item.itemNameSnapshot}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.itemType === "PRODUCT" ? "Produk" : "Jasa"}
                              {item.skuSnapshot ? ` · ${item.skuSnapshot}` : ""}
                            </p>
                            {(item.discountAmount ?? 0) > 0 && (
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                Diskon{(item.discountPercent ?? 0) > 0 ? ` ${formatPercentID(item.discountPercent ?? 0)}` : ""} −{" "}
                                {formatIDR(item.discountAmount ?? 0)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular">
                            {formatQty(item.quantity)}
                            {item.refundedQty > 0.0005 && (
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                                {formatQty(item.refundedQty)}/{formatQty(item.quantity)} direfund
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right"><MoneyCell amount={item.unitPrice} className="text-muted-foreground" /></TableCell>
                          <TableCell className="text-right pr-5"><MoneyCell amount={item.subtotal} className="font-semibold" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Totals + preview — kartu gaya struk */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 pb-4 border-b border-dashed">
                    {user.tenant?.logoUrl ? (
                      <img
                        src={user.tenant.logoUrl}
                        alt={`Logo ${user.tenant.businessName}`}
                        className="size-10 rounded-lg border bg-muted/40 object-contain shrink-0"
                      />
                    ) : (
                      <span
                        className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <Store className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{user.tenant?.businessName ?? "Toko"}</p>
                      <p className="text-xs text-muted-foreground tabular truncate">{tx.invoiceNumber}</p>
                    </div>
                  </div>
                  <div className="py-3.5 space-y-2.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <MoneyCell
                        amount={tx.subtotal + (tx.items ?? []).reduce((s, i) => s + (i.discountAmount ?? 0), 0)}
                        className="font-medium text-foreground"
                      />
                    </div>
                    {(tx.items ?? []).some((i) => (i.discountAmount ?? 0) > 0) && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Diskon item</span>
                        <MoneyCell
                          amount={-(tx.items ?? []).reduce((s, i) => s + (i.discountAmount ?? 0), 0)}
                          className="font-medium text-amber-700 dark:text-amber-400"
                        />
                      </div>
                    )}
                    {tx.discountAmount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>
                          Diskon{(tx.items ?? []).some((i) => (i.discountAmount ?? 0) > 0) ? " toko" : ""}
                          {tx.discountPercent > 0 ? ` (${formatPercentID(tx.discountPercent)})` : ""}
                        </span>
                        <MoneyCell amount={-tx.discountAmount} className="font-medium text-foreground" />
                      </div>
                    )}
                    {tx.taxAmount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Pajak</span>
                        <MoneyCell amount={tx.taxAmount} className="font-medium text-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="border-t-2 border-dashed pt-3.5 space-y-2.5">
                    <div className="flex justify-between items-baseline">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-primary text-lg tabular">{formatIDR(tx.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Dibayar</span>
                      <MoneyCell amount={tx.paidAmount} className="font-medium text-foreground" />
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Kembalian</span>
                      <MoneyCell amount={tx.changeAmount} className="font-medium text-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3 text-center uppercase tracking-wide">
                    Pratinjau nota ({config.paperSize})
                  </p>
                  <div className="overflow-auto max-h-[420px] rounded-lg border bg-muted/30 p-3">
                    <InvoiceRenderer transaction={tx} config={config} store={store} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <PrintableInvoice transaction={tx} config={config} store={store} />
          <InvoiceJpgCapture
            captureRef={jpg.captureRef}
            transaction={tx}
            config={config}
            store={store}
          />
        </>
      )}

      {/* Refund dialog — parsial/total dengan estimasi pro-rata */}
      {tx && (
        <RefundDialog
          open={refundOpen}
          onOpenChange={setRefundOpen}
          transaction={tx}
          onDone={() => {
            setRefundOpen(false)
            void refresh()
          }}
        />
      )}

      {/* Void dialog — alasan wajib */}
      <AlertDialog open={voidOpen} onOpenChange={(v) => !busy && setVoidOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan transaksi {tx?.invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              Transaksi berstatus Dibatalkan (VOID) — tidak dihapus, stok produk dikembalikan, dan tidak dihitung
              dalam penjualan. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Alasan pembatalan *</Label>
            <Textarea
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="cth: salah input jumlah, pelanggan membatalkan…"
              rows={3}
              maxLength={500}
            />
            {voidError && <p className="text-sm text-destructive" role="alert">{voidError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Kembali</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleVoid()
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Memproses…" : "Ya, batalkan transaksi"}
            </AlertDialogAction>
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
