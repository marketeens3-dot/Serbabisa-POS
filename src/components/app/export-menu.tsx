// Menu ekspor bersama: CSV / Excel (.xlsx) / PDF — dipakai di seluruh view
// (Transaksi, Produk, Jasa, Pelanggan, Laporan, Laporan Shift).
// GET /api/export dengan Content-Disposition attachment → unduh langsung.
"use client"

import type { LucideIcon } from "lucide-react"
import { ChevronDown, Download, FileDown, FileSpreadsheet, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ExportFormat = "csv" | "xlsx" | "pdf"

const FORMATS: { value: ExportFormat; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "csv", label: "CSV", hint: "Ringan — kompatibel semua aplikasi", icon: FileText },
  { value: "xlsx", label: "Excel (.xlsx)", hint: "Berformat, angka asli + filter", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", hint: "Rapi — siap cetak / dikirim", icon: FileDown },
]

export function ExportMenu({
  params,
  label = "Ekspor",
  size = "default",
}: {
  /** Query params /api/export (type, dateFrom, dateTo, sessionId, …). */
  params: Record<string, string | number | undefined | null>
  label?: string
  size?: "default" | "sm"
}) {
  const buildUrl = (format: ExportFormat): string => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") sp.set(k, String(v))
    }
    sp.set("format", format)
    return `/api/export?${sp.toString()}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Download className="size-4" />
          {label}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Pilih format unduhan</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} asChild className="py-2.5">
            <a href={buildUrl(f.value)} download aria-label={`Unduh ${label.toLowerCase()} sebagai ${f.label}`}>
              <f.icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium leading-none">{f.label}</span>
                <span className="mt-1 text-xs leading-none text-muted-foreground">{f.hint}</span>
              </span>
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
