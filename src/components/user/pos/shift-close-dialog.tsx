// Dialog tutup shift: ringkasan terbaru (fetch ulang saat dibuka), input hasil
// hitung fisik + indikator selisih LIVE, catatan opsional. Setelah sukses,
// konten berganti menjadi laporan shift yang bisa dicetak.
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Printer, RotateCw, Check, TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { CashSessionDTO, CashSessionReportDTO, TenantDTO } from "@/lib/types";
import type { ShiftApi } from "./use-shift";
import { ShiftReport, ShiftReportPrintable, usePrintShiftReport } from "./shift-report";

export function ShiftCloseDialog({
  open,
  onOpenChange,
  session,
  shift,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: CashSessionDTO | null;
  shift: ShiftApi;
  store: TenantDTO | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CashSessionReportDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closingInput, setClosingInput] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CashSessionReportDTO | null>(null);

  const printReport = usePrintShiftReport();

  // Reset + kunci id sesi saat dialog dibuka (pola adjust-state).
  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setSessionId(session?.id ?? null);
      setDetail(null);
      setReport(null);
      setLoadError(null);
      setLoadingDetail(!!session);
      setClosingInput("");
      setNotes("");
      setError(null);
      setSubmitting(false);
    }
  }

  const loadDetail = useCallback(async () => {
    if (!sessionId) return;
    setLoadingDetail(true);
    setLoadError(null);
    try {
      const res = await api.get<{ session: CashSessionReportDTO }>(`/api/cash-sessions/${sessionId}`);
      setDetail(res.session);
    } catch {
      setLoadError("Gagal memuat ringkasan shift. Periksa koneksi lalu coba lagi.");
    } finally {
      setLoadingDetail(false);
    }
  }, [sessionId]);

  // Ringkasan selalu diambil ulang saat dialog dibuka agar angka terbaru.
  useEffect(() => {
    if (open && sessionId) void loadDetail();
  }, [open, sessionId, loadDetail]);

  const expectedCash = detail?.summary.expectedCash ?? 0;
  const cashCount = detail?.byMethod.find((m) => m.method === "CASH")?.count ?? 0;
  const nonCashCount = (detail?.summary.transactionCount ?? 0) - cashCount;
  const digits = closingInput.replace(/[^0-9]/g, "");
  const closingCash = Math.floor(Number(digits) || 0);
  const hasInput = digits.length > 0;
  const difference = closingCash - expectedCash;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await shift.close(sessionId, closingCash, notes.trim() || null);
      toast.success("Shift ditutup — selisih kas telah dicatat.");
      // Ambil laporan final (sudah termasuk closingCash, selisih, daftar transaksi).
      try {
        const res = await api.get<{ session: CashSessionReportDTO }>(`/api/cash-sessions/${sessionId}`);
        setReport(res.session);
      } catch {
        // Shift tetap sukses ditutup — cukup tutup dialog bila laporan gagal dimuat.
        onOpenChange(false);
      }
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        (err.code === "SESSION_ALREADY_CLOSED" || err.code === "NOT_FOUND")
      ) {
        toast.error(err.message);
        void shift.refetch();
        onOpenChange(false);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Gagal menutup shift. Silakan coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent
        className={cn("max-h-[85vh] overflow-y-auto", report ? "sm:max-w-2xl" : "sm:max-w-md")}
      >
        {report ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-5 text-primary" />
                Shift Ditutup
              </DialogTitle>
              <DialogDescription>
                Cetak laporan untuk arsip atau serah terima kas di akhir shift.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/40 p-3">
              <ShiftReport report={report} store={store} />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={printReport}>
                <Printer className="size-4" />
                Cetak Laporan
              </Button>
              <Button onClick={() => onOpenChange(false)}>Selesai</Button>
            </DialogFooter>
            <ShiftReportPrintable report={report} store={store} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="size-5 text-destructive" />
                Tutup Shift
              </DialogTitle>
              <DialogDescription>
                Hitung kas fisik di laci, lalu cocokkan dengan kas seharusnya.
              </DialogDescription>
            </DialogHeader>

            {loadingDetail ? (
              <div className="space-y-2.5" aria-label="Memuat ringkasan shift">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-14 w-full" />
                <p className="text-xs text-muted-foreground text-center pt-1">Memuat ringkasan shift…</p>
              </div>
            ) : loadError ? (
              <div className="text-center py-4">
                <p className="text-sm text-destructive" role="alert">
                  {loadError}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void loadDetail()}>
                  <RotateCw className="size-4" />
                  Coba lagi
                </Button>
              </div>
            ) : !detail || detail.status !== "OPEN" ? (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Shift ini sudah tidak aktif — mungkin telah ditutup dari perangkat lain.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => onOpenChange(false)}>
                  Tutup
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <p
                    className="text-sm text-destructive rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2.5"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                {/* Ringkasan (snapshot terbaru saat dialog dibuka) */}
                <div className="rounded-xl border bg-muted/30 p-3.5 space-y-2 text-sm">
                  <SummaryRow label="Kas awal" value={formatIDR(detail.openingCash)} />
                  <SummaryRow
                    label={`Penjualan tunai · ${cashCount} trx`}
                    value={formatIDR(detail.summary.cashTotal)}
                  />
                  <SummaryRow
                    label={`Penjualan non-tunai · ${nonCashCount} trx`}
                    value={formatIDR(detail.summary.nonCashTotal)}
                  />
                  <SummaryRow
                    label="Jumlah transaksi"
                    value={`${detail.summary.transactionCount} transaksi`}
                  />
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/25 px-3.5 py-2.5 mt-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Kas seharusnya
                    </span>
                    <span className="text-lg font-bold text-primary tabular">
                      {formatIDR(expectedCash)}
                    </span>
                  </div>
                </div>

                {/* Hitung fisik */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="closing-cash">Hasil hitung fisik kas (Rp)</Label>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setClosingInput(String(expectedCash))}
                    >
                      Isi kas seharusnya
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      Rp
                    </span>
                    <Input
                      id="closing-cash"
                      inputMode="numeric"
                      value={closingInput}
                      onChange={(e) => setClosingInput(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="0"
                      className="pl-9 h-11 text-base font-semibold tabular"
                      autoFocus
                      aria-describedby="closing-selisih"
                    />
                  </div>
                  <div aria-live="polite" id="closing-selisih">
                    {hasInput ? (
                      <div
                        className={cn(
                          "rounded-lg border px-3.5 py-2.5 flex items-center justify-between text-sm font-semibold",
                          difference < 0
                            ? "border-destructive/25 bg-destructive/10 text-destructive"
                            : "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {difference < 0 ? (
                            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <Check className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          Selisih kas
                        </span>
                        <span className="tabular">
                          {difference === 0
                            ? "Sesuai"
                            : difference > 0
                              ? `Lebih ${formatIDR(difference)}`
                              : `Kurang ${formatIDR(Math.abs(difference))}`}
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Selisih dihitung dari kas fisik − kas seharusnya.
                      </p>
                    )}
                  </div>
                </div>

                {/* Catatan */}
                <div className="space-y-2">
                  <Label htmlFor="shift-notes">Catatan penutupan (opsional)</Label>
                  <Textarea
                    id="shift-notes"
                    rows={2}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: selisih karena kembalian pelanggan kurang…"
                    className="text-sm"
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                    Batal
                  </Button>
                  <Button type="submit" variant="destructive" disabled={submitting || !hasInput}>
                    {submitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Menutup…
                      </>
                    ) : (
                      "Tutup Shift"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  );
}
