// Laporan Shift Kasir — dokumen "kertas" (selalu putih, aman dark mode) untuk
// tampilan layar DAN cetak A4. Dipakai di: hasil tutup shift & detail riwayat.
// Mekanisme cetak mengikuti pola nota: konten .invoice-print off-screen +
// window.print() (CSS @media print di globals.css).
"use client";

import { useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import type { CashSessionReportDTO, TenantDTO } from "@/lib/types";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Tunai",
  TRANSFER: "Transfer",
  QRIS: "QRIS",
  OTHER: "Lainnya",
};

/** Cetak laporan shift: injeksi @page A4 lalu window.print(), bersihkan setelahnya. */
export function usePrintShiftReport() {
  return useCallback(() => {
    const id = "sb-shift-print-rule";
    document.getElementById(id)?.remove();
    const style = document.createElement("style");
    style.id = id;
    style.textContent = "@page { size: A4; margin: 12mm; }";
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // Fallback pembersihan bila afterprint tidak terpicu.
    setTimeout(cleanup, 60_000);
  }, []);
}

/**
 * Salinan laporan yang hanya tampil saat print (pola PrintableInvoice).
 * Di-portal ke document.body agar posisi absolut saat print tidak terpengaruh
 * leluhur bertipe fixed (dialog).
 */
export function ShiftReportPrintable({
  report,
  store,
}: {
  report: CashSessionReportDTO;
  store: TenantDTO | null;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="invoice-print"
      style={{ position: "fixed", top: 0, left: "-10000px", zIndex: -1 }}
      aria-hidden="true"
    >
      <ShiftReport report={report} store={store} />
    </div>,
    document.body
  );
}

export function ShiftReport({
  report,
  store,
}: {
  report: CashSessionReportDTO;
  store: TenantDTO | null;
}) {
  const diff = report.difference;
  const cashCount = report.byMethod.find((m) => m.method === "CASH")?.count ?? 0;
  const nonCashCount = report.summary.transactionCount - cashCount;
  const truncated = report.transactions.length >= 200;

  return (
    <div className="bg-white text-zinc-900 rounded-lg border border-zinc-200 p-5 sm:p-8 text-[13px] leading-relaxed">
      {/* Kop laporan */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          {store?.logoUrl && (
            <img
              src={store.logoUrl}
              alt={`Logo ${store.businessName}`}
              className="h-12 w-auto object-contain shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="font-bold text-base uppercase tracking-wide leading-tight truncate">
              {store?.businessName ?? "Laporan Shift"}
            </p>
            {store?.address && <p className="text-[11px] text-zinc-600 leading-tight">{store.address}</p>}
            {store?.phone && <p className="text-[11px] text-zinc-600 leading-tight tabular">{store.phone}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold uppercase tracking-widest text-sm">Laporan Shift</p>
          <p className="text-[11px] text-zinc-600 tabular">#{report.id.slice(0, 8).toUpperCase()}</p>
        </div>
      </div>

      {/* Info sesi */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 py-4 text-[12px]">
        <Meta label="Kasir" value={report.userName ?? "-"} />
        <Meta label="Jumlah transaksi" value={`${report.summary.transactionCount} transaksi`} />
        <Meta label="Waktu buka" value={formatDateTimeID(report.openedAt)} />
        <Meta
          label="Waktu tutup"
          value={report.closedAt ? formatDateTimeID(report.closedAt) : "Masih aktif"}
        />
      </div>

      {/* Ringkasan keuangan */}
      <SectionTitle>Ringkasan</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-8">
        <Row label="Kas awal" value={formatIDR(report.openingCash)} />
        <Row label={`Penjualan tunai (${cashCount} trx)`} value={formatIDR(report.summary.cashTotal)} />
        <Row
          label={`Penjualan non-tunai (${nonCashCount} trx)`}
          value={formatIDR(report.summary.nonCashTotal)}
        />
        <Row label="Total penjualan" value={formatIDR(report.summary.total)} strong />
      </div>
      <div className="mt-2.5 rounded-md border-2 border-zinc-800 bg-zinc-100 px-3.5 py-2.5 flex items-center justify-between gap-3 [print-color-adjust:exact]">
        <span className="font-semibold text-[11px] uppercase tracking-wide">Kas seharusnya di laci</span>
        <span className="font-bold text-lg tabular">{formatIDR(report.summary.expectedCash)}</span>
      </div>

      {/* Rincian metode */}
      <SectionTitle>Rincian Metode Pembayaran</SectionTitle>
      {report.byMethod.length ? (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-zinc-500">
                <th className="py-1.5 pr-2 font-medium">Metode</th>
                <th className="py-1.5 pr-2 font-medium text-right">Transaksi</th>
                <th className="py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.byMethod.map((m) => (
                <tr key={m.method} className="border-b border-zinc-200">
                  <td className="py-1.5 pr-2 font-medium">{METHOD_LABELS[m.method] ?? m.method}</td>
                  <td className="py-1.5 pr-2 text-right tabular">{m.count}</td>
                  <td className="py-1.5 text-right font-semibold tabular">{formatIDR(m.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-zinc-500 text-[12px]">Belum ada transaksi pada shift ini.</p>
      )}

      {/* Hasil hitung fisik + selisih */}
      <SectionTitle>Hasil Hitung Fisik Kas</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
        <Row
          label="Kas fisik dihitung"
          value={report.closingCash === null ? "—" : formatIDR(report.closingCash)}
        />
        {diff === null || report.closingCash === null ? (
          <Row label="Selisih" value="—" />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-600">Selisih</span>
            <span
              className={cn(
                "font-bold text-lg tabular text-right",
                diff < 0 ? "text-red-600" : "text-emerald-600"
              )}
            >
              {diff === 0 ? "Sesuai ✓" : diff > 0 ? `Lebih ${formatIDR(diff)}` : `Kurang ${formatIDR(Math.abs(diff))}`}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 text-[12px]">
        <span className="text-zinc-600">Catatan: </span>
        <span className="italic">{report.notes?.trim() ? report.notes : "—"}</span>
      </div>

      {/* Daftar transaksi */}
      <SectionTitle>Daftar Transaksi ({report.transactions.length})</SectionTitle>
      {report.transactions.length ? (
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-300 text-left text-zinc-500">
                <th className="py-1.5 pr-2 font-medium">No. Invoice</th>
                <th className="py-1.5 pr-2 font-medium">Waktu</th>
                <th className="py-1.5 pr-2 font-medium">Metode</th>
                <th className="py-1.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.transactions.map((t) => (
                <tr
                  key={t.id}
                  className={cn("border-b border-zinc-200", t.status === "VOID" && "text-zinc-400 line-through")}
                >
                  <td className="py-1.5 pr-2 font-medium tabular whitespace-nowrap">
                    {t.invoiceNumber}
                    {t.status === "VOID" && (
                      <span className="ml-1.5 text-[10px] uppercase font-semibold not-italic">(batal)</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 tabular whitespace-nowrap">{formatDateTimeID(t.createdAt)}</td>
                  <td className="py-1.5 pr-2">{METHOD_LABELS[t.paymentMethod] ?? t.paymentMethod}</td>
                  <td className="py-1.5 text-right font-semibold tabular whitespace-nowrap">
                    {formatIDR(t.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-zinc-500 text-[12px]">Belum ada transaksi pada shift ini.</p>
      )}
      {truncated && (
        <p className="text-[11px] text-zinc-500 mt-1.5">Menampilkan 200 transaksi terakhir.</p>
      )}

      <p className="mt-6 pt-3 border-t border-dashed border-zinc-300 text-[11px] text-zinc-500 text-center">
        Dicetak {formatDateTimeID(Date.now())} · Serbabisa POS
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mt-5 mb-2 pb-1.5 border-b border-zinc-200">
      {children}
    </p>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-right tabular">{value}</span>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-600">{label}</span>
      <span className={cn("tabular text-right", strong && "font-bold")}>{value}</span>
    </div>
  );
}
