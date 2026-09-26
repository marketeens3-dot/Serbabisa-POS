/**
 * Provider tema: mode terang / gelap untuk aplikasi HP.
 *
 * Mengikuti aplikasi web: ada light & dark, dan pilihan pengguna disimpan di
 * perangkat (bukan global), jadi kasir tidak dipaksa memakai mode yang tidak
 * nyaman di ruangan terang.
 *
 * Prioritas: simpanan pengguna > preferensi sistem > terang.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTheme, type Theme } from './theme';

const STORAGE_KEY = 'serbabisa.themeMode';

export type ThemeMode = 'light' | 'dark';

type Ctx = {
  theme: Theme;
  mode: ThemeMode;
  /** Mode yang benar-benar dipakai tema (light | dark). */
  resolved: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode | null>(null);

  // Muat preferensi tersimpan. Default-nya mengikuti sistem, jadi aplikasi
  // sudah benar sejak frame pertama tanpa perlu "kilau" warna.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!alive) return;
        if (v === 'light' || v === 'dark') setModeState(v);
        else setModeState(system === 'dark' ? 'dark' : 'light');
      })
      .catch(() => {
        if (alive) setModeState('light');
      });
    return () => {
      alive = false;
    };
  }, [system]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    void AsyncStorage.setItem(STORAGE_KEY, m).catch(() => undefined);
  }, []);

  const resolved: ThemeMode = mode ?? (system === 'dark' ? 'dark' : 'light');

  const value = useMemo<Ctx>(
    () => ({
      theme: buildTheme(resolved),
      mode: resolved,
      resolved,
      setMode,
      toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark'),
    }),
    [resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Tema fallback untuk pemakaian di luar provider.
 *
 * Dibuat SEKALI di level modul, bukan di dalam `useTheme()`. Kalau dibangun
 * tiap pemanggilan, setiap render menghasilkan objek baru, sehingga
 * `useMemo(() => makeStyles(theme), [theme])` di setiap layar tidak pernah
 * kena cache — StyleSheet rebuilt terus-menerus tanpa alasan.
 */
const FALLBACK_THEME = buildTheme('light');
const FALLBACK_VALUE: Ctx = {
  theme: FALLBACK_THEME,
  mode: 'light',
  resolved: 'light',
  setMode: () => undefined,
  toggle: () => undefined,
};

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  // Di luar provider, tetap mengembalikan tema terang supaya komponen tidak
  // pernah crash hanya karena lupa dibungkus provider.
  return ctx ?? FALLBACK_VALUE;
}
