"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api-client";

/**
 * Reset state saat key (filter) berubah — pola resmi React "adjusting state when
 * props change" (https://react.dev/learn/you-might-not-need-an-effect): set state
 * saat render, tanpa efek samping beruntun.
 */
export function useResetOnKeyChange(key: string, reset: () => void) {
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    reset();
  }
}

/** Hook fetching data API dengan loading/error + refresh manual. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async () => {
    if (!pathRef.current) {
      setLoading(false);
      return;
    }
    // Simpan path saat request dibuat. Bila path berubah saat request masih
    // berjalan (filter/halaman/baris pencarian), respons basi diabaikan —
    // mencegah respons lama menimpa data query baru (race out-of-order).
    const currentPath = pathRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<T>(currentPath);
      if (pathRef.current !== currentPath) return;
      setData(result);
    } catch (err) {
      if (pathRef.current !== currentPath) return;
      const message = err instanceof ApiClientError ? err.message : "Terjadi kesalahan. Silakan coba lagi.";
      setError(message);
    } finally {
      if (pathRef.current === currentPath) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [path, load]);

  return { data, error, loading, refresh: load, setData };
}

/** Debounce nilai (untuk search input). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
