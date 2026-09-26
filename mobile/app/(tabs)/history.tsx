/**
 * Tab Riwayat — daftar nota.
 *
 * Menampilkan transaksi yang SUDAH tersimpan di perangkat, termasuk yang
 * masih antre offline (ditandai jelas). Kasir harus selalu bisa membuktikan
 * bahwa sebuah penjualan terjadi,even ketika internet mati.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '../../src/store';
import { listTransactions, type CachedTransaction } from '../../src/db/repo';
import { EmptyState, Pill, Row } from '../../src/ui/components';
import { C, radius, rupiah, space, waktuID } from '../../src/ui/theme';

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const tenantId = useAppStore((s) => s.user?.tenant?.id ?? '');
  const sync = useAppStore((s) => s.sync);
  const [items, setItems] = useState<CachedTransaction[]>([]);
  const [selected, setSelected] = useState<CachedTransaction | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setItems(await listTransactions(tenantId, 100));
  }, [tenantId]);

  // Muat ulang setiap kali layar ini difokuskan, bukan hanya saat pertama
  // dibuka. Kasir yang kembali ke tab ini setelah menjual di tab Kasir harus
  // langsung melihat nota barunya — tanpa perlu menekan tombol apa pun.
  // `useFocusEffect` juga menghindari pola setState-di-dalam-effect yang
  // menyebabkan render berantai.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, sync.lastSyncAt]),
  );

  const totalHariIni = items
    .filter((t) => {
      const d = new Date(t.createdAt);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    })
    .reduce((sum, t) => sum + t.totalAmount, 0);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>Riwayat</Text>
          <Text style={s.sub}>Omzet hari ini {rupiah(totalHariIni)}</Text>
        </View>
        {sync.pending > 0 ? <Pill label={`${sync.pending} menunggu`} tone="warn" /> : null}
      </View>

      <View style={{ flex: 1 }}>
        {items.length === 0 ? (
          <EmptyState
            title="Belum ada transaksi"
            hint="Nota yang dibuat di tab Kasir akan muncul di sini."
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(t) => t.id}
            contentContainerStyle={{ padding: space(4), gap: space(2) }}
            renderItem={({ item: t }) => {
              const queued = t.status === 'QUEUED' || t.id.startsWith('local_');
              const voided = t.status === 'VOID';
              return (
                <Pressable style={s.item} onPress={() => setSelected(t)}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.itemNo} numberOfLines={1}>
                      {t.invoiceNumber}
                    </Text>
                    <Text style={s.itemTime}>{waktuID(t.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[s.itemTotal, voided && { textDecorationLine: 'line-through', color: C.textFaint }]}>
                      {rupiah(t.totalAmount)}
                    </Text>
                    {queued ? (
                      <Pill label="Menunggu sync" tone="warn" />
                    ) : voided ? (
                      <Pill label="Batal" tone="danger" />
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {selected ? (
        <>
          <Pressable style={s.backdrop} onPress={() => setSelected(null)} />
          <View style={[s.sheet, { paddingBottom: insets.bottom + space(4) }]}>
            <Text style={s.sheetTitle}>{selected.invoiceNumber}</Text>
            <Text style={s.sheetTime}>{waktuID(selected.createdAt)}</Text>
            <DetailBody tx={selected} />
            <Pressable style={s.sheetClose} onPress={() => setSelected(null)}>
              <Text style={{ color: C.text, fontWeight: '700' }}>Tutup</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Rincian nota — membaca dari JSON yang tersimpan saat checkout. */
function DetailBody({ tx }: { tx: CachedTransaction }) {
  let items: Array<{ name: string; qty: number; price: number }> = [];
  try {
    const parsed = JSON.parse(tx.json) as { items?: typeof items };
    items = parsed.items ?? [];
  } catch {
    items = [];
  }
  return (
    <View style={{ gap: space(2), marginTop: space(3) }}>
      {items.length === 0 ? (
        <Text style={s.noItems}>Rincian item tidak tersimpan di perangkat ini.</Text>
      ) : (
        items.map((it, i) => (
          <View key={`${it.name}-${i}`} style={s.lineRow}>
            <Text style={s.lineName} numberOfLines={1}>
              {it.qty} × {it.name}
            </Text>
            <Text style={s.lineTotal}>{rupiah(it.price * it.qty)}</Text>
          </View>
        ))
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: C.border, marginTop: space(2), paddingTop: space(2) }}>
        <Row label="Total" value={rupiah(tx.totalAmount)} strong />
        <Row label="Dibayar" value={rupiah(tx.paidAmount)} />
        {tx.paidAmount - tx.totalAmount > 0 ? (
          <Row label="Kembalian" value={rupiah(tx.paidAmount - tx.totalAmount)} tone="ok" />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  sub: { fontSize: 12.5, color: C.textMuted, marginTop: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: C.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: C.border,
    padding: space(3),
  },
  itemNo: { fontSize: 14, fontWeight: '800', color: C.text },
  itemTime: { fontSize: 11.5, color: C.textFaint },
  itemTotal: { fontSize: 14, fontWeight: '800', color: C.text },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space(5),
    gap: space(2),
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  sheetTime: { fontSize: 12, color: C.textMuted },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space(3) },
  lineName: { flex: 1, fontSize: 13, color: C.text },
  lineTotal: { fontSize: 13, fontWeight: '700', color: C.text },
  noItems: { fontSize: 12.5, color: C.textFaint, fontStyle: 'italic' },
  sheetClose: { marginTop: space(4), alignItems: 'center', paddingVertical: space(3) },
});
