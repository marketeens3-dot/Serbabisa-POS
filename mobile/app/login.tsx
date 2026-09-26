/**
 * Layar masuk.
 *
 * Dua hal yang tidak boleh dilewatkan:
 *  1. **Alamat server bisa diganti.** Aplikasi tidak meng-hardcode satu URL
 *     global — tiap toko bisa memakai server sendiri. Kalau kasir salah
 *     ketik/ketuk alamat, di sini bisa diperbaiki tanpa instal ulang.
 *  2. **Bedakan "salah password" dari "tidak ada internet".** Keduanya
 *     menampilkan pesan yang sangat berbeda supaya kasir tidak mengira
 *     passwordnya rusak padahal jaringan yang bermasalah.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../src/store';
import { pingServer, getServerUrl } from '../src/api/client';
import { syncNow } from '../src/sync';
import { Button, Card, Field, Banner, Pill } from '../src/ui/components';
import { C, radius, space } from '../src/ui/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login, setServer, serverUrl, user } = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [serverInput, setServerInput] = useState(serverUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ tone: 'danger' | 'warn'; text: string } | null>(null);
  const [ping, setPing] = useState<{ ok: boolean; ms?: number } | null>(null);
  const [checking, setChecking] = useState(false);

  // Kalau sesi sudah ada (mis. setelah boot), langsung ke POS.
  useEffect(() => {
    if (user) router.replace('/(tabs)');
  }, [user, router]);

  const runPing = async () => {
    setChecking(true);
    setPing(null);
    const started = Date.now();
    const res = await pingServer();
    setChecking(false);
    if (res.ok) setPing({ ok: true, ms: Date.now() - started });
    else {
      setPing({ ok: false });
      setError({
        tone: 'warn',
        text: res.error.isOffline
          ? 'Server tidak bisa dihubungi. Periksa alamat dan internet. Akun yang sudah pernah masuk di HP ini tetap bisa dipakai.'
          : res.error.message,
      });
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError({ tone: 'danger', text: 'Email dan password wajib diisi.' });
      return;
    }
    setBusy(true);
    const res = await login(email, password);
    setBusy(false);

    if (!res.ok) {
      setError({
        tone: /tidak ada koneksi|server tidak menjawab|Timeout/i.test(res.message ?? '')
          ? 'warn'
          : 'danger',
        text: res.message ?? 'Gagal masuk.',
      });
      return;
    }

    // Tarik data awal di latar. Kegagalan tidak menghalangi masuk: kasir
    // bisa tetap berjualan dengan data yang sudah ada di perangkat.
    const tenantId = useAppStore.getState().user?.tenant?.id;
    if (tenantId) void syncNow(tenantId, true);

    router.replace('/(tabs)');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          { paddingTop: insets.top + space(8), paddingBottom: insets.bottom + space(8) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.brand}>
          <View style={s.mark}>
            <Text style={s.markText}>S</Text>
          </View>
          <Text style={s.title}>Serbabisa POS</Text>
          <Text style={s.sub}>Kasir untuk UMKM Indonesia</Text>
        </View>

        {error ? <Banner tone={error.tone} title={error.tone === 'warn' ? 'Perhatian' : 'Gagal masuk'} message={error.text} /> : null}

        <Card style={{ gap: space(4) }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="nama@toko.com"
            testID="login-email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
            testID="login-password"
            onSubmitEditing={onSubmit}
          />
          <Button
            label="Masuk"
            onPress={onSubmit}
            loading={busy}
            size="lg"
            testID="login-submit"
          />
        </Card>

        {/* Alamat server: disembunyikan di balik toggle supaya tidak mengganggu
            kasir yang server-nya sudah benar, tapi tetap bisa diubah. */}
        <Pressable onPress={() => setShowServer((v) => !v)} style={s.serverToggle}>
          <Text style={s.serverToggleText}>
            {showServer ? 'Sembunyikan pengaturan server' : 'Server tidak bisa diakses? Atur di sini'}
          </Text>
        </Pressable>

        {showServer ? (
          <Card style={{ gap: space(3) }}>
            <Text style={s.cardTitle}>Alamat server</Text>
            <Field
              label="URL"
              value={serverInput}
              onChangeText={setServerInput}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://pos.tokoanda.com"
              hint="Tanpa garis miring di akhir. Contoh: https://pos.tokoanda.com"
            />
            <View style={s.row}>
              <Button
                label="Simpan"
                variant="secondary"
                size="sm"
                onPress={async () => {
                  await setServer(serverInput);
                  setServerInput(await getServerUrl());
                  setShowServer(false);
                  setError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button
                label={checking ? 'Memeriksa…' : 'Uji koneksi'}
                variant="secondary"
                size="sm"
                loading={checking}
                onPress={runPing}
                style={{ flex: 1 }}
              />
            </View>
            {ping ? (
              <View style={{ flexDirection: 'row', gap: space(2), alignItems: 'center' }}>
                {ping.ok ? (
                  <Pill label={`Server terhubung (${ping.ms} ms)`} tone="ok" />
                ) : (
                  <Pill label="Server tidak terjangkau" tone="danger" />
                )}
              </View>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { paddingHorizontal: space(5), gap: space(4) },
  brand: { alignItems: 'center', gap: space(2), marginBottom: space(2) },
  mark: {
    width: 60,
    height: 60,
    borderRadius: radius.xl,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  title: { color: C.text, fontSize: 22, fontWeight: '800', marginTop: space(2) },
  sub: { color: C.textMuted, fontSize: 13.5 },
  serverToggle: { alignItems: 'center', paddingVertical: space(2) },
  serverToggleText: { color: C.info, fontSize: 13, fontWeight: '600' },
  cardTitle: { color: C.text, fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', gap: space(2) },
});
