/**
 * Gate awal: putuskan layar mana yang harus tampil.
 *
 * Tiga kondisi, berurutan dari yang paling menentukan:
 *   1. belum boot          → tunggu (belum tahu apa pun)
 *   2. belum login         → layar masuk
 *   3. wajib ganti password → layar ganti password (TIDAK bisa dilewati)
 *   4. sisanya              → tab POS
 *
 * Pemisahan ini penting untuk app offline: kasir yang HP-nya mati mendadak
 * harus bisa langsung masuk lagi tanpa kehilangan antrean yang belum naik.
 */
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAppStore } from '../src/store';

export default function Index() {
  const booted = useAppStore((s) => s.booted);
  const user = useAppStore((s) => s.user);
  const mustChangePassword = useAppStore((s) => s.mustChangePassword);
  // Delay sangat singkat supaya perpindahan layar tidak berkedip.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 30);
    return () => clearTimeout(t);
  }, []);

  if (!booted || !ready) return null;
  if (!user) return <Redirect href="/login" />;
  if (mustChangePassword) return <Redirect href="/change-password" />;
  return <Redirect href="/(tabs)" />;
}
