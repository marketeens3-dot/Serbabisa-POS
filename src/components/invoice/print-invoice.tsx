// Mekanisme print nota: konten selalu ter-mount off-screen (class .invoice-print),
// window.print() + injeksi @page sesuai ukuran kertas, lalu bersihkan.
"use client";

import { useCallback } from "react";
import { InvoiceRenderer, type InvoiceStore } from "@/components/invoice/invoice-renderer";
import type { InvoiceTemplateConfig } from "@/lib/invoice";
import type { TransactionDTO } from "@/lib/types";

function paperPageRule(paper: InvoiceTemplateConfig["paperSize"]) {
  return paper === "A4"
    ? "@page { size: A4; margin: 12mm; }"
    : `@page { size: ${paper === "58mm" ? "58mm" : "80mm"} auto; margin: 3mm; }`
}

/** Elemen tersembunyi yang hanya tampil saat print (CSS globals.css: body * hidden). */
export function PrintableInvoice({
  transaction,
  config,
  store,
}: {
  transaction: TransactionDTO | null
  config: InvoiceTemplateConfig
  store: InvoiceStore
}) {
  if (!transaction) return null
  return (
    <div
      className="invoice-print"
      style={{ position: "fixed", top: 0, left: "-10000px", zIndex: -1 }}
      aria-hidden="true"
    >
      <InvoiceRenderer transaction={transaction} config={config} store={store} />
    </div>
  )
}

export function usePrintInvoice(config: InvoiceTemplateConfig["paperSize"]) {
  return useCallback(() => {
    const id = "sb-print-page-rule"
    const existing = document.getElementById(id)
    if (existing) existing.remove()
    const style = document.createElement("style")
    style.id = id
    style.textContent = paperPageRule(config)
    document.head.appendChild(style)
    const cleanup = () => {
      style.remove()
      window.removeEventListener("afterprint", cleanup)
    }
    window.addEventListener("afterprint", cleanup)
    window.print()
    // Fallback pembersihan bila afterprint tidak terpicu.
    setTimeout(cleanup, 60_000)
  }, [config])
}
