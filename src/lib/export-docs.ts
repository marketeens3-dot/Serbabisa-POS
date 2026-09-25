// Server-only — perender dokumen ekspor: CSV / Excel (.xlsx) / PDF.
// Satu model data (ExportDoc) → tiga format, agar konsisten antar tampilan.
// - XLSX: ExcelJS — angka asli (bisa dihitung ulang), header beku, autoFilter.
// - PDF : jsPDF + jspdf-autotable — siap cetak/kirim, footer halaman otomatis.
// - CSV : ringan, kompatibel semua (BOM UTF-8 agar Excel membaca dengan benar).
import ExcelJS from "exceljs"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { formatDateTimeID, formatNumberID } from "./format"

export type ExportCell = string | number | null | undefined

export interface ExportTable {
  headers: string[]
  rows: ExportCell[][]
  /** Indeks kolom uang rupiah (angka bulat) — format #,##0 / "Rp …" di PDF. */
  moneyCols?: number[]
  /** Indeks kolom kuantitas — format hingga 3 desimal. */
  numCols?: number[]
}

export interface ExportSection {
  heading?: string
  /** Nama sheet Excel (maks 31 karakter). Default dari heading / "Data". */
  sheetName?: string
  table: ExportTable
  /** Aktifkan autoFilter Excel untuk sheet ini (tabel utama). */
  filter?: boolean
}

export interface ExportDoc {
  title: string
  /** Subjudul kanan-atas (nama toko + periode). */
  subtitle?: string
  /** Baris key-value di bawah judul (dicetak di PDF + sheet ringkasan CSV). */
  meta?: [string, string | number][]
  sections: ExportSection[]
  /** Nama file TANPA ekstensi. */
  filename: string
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvEscape(v: ExportCell): string {
  const s = v == null ? "" : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function renderCsv(doc: ExportDoc): string {
  const lines: string[] = [csvEscape(doc.title)]
  if (doc.subtitle) lines.push(csvEscape(doc.subtitle))
  if (doc.meta?.length) {
    for (const [k, v] of doc.meta) lines.push([k, v].map(csvEscape).join(","))
  }
  for (const section of doc.sections) {
    lines.push("")
    if (section.heading) {
      lines.push(csvEscape(section.heading))
      lines.push(section.table.headers.map(csvEscape).join(","))
    } else {
      lines.push(section.table.headers.map(csvEscape).join(","))
    }
    for (const r of section.table.rows) lines.push(r.map(csvEscape).join(","))
  }
  return "\uFEFF" + lines.join("\r\n") // BOM agar Excel membaca UTF-8
}

// ---------------------------------------------------------------------------
// XLSX (ExcelJS)
// ---------------------------------------------------------------------------

const BRAND_RGB = "FF059669" // emerald — merek Serbabisa
const BRAND_DARK = "FF047857"
const ZEBRA = "FFF6F8F9"
const GRID = "FFE5E7EB"

function sheetNameOf(section: ExportSection, fallbackIndex: number): string {
  const raw = section.sheetName ?? section.heading ?? (fallbackIndex === 0 ? "Data" : `Data ${fallbackIndex + 1}`)
  // Nama sheet Excel: maks 31 karakter, tanpa []:*?/\
  return raw.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Data"
}

function columnWidths(t: ExportTable): number[] {
  return t.headers.map((h, i) => {
    let max = String(h ?? "").length + 2
    for (const r of t.rows) {
      const v = r[i]
      if (v != null) max = Math.max(max, String(v).length)
    }
    return Math.min(46, Math.max(10, max + 2))
  })
}

export async function renderXlsx(doc: ExportDoc): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Serbabisa POS"
  wb.created = new Date()

  // Sheet pertama: judul + meta (bila ada) agar dokumen mandiri.
  // Nama sheet harus unik — hindari tabrakan dengan sheetName section.
  if (doc.meta?.length) {
    let metaSheetName = "Info"
    if (doc.sections.some((s) => sheetNameOf(s, 0) === metaSheetName)) metaSheetName = "Info Umum"
    const ws = wb.addWorksheet(metaSheetName, { properties: { defaultColWidth: 28 } })
    ws.mergeCells("A1:B1")
    const titleCell = ws.getCell("A1")
    titleCell.value = doc.title + (doc.subtitle ? ` — ${doc.subtitle}` : "")
    titleCell.font = { bold: true, size: 13, color: { argb: BRAND_DARK } }
    ws.getRow(1).height = 22
    const metaRow = ws.addRow(["Uraian", "Nilai"])
    metaRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RGB } }
    })
    for (const [k, v] of doc.meta) {
      const row = ws.addRow([k, v])
      row.getCell(1).font = { bold: true }
      if (typeof v === "number") {
        const c = row.getCell(2)
        c.numFmt = "#,##0"
        c.alignment = { horizontal: "right" }
      }
    }
    ws.getColumn(1).width = 26
    ws.getColumn(2).width = 34
  }

  for (const section of doc.sections) {
    const t = section.table
    const ws = wb.addWorksheet(sheetNameOf(section, wb.worksheets.length), {
      views: [{ state: "frozen", ySplit: 1 }],
    })
    ws.columns = columnWidths(t).map((w) => ({ width: w }))

    const headerRow = ws.addRow(t.headers)
    headerRow.height = 20
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RGB } }
      cell.alignment = { vertical: "middle", wrapText: false }
      cell.border = { bottom: { style: "thin", color: { argb: BRAND_DARK } } }
    })

    const money = t.moneyCols ?? []
    const qty = t.numCols ?? []
    t.rows.forEach((r, ri) => {
      const row = ws.addRow(r)
      row.eachCell({ includeEmpty: true }, (cell, ci) => {
        const idx = ci - 1 // ExcelJS 1-based
        const v = r[idx]
        if (typeof v === "number") {
          cell.numFmt = qty.includes(idx) ? "#,##0.###" : "#,##0"
          cell.alignment = { horizontal: "right" }
        }
        cell.border = { bottom: { style: "hair", color: { argb: GRID } } }
        if (ri % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }
        }
      })
    })

    if (section.filter && t.rows.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: t.rows.length + 1, column: t.headers.length },
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}

// ---------------------------------------------------------------------------
// PDF (jsPDF + AutoTable)
// ---------------------------------------------------------------------------

const moneyStr = (n: number) => `Rp ${formatNumberID(n)}`

type LastAutoTable = { lastAutoTable?: { finalY: number } }

function drawFooter(pdf: jsPDF, subtitle?: string): void {
  const h = pdf.internal.pageSize.getHeight()
  const w = pdf.internal.pageSize.getWidth()
  pdf.setDrawColor(222, 226, 230)
  pdf.setLineWidth(0.2)
  pdf.line(12, h - 10, w - 12, h - 10)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(7.5)
  pdf.setTextColor(120, 124, 130)
  const label = `Serbabisa POS${subtitle ? ` — ${subtitle}` : ""} · diunduh ${formatDateTimeID(new Date())}`
  pdf.text(label.length > 110 ? `${label.slice(0, 107)}…` : label, 12, h - 6)
  pdf.text(`Hal. ${pdf.getNumberOfPages()}`, w - 12, h - 6, { align: "right" })
}

export function renderPdf(doc: ExportDoc): Uint8Array {
  // Tabel lebar (≥10 kolom) → landscape agar kolom tidak terlalu sempit.
  const wide = doc.sections.some((s) => s.table.headers.length >= 10)
  const pdf = new jsPDF({ orientation: wide ? "landscape" : "portrait", unit: "mm", format: "a4" })
  const w = pdf.internal.pageSize.getWidth()
  const h = pdf.internal.pageSize.getHeight()

  // Bilah merek (halaman pertama).
  pdf.setFillColor(5, 150, 105)
  pdf.rect(0, 0, w, 16, "F")
  pdf.setTextColor(255, 255, 255)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12.5)
  pdf.text(doc.title, 12, 10.5)
  if (doc.subtitle) {
    const sub = doc.subtitle.length > 72 ? `${doc.subtitle.slice(0, 69)}…` : doc.subtitle
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8.5)
    pdf.text(sub, w - 12, 10.5, { align: "right" })
  }

  let y = 24

  // Blok meta (key-value).
  if (doc.meta?.length) {
    pdf.setFontSize(8.5)
    pdf.setTextColor(96, 100, 108)
    for (const [k, v] of doc.meta) {
      pdf.setFont("helvetica", "bold")
      pdf.text(`${k}:`, 12, y)
      const kw = pdf.getTextWidth(`${k}: `)
      pdf.setFont("helvetica", "normal")
      let val = typeof v === "number" ? moneyStr(v) : String(v ?? "")
      const maxW = w - 24 - kw
      while (val && pdf.getTextWidth(val) > maxW) val = val.slice(0, -2)
      pdf.text(val, 12 + kw, y)
      y += 5
    }
    y += 2
  }

  for (const section of doc.sections) {
    const t = section.table
    if (section.heading) {
      if (y > h - 50) {
        pdf.addPage()
        y = 20
      }
      pdf.setFont("helvetica", "bold")
      pdf.setFontSize(10.5)
      pdf.setTextColor(35, 38, 42)
      pdf.text(section.heading, 12, y)
      y += 2.5
    }

    const money = t.moneyCols ?? []
    const qty = t.numCols ?? []
    const columnStyles: Record<number, { halign: "right" }> = {}
    for (const ci of [...money, ...qty]) columnStyles[ci] = { halign: "right" }

    const body = t.rows.map((r) =>
      r.map((c, ci) => {
        if (c == null) return ""
        if (typeof c === "number") return money.includes(ci) ? moneyStr(c) : formatNumberID(c)
        return String(c)
      })
    )

    autoTable(pdf, {
      head: [t.headers.map((x) => String(x))],
      body,
      startY: y,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 1.7,
        lineColor: [222, 226, 230],
        lineWidth: 0.15,
        textColor: [35, 38, 42],
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 2,
      },
      alternateRowStyles: { fillColor: [246, 248, 249] },
      columnStyles,
      margin: { top: 16, left: 12, right: 12, bottom: 16 },
      didDrawPage: () => drawFooter(pdf, doc.subtitle),
    })

    const finalY = (pdf as unknown as LastAutoTable).lastAutoTable?.finalY ?? h - 20
    y = finalY + 10
    if (y > h - 30) {
      pdf.addPage()
      y = 20
    }
  }

  return new Uint8Array(pdf.output("arraybuffer"))
}
