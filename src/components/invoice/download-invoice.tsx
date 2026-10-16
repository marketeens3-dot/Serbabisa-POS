// Mekanisme unduh nota sebagai gambar JPG: salinan nota off-screen skala penuh
// di-capture via html-to-image (foreignObject — dirender browser sendiri sehingga
// mendukung Tailwind 4/oklch), lalu diunduh sebagai file .jpg siap dibagikan
// (mis. via WhatsApp). Pola mount off-screen sama dengan PrintableInvoice.
"use client";

import { useCallback, useRef, useState } from "react";
import { toJpeg } from "html-to-image";
import { InvoiceRenderer, type InvoiceStore } from "@/components/invoice/invoice-renderer";
import type { InvoiceTemplateConfig } from "@/lib/invoice";
import type { TransactionDTO } from "@/lib/types";

// Padding putih di sekeliling nota supaya teks tidak menempel tepi gambar.
const CAPTURE_PADDING = 16;
// 2x resolusi — teks struk tetap tajam saat di-zoom / dikirim via WhatsApp.
const PIXEL_RATIO = 2;
const JPEG_QUALITY = 0.92;

function sanitizeFilenamePart(input: string) {
  return (
    input
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "nota"
  )
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(",")
  const mime = meta.match(/:(.*?);/)?.[1] ?? "image/jpeg"
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Beri waktu browser memulai unduhan sebelum object URL dicabut.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function useInvoiceJpg({
  transaction,
  config,
  store,
}: {
  // Boleh null (mis. halaman detail masih memuat data) — downloadJpg jadi no-op.
  transaction: TransactionDTO | null
  config: InvoiceTemplateConfig
  store: InvoiceStore
}) {
  const captureRef = useRef<HTMLDivElement | null>(null)
  const [downloading, setDownloading] = useState(false)

  const downloadJpg = useCallback(async () => {
    const node = captureRef.current
    if (!node || !transaction || downloading) return
    setDownloading(true)
    try {
      const options = {
        quality: JPEG_QUALITY,
        backgroundColor: "#ffffff",
        pixelRatio: PIXEL_RATIO,
      } as const
      // Panggilan pertama meng-embed font & gambar (logo) ke cache internal;
      // hasil panggilan pertama kadang tanpa font → panggilan kedua final.
      await toJpeg(node, options)
      const dataUrl = await toJpeg(node, options)
      const filename = `Nota-${sanitizeFilenamePart(transaction.invoiceNumber)}.jpg`
      triggerBrowserDownload(dataUrlToBlob(dataUrl), filename)
      return filename
    } finally {
      setDownloading(false)
    }
  }, [transaction?.invoiceNumber, downloading])

  return { captureRef, downloadJpg, downloading }
}

/** Salinan nota off-screen yang menjadi sumber capture JPG (tidak terlihat, hanya layout). */
export function InvoiceJpgCapture({
  captureRef,
  transaction,
  config,
  store,
}: {
  captureRef: React.RefObject<HTMLDivElement | null>
  transaction: TransactionDTO
  config: InvoiceTemplateConfig
  store: InvoiceStore
}) {
  return (
    <div
      style={{ position: "fixed", top: 0, left: "-12000px", zIndex: -1, pointerEvents: "none" }}
      aria-hidden="true"
    >
      <div ref={captureRef} style={{ background: "#ffffff", padding: CAPTURE_PADDING }}>
        <InvoiceRenderer transaction={transaction} config={config} store={store} />
      </div>
    </div>
  )
}
