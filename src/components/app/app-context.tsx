"use client";

import { createContext, useContext } from "react";
import type { SessionUserDTO } from "@/lib/types";

export type AppCtx = {
  user: SessionUserDTO;
  setUser: (u: SessionUserDTO) => void;
  refreshUser: () => Promise<void>;
  navigate: (path: string) => void;
  logout: () => Promise<void>;
  /** Jumlah produk stok menipis (0 bila tidak ada / admin) — badge navigasi. */
  stockAlertCount: number;
  /** Ambil ulang hitungan stok menipis (dipanggil setelah mutasi stok). */
  refreshStockAlerts: () => void;
};

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp harus dipakai di dalam AppShell");
  return ctx;
}
