// Dialog riwayat shift: daftar sesi (paginated, badge Aktif/Selesai, selisih
// berwarna). Baris "Selesai" diklik → dialog laporan lengkap + cetak A4.
"use client";

import { useState } from "react";
import { History, Printer, RotateCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationControls } from "@/components/app/shared";
import { ExportMenu } from "@/components/app/export-menu";
import { useApi } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { formatDateTimeID, formatIDR } from "@/lib/format";
import type { CashSessionDTO, CashSessionReportDTO, Paginated, TenantDTO } from "@/lib/types";
import { ShiftReport, ShiftReportPrintable, usePrintShiftReport } from "./shift-report";

type SessionRow = CashSessionDTO & { transactionCount: number };

export function ShiftHistoryDialog({
  open,
  onOpenChange,
  store,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  store: TenantDTO | null;
}) {
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Reset saat dialog dibuka (pola adjust-state).
  const [prevOpen, setPrevOpen] = useState(false);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setPage(1);
      setDetailId(null);
    }
  }

  const list = useApi<Paginated<SessionRow>>(open ? `/api/cash-sessions?page=${page}&pageSize=10` : null);
  const detail = useApi<{ session: CashSessionReportDTO }>(detailId ? `/api/cash-sessions/${detailId}` : null);
  const printReport = usePrintShiftReport();

  const rows = list.data?.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" />
              Riwayat Shift
            </DialogTitle>
            <DialogDescription>
              Riwayat sesi kasir Anda. Klik shift "Selesai" untuk melihat laporan lengkap dan mencetaknya.
            </DialogDescription>
          </DialogHeader>

          <div aria-label="Daftar shift">
            {list.loading && !rows.length ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] rounded-lg" />
                ))}
              </div>
            ) : list.error ? (
              <div className="text-center py-10">
                <p className="text-sm text-destructive" role="alert">
                  {list.error}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void list.refresh()}>
                  <RotateCw className="size-4" />
                  Coba lagi
                </Button>
              </div>
            ) : !rows.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <History className="size-7 text-muted-foreground/50 mb-2.5" aria-hidden="true" />
                <p className="text-sm font-medium text-muted-foreground">Belum ada riwayat shift</p>
                <p className="text-xs text-muted-foreground/80 mt-1">
                  Shift yang Anda mulai dan tutup akan tercatat di sini.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {rows.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={s.status === "OPEN"}
                      onClick={() => setDetailId(s.id)}
                      className={cn(
                        "w-full text-left rounded-lg border bg-card p-3 transition-colors",
                        s.status === "CLOSED"
                          ? "hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                          : "opacity-75 cursor-default"
                      )}
                      aria-label={
                        s.status === "CLOSED"
                          ? `Lihat laporan shift ${s.userName ?? "kasir"} ${formatDateTimeID(s.openedAt)}`
                          : `Shift aktif ${s.userName ?? "kasir"} — berjalan`
                      }
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{s.userName ?? "Kasir"}</p>
                            {s.status === "OPEN" ? (
                              <Badge className="text-[10px] px-1.5 gap-1 bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-transparent">
                                <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
                                Aktif
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] px-1.5 gap-1">
                                <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
                                Selesai
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground tabular mt-1">
                            {formatDateTimeID(s.openedAt)} →{" "}
                            {s.closedAt ? formatDateTimeID(s.closedAt) : "berjalan"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground tabular">
                            {s.transactionCount} trx · kas awal {formatIDR(s.openingCash)}
                          </p>
                          {s.difference === null ? (
                            <p className="text-xs text-muted-foreground mt-1">Selisih —</p>
                          ) : (
                            <p
                              className={cn(
                                "text-xs font-semibold tabular mt-1",
                                s.difference < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {s.difference === 0
                                ? "Sesuai"
                                : s.difference > 0
                                  ? `Lebih ${formatIDR(s.difference)}`
                                  : `Kurang ${formatIDR(Math.abs(s.difference))}`}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!list.loading && !!rows.length && list.data && (
            <PaginationControls
              page={list.data.page}
              totalPages={list.data.totalPages}
              total={list.data.total}
              onPage={setPage}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog laporan detail (menumpuk di atas riwayat) */}
      <Dialog open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Laporan Shift</DialogTitle>
            <DialogDescription>
              Rincian penjualan, kas, dan selisih untuk shift terpilih.
            </DialogDescription>
          </DialogHeader>

          {detail.loading ? (
            <div className="space-y-2.5" aria-label="Memuat laporan shift">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail.error ? (
            <div className="text-center py-8">
              <p className="text-sm text-destructive" role="alert">
                {detail.error}
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void detail.refresh()}>
                <RotateCw className="size-4" />
                Coba lagi
              </Button>
            </div>
          ) : detail.data ? (
            <>
              <div className="rounded-lg border bg-muted/40 p-3">
                <ShiftReport report={detail.data.session} store={store} />
              </div>
              <DialogFooter className="gap-2">
                <ExportMenu
                  size="sm"
                  label="Unduh"
                  params={{ type: "cash-session", sessionId: detailId }}
                />
                <Button variant="outline" onClick={printReport}>
                  <Printer className="size-4" />
                  Cetak Laporan
                </Button>
                <Button onClick={() => setDetailId(null)}>Tutup</Button>
              </DialogFooter>
              <ShiftReportPrintable report={detail.data.session} store={store} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
