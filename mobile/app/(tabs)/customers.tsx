/**
 * Tab Pelanggan.
 *
 * Berbeda dari produk, pelanggan BOLEH ditambah dari HP: menambah pelanggan
 * tidak menyentuh stok atau harga, jadi aman meski ada antrean offline. Ini
 * karena kasir sering menerima pelanggan baru di kasir dan harus mencatatnya
 * seketika, bukan menunggu sampai ada wifi.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Modal,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store';
import { listCustomers, type Customer } from '../../src/db/repo';
import { enqueue } from '../../src/db';
import { api } from '../../src/api/client';
import { syncNow } from '../../src/sync';
import { Button, Card, EmptyState, Field, Banner } from '../../src/ui/components';
import { C, radius, space } from '../../src/ui/theme';

/** Normalisasi nomor telepon Indonesia ke format 62xxx — sama seperti server. */
function normalisasiTelepon(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, '');
  if (!digits) return null;
  let n = digits.replace(/^\+/, '');
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  if (!n.startsWith('62') && n.length > 0) n = `62${n}`;
  return n;
}

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const { user, refreshPending } = useAppStore();
  const tenantId = user?.tenant?.id ?? '';

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setItems(await listCustomers(tenantId, search, 100));
  }, [tenantId, search]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 180 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const save = useCallback(async () => {
    setError(null);
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Nama pelanggan minimal 2 karakter.');
      return;
    }
    const tel = phone.trim() ? normalisasiTelepon(phone) : null;
    if (phone.trim() && (!tel || tel.length < 9)) {
      setError('Nomor telepon tidak valid. Contoh: 0812-3456-7890');
      return;
    }

    setBusy(true);
    const body = { name: clean, phone: tel, address: null as string | null };
    const res = await api<{ customer: Customer }>('/api/customers', {
      method: 'POST',
      body,
      timeoutMs: 15_000,
    });

    if (res.ok) {
      await load();
    } else if (res.error.isOffline) {
      // Antre lokal. ID sementara dipakai sampai server memberi id asli.
      const tempId = `local_cust_${Date.now()}`;
      await enqueue('customer', { path: '/api/customers', method: 'POST', body }, tempId);
      await load();
    } else {
      setError(res.error.message);
    }
    setBusy(false);

    if (res.ok || res.error.isOffline) {
      setOpen(false);
      setName('');
      setPhone('');
      await refreshPending();
      void syncNow(tenantId).then(() => load());
    }
  }, [error, load, name, phone, refreshPending, tenantId]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Pelanggan</Text>
        <Button label="+ Tambah" size="sm" onPress={() => setOpen(true)} testID="add-customer" />
      </View>

      <View style={{ paddingHorizontal: space(4), paddingBottom: space(3) }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama atau nomor telepon"
          placeholderTextColor={C.textFaint}
          style={s.search}
          autoCapitalize="none"
        />
      </View>

      <View style={{ flex: 1 }}>
        {items.length === 0 ? (
          <EmptyState
            title={search ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan'}
            hint={search ? 'Coba kata kunci lain.' : 'Pelanggan bisa ditambahkan saat kasir menerima pesanan baru.'}
            action={!search ? <Button label="Tambah pelanggan" size="sm" onPress={() => setOpen(true)} /> : undefined}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: space(4), gap: space(2) }}
            renderItem={({ item: c }) => (
              <View style={s.item}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.phone ? <Text style={s.itemPhone}>{c.phone}</Text> : null}
                </View>
                {c.id.startsWith('local_') ? (
                  <Text style={s.pending}>Menunggu sinkron</Text>
                ) : null}
              </View>
            )}
          />
        )}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { paddingBottom: insets.bottom + space(4) }]}>
            <Text style={s.modalTitle}>Pelanggan Baru</Text>
            {error ? (
              <Banner tone="danger" title="Periksa kembali" message={error} />
            ) : null}
            <Field
              label="Nama"
              value={name}
              onChangeText={setName}
              placeholder="Nama pelanggan"
              testID="customer-name"
            />
            <Field
              label="Telepon (opsional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="0812-3456-7890"
              hint="Boleh dikosongkan. Disimpan otomatis ke 62xxx."
            />
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <Button
                label="Batal"
                variant="secondary"
                onPress={() => {
                  setOpen(false);
                  setError(null);
                }}
                style={{ flex: 1 }}
              />
              <Button label="Simpan" onPress={save} loading={busy} style={{ flex: 1 }} testID="customer-save" />
            </View>
          </View>
        </View>
      </Modal>
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
  search: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
    color: C.text,
  },
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
  itemName: { fontSize: 14, fontWeight: '700', color: C.text },
  itemPhone: { fontSize: 12, color: C.textMuted },
  pending: { fontSize: 11, color: C.warn, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space(5),
    gap: space(4),
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.text },
});
