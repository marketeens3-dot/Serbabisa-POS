/**
 * Layar ganti password.
 *
 * Wajib ada, bukan tambahan: server menandai akun baru dengan
 * `mustChangePassword`, dan selama flag itu belum turun, akun tersebut memakai
 * password sementara yang diketahui pemilik toko. Membiarkan kasir berjualan
 * tanpa memaksa penggantian berarti password yang bocor (mis. diketik di depan
 * pelanggan) tetap berlaku.
 *
 * Sesi di-cabut server setelah berhasil, jadi kasir harus masuk lagi — itu
 * yang membuat password lama benar-benar tidak berlaku.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../src/store';
import { api } from '../src/api/client';
import { Button, Card, Field, Banner } from '../src/ui/components';
import { C, radius, space } from '../src/ui/theme';

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const logout = useAppStore((s) => s.logout);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);

    if (next !== repeat) {
      setError('Ulangi password tidak sama dengan password baru.');
      return;
    }
    if (next === current) {
      setError('Password baru harus berbeda dari password lama.');
      return;
    }

    setBusy(true);
    const res = await api<{ success: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
      timeoutMs: 20_000,
    });
    setBusy(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    // Sesi sudah dicabut server. Keluar agar kasir masuk lagi dengan password
    // baru — kalau tidak, token lama masih bisa dipakai sampai kedaluwarsa.
    await logout();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + space(10), paddingBottom: insets.bottom + space(8) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={s.title}>Ganti password dulu</Text>
        <Text style={s.sub}>
          {user?.fullName ? `${user.fullName}, ` : ''}password ini masih yang
          diberikan pemilik toko. Buat password sendiri sebelum mulai berjualan.
        </Text>

        {error ? (
          <Banner tone="danger" title="Periksa kembali" message={error} />
        ) : null}

        <Card style={{ gap: space(4) }}>
          <Field
            label="Password sekarang"
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
            testID="cp-current"
          />
          <Field
            label="Password baru"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoComplete="new-password"
            placeholder="Minimal 8 karakter"
            hint="Gunakan kombinasi huruf, angka, dan tanda baca."
            testID="cp-new"
          />
          <Field
            label="Ulangi password baru"
            value={repeat}
            onChangeText={setRepeat}
            secureTextEntry
            autoComplete="new-password"
            placeholder="••••••••"
            testID="cp-repeat"
            onSubmitEditing={submit}
          />
          <Button
            label="Simpan & masuk ulang"
            onPress={submit}
            loading={busy}
            size="lg"
            testID="cp-submit"
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: space(5), gap: space(4) },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  sub: { fontSize: 13.5, color: C.textMuted, lineHeight: 20 },
});
