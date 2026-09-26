/**
 * Tab Pengaturan.
 *
 * Fokus: hal yang benar-benar dibutuhkan kasir di tempat —
 * status sinkronisasi, ganti server, keluar.
 *
 * Laporan sengaja tidak ada di sini. Laporan butuh data lengkap seluruh
 * periode; dari HP yang sering offline, angkanya bisa tampak komplet padahal
 * belum. Kasir yang butuh laporan membuka versi web — lebih jujur daripada
 * menampilkan angka yang belum tentu benar.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '../../src/store';
import { pingServer, getServerUrl } from '../../src/api/client';
import { syncNow, lastSyncAt } from '../../src/sync';
import { failedOutbox, failedOutboxCount, outboxCount, type OutboxItem } from '../../src/db';
import { Button, Card, Banner, Pill, Row } from '../../src/ui/components';
import { C, radius, rupiah, sejakID, space, waktuID } from '../../src/ui/theme';

/** Ringkas satu entri gagal menjadi kalimat yang bisa dipahami kasir. */
function jelaskan(item: OutboxItem): { judul: string; detail: string } {
  if (item.kind === 'transaction') {
    return {
      judul: 'Penjualan tidak terkirim',
      detail: 'Uang sudah diterima pelanggan, tapi nota belum tercatat di server.',
    };
  }
  return { judul: 'Data tidak terkirim', detail: 'Perubahan belum sampai ke server.' };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, sync, setSyncing, setSyncResult, refreshPending, logout, serverUrl, setServer } =
    useAppStore();

  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<OutboxItem[]>([]);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'danger'; text: string } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setPending(await outboxCount());
    setFailed(await failedOutbox());
    setLastAt(await lastSyncAt());
  }, []);

  // Muat ulang saat layar difokuskan. Status sinkronisasi dan daftar penjualan
  // gagal harus selalu yang terbaru saat kasir membuka Pengaturan untuk
  // memeriksa — bukan nilai yang dibekukan sejak aplikasi dibuka.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh, sync.lastSyncAt]),
  );

  const doSync = useCallback(async () => {
    const tenantId = user?.tenant?.id;
    if (!tenantId || sync.syncing) return;
    setSyncing(true);
    setMessage(null);
    const res = await syncNow(tenantId, true);
    setSyncing(false);
    setSyncResult({ at: res.at, error: res.error });
    await refresh();
    await refreshPending();

    if (res.error) {
      setMessage({ tone: res.offline ? 'warn' : 'danger', text: res.error });
    } else if (res.dropped > 0) {
      setMessage({
        tone: 'warn',
        text: `${res.dropped} antrean terlama dibuang karena device sudah penuh. Segera hubungkan internet.`,
      });
    } else {
      setMessage({ tone: 'ok', text: `Sinkron selesai: ${res.pushed} naik, ${res.pulled} turun.` });
    }
  }, [refresh, refreshPending, setSyncResult, setSyncing, sync.syncing, user?.tenant?.id]);

  const testConnection = useCallback(async () => {
    setChecking(true);
    setMessage(null);
    const res = await pingServer();
    setChecking(false);
    if (res.ok) {
      setMessage({ tone: 'ok', text: `Server ${await getServerUrl()} bisa dihubungi.` });
    } else {
      setMessage({ tone: 'warn', text: res.error.message });
    }
  }, []);

  return (
    <ScrollView
      style={[s.root, { paddingTop: insets.top }]}
      contentContainerStyle={{ padding: space(4), gap: space(4), paddingBottom: space(12) }}
    >
      <Text style={s.title}>Pengaturan</Text>

      {/* Status sinkronisasi — bagian paling penting di layar ini. */}
      <Card style={{ gap: space(3) }}>
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>Sinkronisasi</Text>
          {pending > 0 ? (
            <Pill label={`${pending} menunggu`} tone="warn" />
          ) : sync.lastError ? (
            <Pill label="Gagal" tone="danger" />
          ) : (
            <Pill label="Tersinkron" tone="ok" />
          )}
        </View>
        <Row label="Terakhir sinkron" value={sejakID(lastAt)} />
        <Row label="Server" value={serverUrl.replace(/^https?:\/\//, '')} />
        {sync.lastError ? <Row label="Kendala" value={sync.lastError} tone="danger" /> : null}
        {message ? <Banner tone={message.tone} title="Status" message={message.text} /> : null}
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Button
            label={sync.syncing ? 'Sinkron…' : 'Sinkron sekarang'}
            onPress={doSync}
            loading={sync.syncing}
            style={{ flex: 1 }}
            testID="sync-now"
          />
          <Button
            label={checking ? 'Uji…' : 'Uji server'}
            variant="secondary"
            onPress={testConnection}
            loading={checking}
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {/* Penjualan yang gagal naik. Bagian paling penting di layar ini setelah
          status sinkronisasi: ini berarti uang sudah diterima tapi belum
          tercatat — kasir WAJIB melihatnya, bukan sekadar baris angka. */}
      {failed.length > 0 ? (
        <Card style={{ gap: space(3), borderColor: C.danger, borderWidth: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[s.cardTitle, { color: C.danger }]}>Perlu tindakan</Text>
            <Pill label={`${failed.length} gagal`} tone="danger" />
          </View>
          <Text style={s.hint}>
            Data berikut tidak berhasil dikirim ke server. Untuk penjualan,
            uang pelanggan sudah diterima tetapi nota belum tercatat — catat
            manual di aplikasi web, atau perbaiki masalahnya lalu kirim ulang.
          </Text>
          {failed.map((f) => {
            const info = jelaskan(f);
            return (
              <View key={f.id} style={s.failItem}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.failTitle}>{info.judul}</Text>
                  <Text style={s.failTime}>{waktuID(f.createdAt)}</Text>
                  <Text style={s.failReason} numberOfLines={3}>
                    {f.lastError ?? 'Alasan tidak diketahui'}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={[s.hint, { fontSize: 11.5 }]}>
            Tekan &ldquo;Sinkron sekarang&rdquo; untuk mencoba lagi. Data tidak akan
            hilang selama aplikasi tidak dihapus.
          </Text>
        </Card>
      ) : null}

      <Card style={{ gap: space(2) }}>
        <Text style={s.cardTitle}>Akun</Text>
        <Row label="Nama" value={user?.fullName ?? '-'} />
        <Row label="Email" value={user?.email ?? '-'} />
        <Row label="Toko" value={user?.tenant?.businessName ?? '-'} />
        <Row label="Peran" value={user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Kasir'} />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={s.cardTitle}>Server</Text>
        <Text style={s.hint}>
          Alamat server tidak bisa diubah dari sini. Kasir yang salah ketik cukup
          menekan tombol di bawah — data di perangkat tidak akan hilang.
        </Text>
        <Button
          label="Ubah alamat server"
          variant="secondary"
          onPress={async () => {
            await logout();
          }}
          testID="change-server"
        />
      </Card>

      <Card style={{ gap: space(3) }}>
        <Text style={s.cardTitle}>Tentang</Text>
        <Text style={s.hint}>
          Aplikasi ini bekerja tanpa internet. Penjualan tetap tercatat di perangkat
          dan dikirim otomatis begitu ada koneksi.
        </Text>
        <Text style={s.version}>Serbabisa POS untuk HP · versi 1.0.0</Text>
      </Card>

      <Button
        label="Keluar"
        variant="danger"
        onPress={() =>
          Alert.alert(
            'Keluar dari akun?',
            pending > 0
              ? `Ada ${pending} transaksi yang belum terkirim. Menghapus data perangkat akan MENGHILANGKAN transaksi tersebut.`
              : 'Data lokal di perangkat ini akan dihapus.',
            [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Keluar',
                style: 'destructive',
                onPress: () => void logout(),
              },
            ],
          )
        }
        testID="logout"
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  cardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 12.5, color: C.textMuted, lineHeight: 19 },
  version: { fontSize: 12, color: C.textFaint },
  failItem: {
    flexDirection: 'row',
    backgroundColor: C.dangerSoft,
    borderRadius: radius.sm,
    padding: space(3),
  },
  failTitle: { fontSize: 13, fontWeight: '800', color: C.danger },
  failTime: { fontSize: 11, color: C.textMuted },
  failReason: { fontSize: 11.5, color: C.text, lineHeight: 16 },
});
