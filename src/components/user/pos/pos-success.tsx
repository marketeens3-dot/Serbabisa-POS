// Layar sukses setelah checkout: detail pembayaran + Cetak Nota + Kirim WhatsApp + Transaksi Baru.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, MessageCircle, Printer, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceRenderer, type InvoiceStore } from "@/components/invoice/invoice-renderer";
import { InvoiceJpgCapture, useInvoiceJpg } from "@/components/invoice/download-invoice";
import { PrintableInvoice, usePrintInvoice } from "@/components/invoice/print-invoice";
import { DEFAULT_INVOICE_CONFIG, type InvoiceTemplateConfig } from "@/lib/invoice";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR, formatPercentID } from "@/lib/format";
import type { SessionUserDTO, TransactionDTO, WaLinkResult } from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
  OTHER: "Lainnya",
};

export function PosSuccess({
  transaction,
  config,
  store,
  onNewTransaction,
}: {
  transaction: TransactionDTO
  config: InvoiceTemplateConfig | null
  store: NonNullable<SessionUserDTO["tenant"]>
  onNewTransaction: () => void
}) {
  const effectiveConfig = config ?? DEFAULT_INVOICE_CONFIG
  const printInvoice = usePrintInvoice(effectiveConfig.paperSize)
  const [sendingWa, setSendingWa] = useState(false)
  // Diskon per item (Σ diskon baris) — ditampilkan terpisah dari diskon transaksi.
  const itemDiscountTotal = (transaction.items ?? []).reduce((s, i) => s + (i.discountAmount ?? 0), 0)
  const invoiceStore: InvoiceStore = {
    businessName: store.businessName,
    address: store.address,
    phone: store.phone,
    whatsappNumber: store.whatsappNumber,
    logoUrl: store.logoUrl,
  }

  const jpg = useInvoiceJpg({ transaction, config: effectiveConfig, store: invoiceStore })

  async function handleWhatsApp() {
    setSendingWa(true)
    try {
      const res = await api.post<WaLinkResult>("/api/whatsapp", { transactionId: transaction.id })
      // wa.me deep-link: membuka WhatsApp dengan pesan sudah disiapkan (BUKAN kirim otomatis).
      window.open(res.url, "_blank", "noopener,noreferrer")
      toast.info("WhatsApp dibuka — pesan nota sudah disiapkan, silakan kirim dari WhatsApp.")
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Gagal menyiapkan pesan WhatsApp."
      toast.error(message)
    } finally {
      setSendingWa(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Kiri: konfirmasi sukses */}
        <div className="rounded-2xl border bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div
              className="size-16 rounded-full bg-emerald-600/10 ring-1 ring-emerald-600/20 flex items-center justify-center mb-4"
              aria-hidden="true"
            >
              <CheckCircle2 className="size-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Pembayaran Berhasil</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Transaksi tersimpan &amp; stok telah diperbarui.
            </p>
            <p className="mt-3 font-mono font-semibold text-sm bg-muted border rounded-full px-4 py-1.5 tabular tracking-wide">
              {transaction.invoiceNumber}
            </p>
          </div>

          <dl className="mt-7 space-y-2.5 text-sm">
            <SummaryRow label="Metode pembayaran" value={METHOD_LABELS[transaction.paymentMethod] ?? transaction.paymentMethod} />
            <SummaryRow label="Total tagihan" value={formatIDR(transaction.totalAmount)} />
            {itemDiscountTotal > 0 && <SummaryRow label="Diskon item" value={`- ${formatIDR(itemDiscountTotal)}`} />}
            <SummaryRow label="Dibayar" value={formatIDR(transaction.paidAmount)} />
            {transaction.discountAmount > 0 && (
              <SummaryRow
                label={`Diskon${itemDiscountTotal > 0 ? " toko" : ""}${
                  transaction.discountPercent > 0 ? ` (${formatPercentID(transaction.discountPercent)})` : ""
                }`}
                value={`- ${formatIDR(transaction.discountAmount)}`}
              />
            )}
            <SummaryRow label="Kembalian" value={formatIDR(transaction.changeAmount)} strong />
            {transaction.customerName && <SummaryRow label="Pelanggan" value={transaction.customerName} />}
          </dl>

          <div className="mt-7 grid gap-2.5">
            <Button size="lg" className="h-12 text-base font-bold active:scale-[0.98]" onClick={printInvoice}>
              <Printer className="size-5" />
              Cetak Nota
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 active:scale-[0.98]"
              onClick={() => void jpg.downloadJpg()}
              disabled={jpg.downloading}
            >
              <Download className="size-4.5" />
              {jpg.downloading ? "Menyiapkan…" : "Unduh Nota (JPG)"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 active:scale-[0.98]"
              onClick={handleWhatsApp}
              disabled={sendingWa}
            >
              <MessageCircle className="size-4.5" />
              {sendingWa ? "Menyiapkan…" : "Kirim via WhatsApp"}
            </Button>
            <Button size="lg" variant="ghost" className="h-11 active:scale-[0.98]" onClick={onNewTransaction}>
              <RotateCcw className="size-4" />
              Transaksi Baru
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Catatan: WhatsApp dibuka dengan pesan yang sudah disiapkan — pengiriman tetap dilakukan dari aplikasi WhatsApp Anda.
          </p>
        </div>

        {/* Kanan: preview nota */}
        <div className="rounded-2xl border bg-muted/40 p-4 sm:p-6 overflow-auto max-h-[70vh]">
          <p className="text-xs font-medium text-muted-foreground mb-3 text-center uppercase tracking-wide">
            Pratinjau nota ({effectiveConfig.paperSize})
          </p>
          <div className="scale-95 origin-top">
            <InvoiceRenderer transaction={transaction} config={effectiveConfig} store={invoiceStore} />
          </div>
        </div>
      </div>

      <PrintableInvoice transaction={transaction} config={effectiveConfig} store={invoiceStore} />
      <InvoiceJpgCapture
        captureRef={jpg.captureRef}
        transaction={transaction}
        config={effectiveConfig}
        store={invoiceStore}
      />
    </div>
  )
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`tabular font-semibold ${
          strong ? "text-emerald-600 dark:text-emerald-400 text-base" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
