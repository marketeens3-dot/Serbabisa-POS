"use client";

/**
 * Indikator status sinkronisasi untuk aplikasi desktop.
 *
 * Kasir tidak perlu tahu apa pun soal sinkronisasi — tapi WAJIB bisa melihat
 * apakah transaksinya sudah aman di server atau masih tersimpan di perangkat
 * saja. Itu beda antara "sudah tercatat" dan "belum terkirim".
 *
 * Kommunikasinya sengaja dibuat jujur dan singkat:
 *   - hijau  : tersinkron, semua data sudah di server
 *   - amber  : ada N perubahan yang belum naik (masih aman di disk)
 *   - merah  : gagal sinkron (biasanya internet mati)
 *   - tooltip: kapan terakhir sinkron + sisa nomor nota di blok
 *
 * Di mode web (Vercel) komponen ini tidak dirender sama sekali — di sana
 * Supabase adalah satu-satunya sumber data, jadi tidak ada yang perlu disinkron.
 */

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw, Check, AlertTriangle, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

type SyncStatus = {
  enabled: boolean;
  isLocalMode: boolean;
  deviceId: string | null;
  deviceName: string;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingChanges: number;
  remainingInvoiceNumbers: number | null;
};

const POLL_MS = 60_000;

function formatTime(iso: string | null): string {
  if (!iso) return "belum pernah";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "belum pernah";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function SyncIndicator() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sync", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { status?: SyncStatus };
      if (body.status) setStatus(body.status);
    } catch {
      // Server lokal tidak menjawab — biarkan indikator menampilkan state lama.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const runNow = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full: false }),
      });
      const body = (await res.json()) as {
        report?: { pushed?: number; pulled?: number; error?: string; offline?: boolean };
        status?: SyncStatus;
      };
      if (body.status) setStatus(body.status);
      const r = body.report;
      if (r?.error) {
        toast.error(r.offline ? "Tidak ada koneksi ke server" : "Sinkronisasi gagal", {
          description: r.error.slice(0, 160),
        });
      } else {
        toast.success("Sinkronisasi selesai", {
          description: `${r?.pushed ?? 0} data naik, ${r?.pulled ?? 0} data turun.`,
        });
      }
    } catch {
      toast.error("Gagal menjalankan sinkronisasi");
    } finally {
      setBusy(false);
    }
  }, []);

  // Mode web: tidak ada database lokal, jadi tidak ada yang perlu ditampilkan.
  if (!status || !status.enabled) return null;

  const offline = !!status.lastError;
  const pending = status.pendingChanges;
  const healthy = !offline && pending === 0;

  const label = offline
    ? "Sinkronisasi gagal"
    : pending > 0
      ? `${pending} perubahan menunggu sinkron`
      : "Semua data tersinkron";

  const detail = [
    `Perangkat: ${status.deviceName}`,
    `Terakhir sinkron: ${formatTime(status.lastSyncAt)}`,
    status.remainingInvoiceNumbers !== null
      ? `Sisa nomor nota: ${status.remainingInvoiceNumbers}`
      : null,
    offline ? `Kendala: ${status.lastError}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium ${
            healthy
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : offline
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          {healthy ? (
            <Cloud className="size-3.5" aria-hidden="true" />
          ) : offline ? (
            <CloudOff className="size-3.5" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline tabular-nums">
            {offline ? "Offline" : healthy ? "Tersinkron" : `${pending} menunggu`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 rounded-full"
            onClick={runNow}
            disabled={busy}
            aria-label="Sinkronkan sekarang"
            title="Sinkronkan sekarang"
          >
            <RefreshCw className={`size-3 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        {!offline && pending > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Data sudah aman di perangkat ini dan akan naik otomatis.
          </p>
        )}
        {offline && (
          <p className="text-xs text-muted-foreground mt-1">
            Penjualan tetap bisa berjalan. Data terkirim saat koneksi kembali.
          </p>
        )}
        {status.remainingInvoiceNumbers === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Blok nomor nota habis — sambungkan internet agar nomor berikutnya bisa
            diterbitkan.
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
