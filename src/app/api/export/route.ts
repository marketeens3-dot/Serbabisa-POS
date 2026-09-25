// GET /api/export — ekspor data (CSV | XLSX | PDF) untuk:
// transactions | products (itemType=PRODUCT|SERVICE) | customers | cash-session.
// Tenant-scoped, maks 10.000 baris. Semua angka rupiah tetap angka asli di XLSX.
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ApiError, handleApiError, requireUser } from "@/lib/api"
import { logAudit } from "@/lib/audit"
import { AUDIT_ACTIONS } from "@/lib/constants"
import { formatDateID, formatDateTimeID } from "@/lib/format"
import { renderCsv, renderPdf, renderXlsx, type ExportDoc, type ExportSection } from "@/lib/export-docs"

const MAX_ROWS = 10_000
const FORMATS = ["csv", "xlsx", "pdf"] as const
type ExportFormat = (typeof FORMATS)[number]

const MIME: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
}

const AUDIT_ACTION: Record<ExportFormat, string> = {
  csv: AUDIT_ACTIONS.CSV_EXPORTED,
  xlsx: AUDIT_ACTIONS.EXPORT_XLSX,
  pdf: AUDIT_ACTIONS.EXPORT_PDF,
}

export async function GET(req: NextRequest) {
  try {
    const { user, tenantId } = await requireUser()
    const url = new URL(req.url)
    const type = url.searchParams.get("type") ?? "transactions"
    const formatParam = (url.searchParams.get("format") ?? "csv").toLowerCase()
    if (!FORMATS.includes(formatParam as ExportFormat)) {
      throw new ApiError("INVALID_INPUT", "Format ekspor tidak dikenal (csv | xlsx | pdf).", 422)
    }
    const format = formatParam as ExportFormat
    const dateFrom = url.searchParams.get("dateFrom")?.trim() ?? ""
    const dateTo = url.searchParams.get("dateTo")?.trim() ?? ""

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { businessName: true },
    })
    const businessName = tenant?.businessName ?? "Toko"
    const periodLabel = dateFrom || dateTo
      ? `Periode ${dateFrom ? formatDateID(`${dateFrom}T12:00:00+07:00`) : "awal"} – ${dateTo ? formatDateID(`${dateTo}T12:00:00+07:00`) : "kini"}`
      : "Semua periode"

    let doc: ExportDoc

    if (type === "products" || type === "services") {
      const itemType = type === "services" ? "SERVICE" : "PRODUCT"
      const label = itemType === "PRODUCT" ? "Produk" : "Jasa"
      const items = await db.catalogItem.findMany({
        where: { tenantId, type: itemType },
        include: { category: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: MAX_ROWS,
      })
      const section: ExportSection = {
        heading: `Daftar ${label}`,
        sheetName: label,
        filter: true,
        table: {
          headers: ["Nama", "SKU", "Barcode", "Kategori", "Harga Jual", "Stok", "Satuan", "Stok Minimum", "Status"],
          moneyCols: [4],
          numCols: [5, 7],
          rows: items.map((i) => [
            i.name, i.sku ?? "", i.barcode ?? "", i.category?.name ?? "", i.sellingPrice, i.stockQty, i.unit, i.minStockQty, i.isActive ? "Aktif" : "Nonaktif",
          ]),
        },
      }
      doc = {
        title: `Daftar ${label}`,
        subtitle: `${businessName} · semua waktu`,
        sections: [section],
        filename: itemType === "PRODUCT" ? "produk" : "jasa",
      }
    } else if (type === "customers") {
      const customers = await db.customer.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: MAX_ROWS })
      doc = {
        title: "Daftar Pelanggan",
        subtitle: `${businessName} · semua waktu`,
        sections: [{
          heading: "Pelanggan",
          sheetName: "Pelanggan",
          filter: true,
          table: {
            headers: ["Nama", "Telepon", "Email", "Alamat", "Catatan", "Status", "Dibuat"],
            rows: customers.map((c) => [c.name, c.phone ?? "", c.email ?? "", c.address ?? "", c.notes ?? "", c.isActive ? "Aktif" : "Nonaktif", formatDateTimeID(c.createdAt)]),
          },
        }],
        filename: "pelanggan",
      }
    } else if (type === "transactions") {
      const createdAt: { gte?: Date; lte?: Date } = {}
      if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00+07:00`)
      if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999+07:00`)
      const txs = await db.transaction.findMany({
        where: { tenantId, ...(Object.keys(createdAt).length ? { createdAt } : {}) },
        include: { customer: { select: { name: true } }, cashier: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
      })
      doc = {
        title: "Laporan Transaksi",
        subtitle: `${businessName} · ${periodLabel}`,
        meta: [
          ["Jumlah transaksi", String(txs.length)],
          ["Total (net selesai)", txs.filter((t) => t.status === "COMPLETED").reduce((s, t) => s + t.totalAmount - t.refundedAmount, 0)],
        ],
        sections: [{
          heading: "Daftar Transaksi",
          sheetName: "Transaksi",
          filter: true,
          table: {
            headers: ["Invoice", "Tanggal", "Pelanggan", "Kasir", "Subtotal", "Diskon", "Pajak", "Total", "Refund", "Net", "Bayar", "Kembalian", "Metode", "Status", "Alasan Void/Refund"],
            moneyCols: [4, 5, 6, 7, 8, 9, 10, 11],
            rows: txs.map((t) => [
              t.invoiceNumber, formatDateTimeID(t.createdAt), t.customer?.name ?? "", t.cashier?.fullName ?? "",
              t.subtotal, t.discountAmount, t.taxAmount, t.totalAmount, t.refundedAmount,
              t.totalAmount - t.refundedAmount, t.paidAmount, t.changeAmount,
              t.paymentMethod, t.status, t.voidReason ?? t.refundReason ?? "",
            ]),
          },
        }],
        filename: "transaksi",
      }
    } else if (type === "cash-session") {
      // Laporan satu shift: meta + ringkasan kas + daftar transaksi ter-attach.
      const sessionId = url.searchParams.get("sessionId")?.trim() ?? ""
      if (!sessionId) throw new ApiError("INVALID_INPUT", "sessionId wajib untuk export laporan shift.", 422)
      const session = await db.cashSession.findFirst({
        where: { id: sessionId, tenantId },
        include: { user: { select: { fullName: true } }, tenant: { select: { businessName: true } } },
      })
      if (!session) throw new ApiError("NOT_FOUND", "Sesi shift tidak ditemukan.", 404)

      const txs = await db.transaction.findMany({
        where: { cashSessionId: sessionId, tenantId },
        include: { cashier: { select: { fullName: true } } },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
      })
      const cashNet = txs.filter((t) => t.paymentMethod === "CASH" && t.status !== "VOID").reduce((s, t) => s + (t.totalAmount - t.refundedAmount), 0)
      const nonCashNet = txs.filter((t) => t.paymentMethod !== "CASH" && t.status !== "VOID").reduce((s, t) => s + (t.totalAmount - t.refundedAmount), 0)

      doc = {
        title: "Laporan Shift",
        subtitle: session.tenant?.businessName ?? businessName,
        meta: [
          ["Toko", session.tenant?.businessName ?? ""],
          ["Kasir", session.user?.fullName ?? ""],
          ["Dibuka", formatDateTimeID(session.openedAt)],
          ["Ditutup", session.closedAt ? formatDateTimeID(session.closedAt) : "—"],
          ["Status", session.status],
        ],
        sections: [
          {
            heading: "Ringkasan Kas",
            sheetName: "Ringkasan",
            table: {
              headers: ["Uraian", "Nilai"],
              moneyCols: [1],
              rows: [
                ["Kas Awal", session.openingCash],
                ["Penjualan Tunai (net)", cashNet],
                ["Penjualan Non-Tunai (net)", nonCashNet],
                ["Kas Seharusnya", session.expectedCash ?? null],
                ["Kas Fisik", session.closingCash ?? null],
                ["Selisih", session.difference ?? null],
                ["Catatan", session.notes ?? ""],
              ],
            },
          },
          {
            heading: "Daftar Transaksi",
            sheetName: "Transaksi",
            filter: true,
            table: {
              headers: ["Invoice", "Waktu", "Kasir", "Metode", "Total", "Refund", "Net", "Status"],
              moneyCols: [4, 5, 6],
              rows: txs.map((t) => [
                t.invoiceNumber, formatDateTimeID(t.createdAt), t.cashier?.fullName ?? "",
                t.paymentMethod, t.totalAmount, t.refundedAmount, t.totalAmount - t.refundedAmount, t.status,
              ]),
            },
          },
        ],
        filename: `shift-${session.openedAt.toISOString().slice(0, 10)}`,
      }
    } else {
      throw new ApiError("INVALID_INPUT", "Tipe export tidak dikenal.", 400)
    }

    await logAudit(undefined, {
      actorUserId: user.id, tenantId, action: AUDIT_ACTION[format],
      resourceType: "Export", metadata: { type, format, dateFrom, dateTo },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    })

    let body: Uint8Array | string
    if (format === "xlsx") body = await renderXlsx(doc)
    else if (format === "pdf") body = renderPdf(doc)
    else body = renderCsv(doc)

    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="${doc.filename}.${format}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    return handleApiError(err)
  }
}
