// InvoiceRenderer — komponen nota reusable (preview = hasil print).
// Render berdasarkan InvoiceTemplateConfig (typed object) — BUKAN raw HTML user → bukan jalur XSS.
"use client";

import type { InvoiceTemplateConfig } from "@/lib/invoice";
import type { TransactionDTO } from "@/lib/types";
import { formatDateID, formatTimeID, formatIDR, formatQty } from "@/lib/format";
import { formatPhoneDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

export type InvoiceStore = {
  businessName: string
  address: string | null
  phone: string | null
  whatsappNumber: string | null
  logoUrl: string | null
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
  OTHER: "Lainnya",
}

export function InvoiceRenderer({
  transaction,
  config,
  store,
  scale = 1,
}: {
  transaction: TransactionDTO
  config: InvoiceTemplateConfig
  store: InvoiceStore
  scale?: number
}) {
  const isThermal = config.paperSize === "58mm" || config.paperSize === "80mm"
  const items = transaction.items ?? []
  const style: React.CSSProperties = {
    fontSize: `${config.fontSize * scale}px`,
    lineHeight: config.lineSpacing,
  }
  const accent = config.accentColor

  if (isThermal) {
    return (
      <div
        className={cn("invoice-render bg-white text-zinc-900 mx-auto", `invoice-paper-${config.paperSize}`)}
        style={style}
      >
        {/* Header */}
        <div className="text-center pt-1 pb-2">
          {config.showLogo && store.logoUrl && (
             
            <img src={store.logoUrl} alt={`Logo ${store.businessName}`} className="mx-auto h-12 w-auto object-contain mb-1.5" />
          )}
          <p className="font-bold uppercase tracking-wide leading-tight" style={{ fontSize: `${config.fontSize * 1.15 * scale}px` }}>
            {store.businessName}
          </p>
          {config.headerText && <p className="leading-tight">{config.headerText}</p>}
          {config.showAddress && store.address && <p className="leading-tight opacity-80">{store.address}</p>}
          {config.showPhone && store.phone && <p className="leading-tight opacity-80">{formatPhoneDisplay(store.phone)}</p>}
        </div>
        <div className="border-t border-dashed border-zinc-400" />
        <div className="py-1.5 flex items-center justify-between font-semibold">
          <span>{config.invoiceTitle}</span>
          <span className="tabular">{transaction.invoiceNumber}</span>
        </div>
        <div className="flex justify-between opacity-80">
          <span>Tanggal</span>
          <span className="tabular">
            {formatDateID(transaction.createdAt)} {formatTimeID(transaction.createdAt)}
          </span>
        </div>
        <div className="flex justify-between opacity-80">
          <span>Kasir</span>
          <span>{transaction.cashierName ?? "-"}</span>
        </div>
        {config.showCustomer && (
          <div className="flex justify-between opacity-80">
            <span>Pelanggan</span>
            <span className="text-right max-w-[55%] truncate">{transaction.customerName ?? "Umum"}</span>
          </div>
        )}
        {config.showCustomerPhone && transaction.customerPhone && (
          <div className="flex justify-between opacity-80">
            <span>Telp</span>
            <span className="tabular">{formatPhoneDisplay(transaction.customerPhone)}</span>
          </div>
        )}
        <div className="border-t border-dashed border-zinc-400 my-1.5" />

        {/* Items */}
        <table className="w-full">
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td colSpan={2} className="pb-1.5">
                  <p className="leading-tight font-medium break-words">
                    {config.showSku && item.skuSnapshot && <span className="opacity-60">{item.skuSnapshot} · </span>}
                    {item.itemNameSnapshot}
                  </p>
                  <div className="flex justify-between tabular opacity-90 leading-tight">
                    <span>
                      {formatQty(item.quantity)} × {formatIDR(item.unitPrice)}
                    </span>
                    <span className="font-medium">{formatIDR(item.subtotal)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-dashed border-zinc-400 my-1.5" />

        {/* Totals */}
        <div className="space-y-0.5 tabular">
          <Row label="Subtotal" value={formatIDR(transaction.subtotal)} />
          {transaction.discountAmount > 0 && <Row label="Diskon" value={`- ${formatIDR(transaction.discountAmount)}`} />}
          {config.showTax && transaction.taxAmount > 0 && <Row label="Pajak" value={formatIDR(transaction.taxAmount)} />}
          <div className="border-t pt-1 mt-1" style={{ borderColor: accent }} />
          <Row label="TOTAL" value={formatIDR(transaction.totalAmount)} bold />
          <Row label={`Bayar${config.showPaymentMethod ? ` (${PAYMENT_LABELS[transaction.paymentMethod] ?? transaction.paymentMethod})` : ""}`} value={formatIDR(transaction.paidAmount)} />
          <Row label="Kembalian" value={formatIDR(transaction.changeAmount)} />
        </div>

        {transaction.status === "VOID" && (
          <p className="text-center font-bold text-red-600 mt-2 uppercase">*** Dibatalkan ***</p>
        )}
        {transaction.notes && <p className="opacity-70 leading-tight mt-1.5">Catatan: {transaction.notes}</p>}
        <div className="border-t border-dashed border-zinc-400 my-1.5" />
        <div className="text-center pb-1">
          {config.footerText && <p className="leading-tight">{config.footerText}</p>}
          <p className="opacity-50 leading-tight mt-1" style={{ fontSize: `${Math.max(7, config.fontSize - 2) * scale}px` }}>
            Dicetak dari Serbabisa POS
          </p>
        </div>
      </div>
    )
  }

  // ---------- A4 ----------
  return (
    <div className="invoice-render bg-white text-zinc-900 mx-auto invoice-paper-A4 p-0" style={style}>
      <div className="flex items-start justify-between gap-6 pb-4" style={{ borderBottom: `2px solid ${accent}` }}>
        <div className="flex items-start gap-4">
          {config.showLogo && store.logoUrl && (
             
            <img src={store.logoUrl} alt={`Logo ${store.businessName}`} className="h-16 w-auto object-contain" />
          )}
          <div>
            <p className="font-bold uppercase tracking-wide" style={{ fontSize: `${config.fontSize * 1.5 * scale}px`, color: accent }}>
              {store.businessName}
            </p>
            {config.headerText && <p className="opacity-80">{config.headerText}</p>}
            {config.showAddress && store.address && <p className="opacity-80">{store.address}</p>}
            {config.showPhone && store.phone && (
              <p className="opacity-80 tabular">Telp/WA: {formatPhoneDisplay(store.phone)}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold uppercase" style={{ color: accent }}>{config.invoiceTitle}</p>
          <p className="font-semibold tabular">{transaction.invoiceNumber}</p>
          <p className="tabular opacity-80">
            {formatDateID(transaction.createdAt)} {formatTimeID(transaction.createdAt)}
          </p>
          <p className="opacity-80">Kasir: {transaction.cashierName ?? "-"}</p>
        </div>
      </div>

      {config.showCustomer && (
        <div className="mt-4 flex justify-between">
          <div>
            <p className="font-semibold" style={{ color: accent }}>Pelanggan</p>
            <p>{transaction.customerName ?? "Umum"}</p>
            {config.showCustomerPhone && transaction.customerPhone && (
              <p className="opacity-80 tabular">{formatPhoneDisplay(transaction.customerPhone)}</p>
            )}
          </div>
        </div>
      )}

      <table className="w-full mt-4" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: `${accent}14`, color: accent }}>
            <th className="text-left py-2 px-2 font-semibold">Item</th>
            <th className="text-right py-2 px-2 font-semibold">Qty</th>
            <th className="text-right py-2 px-2 font-semibold">Harga</th>
            <th className="text-right py-2 px-2 font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="align-top" style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td className="py-2 px-2">
                <p className="font-medium">{item.itemNameSnapshot}</p>
                {config.showSku && item.skuSnapshot && <p className="opacity-60 text-xs">{item.skuSnapshot}</p>}
              </td>
              <td className="py-2 px-2 text-right tabular">{formatQty(item.quantity)}</td>
              <td className="py-2 px-2 text-right tabular">{formatIDR(item.unitPrice)}</td>
              <td className="py-2 px-2 text-right tabular font-medium">{formatIDR(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end mt-4">
        <div className="w-64 space-y-1 tabular">
          <Row label="Subtotal" value={formatIDR(transaction.subtotal)} />
          {transaction.discountAmount > 0 && <Row label="Diskon" value={`- ${formatIDR(transaction.discountAmount)}`} />}
          {config.showTax && transaction.taxAmount > 0 && <Row label="Pajak" value={formatIDR(transaction.taxAmount)} />}
          <div className="pt-1.5 mt-1.5" style={{ borderTop: `2px solid ${accent}` }} />
          <Row label="TOTAL" value={formatIDR(transaction.totalAmount)} bold />
          {config.showPaymentMethod && (
            <Row label={`Bayar (${PAYMENT_LABELS[transaction.paymentMethod] ?? transaction.paymentMethod})`} value={formatIDR(transaction.paidAmount)} />
          )}
          <Row label="Kembalian" value={formatIDR(transaction.changeAmount)} />
        </div>
      </div>

      {transaction.status === "VOID" && (
        <p className="text-center font-bold text-red-600 mt-6 uppercase border-2 border-red-600 py-2">
          Transaksi dibatalkan{transaction.voidReason ? ` — ${transaction.voidReason}` : ""}
        </p>
      )}
      {transaction.notes && <p className="opacity-70 mt-3">Catatan: {transaction.notes}</p>}
      <p className="text-center opacity-70 mt-8" style={{ borderTop: "1px solid #e5e7eb", paddingTop: "8px" }}>
        {config.footerText}
      </p>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-bold" : "opacity-80"}>{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  )
}
