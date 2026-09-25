// Hook Sesi Kasir (shift): sesi aktif + total berjalan (live), aksi mulai/tutup,
// poll ringan 30 detik saat tab terlihat. Dipakai ShiftBanner di pos-view.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import type { CashSessionDTO, CashSessionSummaryDTO, CurrentCashSessionDTO } from "@/lib/types";

export type CloseShiftResult = {
  session: CashSessionDTO;
  summary: CashSessionSummaryDTO;
  byMethod: { method: string; count: number; total: number }[];
};

const POLL_INTERVAL_MS = 30_000;

export function useShift() {
  const [session, setSession] = useState<CashSessionDTO | null>(null);
  const [live, setLive] = useState<CashSessionSummaryDTO | null>(null);
  // Flag toko "wajib shift aktif" — dibawa respons /api/cash-sessions/current
  // agar POS tahu tanpa fetch settings tambahan (default false = perilaku lama).
  const [requireActiveShift, setRequireActiveShift] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const refetch = useCallback(async () => {
    try {
      const res = await api.get<CurrentCashSessionDTO>("/api/cash-sessions/current");
      loadedRef.current = true;
      setSession(res.session);
      setLive(res.live);
      setRequireActiveShift(res.requireActiveShift === true);
      setError(null);
    } catch {
      // Gagal pertama → tampilkan error; gagal polling berikutnya → pertahankan
      // data terakhir (jangan flash error untuk gangguan jaringan sesaat).
      if (!loadedRef.current) setError("Tidak dapat memuat status shift.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Poll ringan: hanya saat tab terlihat, agar beban server tetap rendah.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refetch]);

  /** Mulai shift — lempar ApiClientError (mis. 409 SESSION_ALREADY_OPEN) ke pemanggil. */
  const open = useCallback(async (openingCash: number) => {
    const res = await api.post<{ session: CashSessionDTO }>("/api/cash-sessions", { openingCash });
    setSession(res.session);
    setLive({
      transactionCount: 0,
      cashTotal: 0,
      nonCashTotal: 0,
      total: 0,
      expectedCash: res.session.openingCash,
    });
    return res.session;
  }, []);

  /** Tutup shift — saat sukses, state sesi langsung direset (banner kembali ke "belum dimulai"). */
  const close = useCallback(async (id: string, closingCash: number, notes?: string | null) => {
    const res = await api.post<CloseShiftResult>(`/api/cash-sessions/${id}/close`, {
      closingCash,
      notes: notes ?? null,
    });
    setSession(null);
    setLive(null);
    return res;
  }, []);

  return { session, live, loading, error, requireActiveShift, open, close, refetch };
}

export type ShiftApi = ReturnType<typeof useShift>;
