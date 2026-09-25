// Audit log: append-only, filterable, paginated. Super Admin read-only.
"use client";

import { useMemo, useState } from "react";
import { ScrollText, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingRows, PageHeader, PaginationControls } from "@/components/app/shared";
import { actionLabel } from "@/components/admin/admin-dashboard-view";
import { useApi, useDebounced, useResetOnKeyChange } from "@/hooks/use-api";
import { formatDateTimeID } from "@/lib/format";
import type { AuditLogDTO, Paginated } from "@/lib/types";

// Gaya kolom header tabel — uppercase muted (bahasa desain tabel proyek).
const TH = "text-xs uppercase tracking-wide text-muted-foreground font-medium";

// Kelompok warna badge aksi audit (berdasarkan prefiks/sufiks aksi) — murni presentasional.
function auditActionTone(action: string): string {
  if (
    action.endsWith("_VOIDED") ||
    action === "ROLE_CHANGE_ATTEMPT" ||
    action.endsWith("_DEACTIVATED") ||
    action === "LOGIN_FAILED"
  ) {
    return "border-destructive/30 bg-destructive/10 text-destructive"
  }
  if (
    action === "LOGIN_SUCCESS" ||
    action.startsWith("TRANSACTION_") ||
    action.endsWith("_CREATED")
  ) {
    return "border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
  }
  if (action.endsWith("_UPDATED") || action.includes("SETTINGS")) {
    return "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
  }
  return "border-border bg-muted text-muted-foreground"
}

export default function AdminAuditView() {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)
  const [action, setAction] = useState("ALL")
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<AuditLogDTO | null>(null)

  useResetOnKeyChange(`${debounced}|${action}`, () => setPage(1))

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" })
    if (debounced) params.set("search", debounced)
    if (action !== "ALL") params.set("action", action)
    return params.toString()
  }, [debounced, action, page])

  const { data, error, loading, refresh } = useApi<Paginated<AuditLogDTO> & { availableActions: { action: string; count: number }[] }>(
    `/api/admin/audit?${query}`
  )
  const events = data?.data ?? []
  const availableActions = data?.availableActions ?? []

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Audit Log"
        description="Jejak aktivitas sistem — bersifat append-only, tidak dapat diubah atau dihapus."
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari aksi / aktor…" className="pl-9 pr-9" aria-label="Cari audit log" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-ring"
              aria-label="Bersihkan pencarian"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-[220px]" aria-label="Filter aksi">
            <SelectValue placeholder="Semua aksi" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">Semua aksi</SelectItem>
            {availableActions.map((a) => (
              <SelectItem key={a.action} value={a.action}>
                {a.action} ({a.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorState message={error} onRetry={refresh} />}

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="p-4"><LoadingRows rows={10} /></div>
        ) : !events.length ? (
          <div className="p-6">
            <EmptyState icon={ScrollText} title="Tidak ada event audit" description="Belum ada aktivitas yang cocok dengan filter." />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={TH}>Waktu</TableHead>
                <TableHead className={TH}>Aksi</TableHead>
                <TableHead className={cn(TH, "hidden md:table-cell")}>Aktor</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>Toko</TableHead>
                <TableHead className={cn(TH, "hidden lg:table-cell")}>IP</TableHead>
                <TableHead className={cn(TH, "hidden sm:table-cell")}>Objek</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => (
                <TableRow key={ev.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetail(ev)}>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap tabular">{formatDateTimeID(ev.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-mono text-[11px]", auditActionTone(ev.action))}>{ev.action}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="text-sm font-medium truncate max-w-[160px]">{ev.actorName ?? "Sistem"}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[160px]">{ev.actorEmail ?? ""}</p>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm truncate max-w-[140px]">
                    {ev.tenantName ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground font-mono text-xs">{ev.ipAddress ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm truncate max-w-[140px]">{ev.resourceType ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <PaginationControls page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
      )}

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("font-mono text-[11px]", detail ? auditActionTone(detail.action) : "")}>{detail?.action}</Badge>
              {detail ? actionLabel(detail.action) : ""}
            </DialogTitle>
            <DialogDescription>{detail ? formatDateTimeID(detail.createdAt) : ""}</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <InfoRow label="Aktor" value={detail.actorName ? `${detail.actorName} (${detail.actorEmail ?? "-"})` : "Sistem"} />
              <InfoRow label="Toko" value={detail.tenantName ?? "—"} />
              <InfoRow label="Objek" value={`${detail.resourceType ?? "—"}${detail.resourceId ? ` · ${detail.resourceId.slice(0, 13)}…` : ""}`} />
              <InfoRow label="IP" value={detail.ipAddress ?? "—"} />
              {detail.metadata && (
                <div>
                  <p className="text-muted-foreground mb-1.5">Metadata:</p>
                  <pre className="rounded-lg bg-muted/50 border p-2.5 text-xs overflow-auto max-h-40 font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  )
}
