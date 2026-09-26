/**
 * Layar Kasir (POS).
 *
 * Dirancang untuk satu tangan dan dipakai berjam-jam, jadi:
 *  - keranjang dan total selalu terlihat tanpa perlu menggulir
 *  - pencarian produk adalah fokus utama; pemindai barcode bekerja dengan
 *    mengetik/mengirim barcode lalu Enter
 *  - keypad pembayaran cepat untuk uang tunai receh (2000, 5000, 10rb, …)
 *
 * Semua data dibaca dari SQLite lokal, sehingga layar ini tetap berfungsi
 * penuh tanpa internet.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store';
import {
  listProducts,
  effectiveStock,
  findByBarcode,
  type Product,
} from '../../src/db/repo';
import { checkout, computeTotals, validateCheckout } from '../../src/checkout';
import { Button, Card, EmptyState, Field, Pill, Banner } from '../../src/ui/components';
import { C, num, radius, rupiah, space } from '../../src/ui/theme';

/** Uang receh yang paling sering dipakai kasir. */
const QUICK_CASH = [5000, 10000, 20000, 50000, 100000];

export default function POSScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, cart, addToCart, setQty, removeFromCart, clearCart, cartTotal, refreshPending } =
    useAppStore();

  const tenantId = user?.tenant?.id ?? '';
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<'CASH' | 'QRIS' | 'TRANSFER' | 'OTHER'>('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const list = await listProducts({ tenantId, search, limit: 100 });
    const stock = await effectiveStock(list);
    setProducts(list);
    setStockMap(stock);
    setLoading(false);
  }, [tenantId, search]);

  useEffect(() => {
    // Debounce ringan: tidak perlu reload DB tiap ketikan.
    const t = setTimeout(() => void load(), search ? 180 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const totals = useMemo(() => computeTotals(cart, Number(paid) || 0), [cart, paid]);
  const problem = validateCheckout(cart, Number(paid) || 0, method);

  const add = useCallback(
    (p: Product) => {
      if (p.type === 'PRODUCT') {
        const available = stockMap.get(p.id) ?? p.stockQty;
        const inCart = cart.find((l) => l.catalogItemId === p.id)?.qty ?? 0;
        if (available <= 0) {
          setError(`${p.name} stoknya habis.`);
          return;
        }
        if (inCart >= available) {
          setError(`Stok ${p.name} tinggal ${num(available)}. Kurangi dulu jumlah di keranjang.`);
          return;
        }
      }
      setError(null);
      addToCart({
        catalogItemId: p.id,
        name: p.name,
        unit: p.unit,
        price: p.sellingPrice,
        stockAtAdd: stockMap.get(p.id) ?? p.stockQty,
      });
    },
    [addToCart, cart, stockMap],
  );

  /** Pemindai barcode mengirim barcode + Enter; produk langsung masuk keranjang. */
  const onSubmitSearch = useCallback(async () => {
    const term = search.trim();
    if (!term) return;
    const found = await findByBarcode(tenantId, term);
    if (found) {
      add(found);
      setSearch('');
      setError(null);
    } else {
      // Bukan barcode → perlakukan sebagai pencarian biasa.
      void load();
    }
  }, [add, load, search, tenantId]);

  const onPay = useCallback(
    async (amount: number) => {
      const value = String(amount);
      // Ketuk 2000 lalu 5000 → 7000 (umpul), ketuk lagi → 15000. Praktis untuk
      // uang receh dan jauh lebih cepat daripada menghapus angka satu per satu.
      setPaid((cur) => {
        const curNum = Number(cur) || 0;
        if (cur === '' || cur === '0') return value;
        return String(curNum + amount);
      });
    },
    [],
  );

  const doCheckout = useCallback(async () => {
    if (!tenantId || busy) return;
    const problemNow = validateCheckout(cart, Number(paid) || 0, method);
    if (problemNow) {
      setError(problemNow);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    const key = `hp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await checkout({
      tenantId,
      lines: cart,
      idempotencyKey: key,
      paidAmount: Number(paid),
      paymentMethod: method,
      cashierName: user?.fullName ?? 'Kasir',
    });
    setBusy(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }

    clearCart();
    setPaid('');
    await refreshPending();
    await load();

    const total = totals.total;
    if (res.queued) {
      setNotice(
        `Tersimpan di perangkat (${rupiah(total)}). Nomor nota menyusul setelah online — kirim ulang otomatis.`,
      );
    } else {
      setNotice(`Nota ${res.invoiceNumber} • ${rupiah(total)}`);
    }
    // Beri kasir kesempatan membaca nomor nota sebelum layar berubah.
    Alert.alert(
      res.queued ? 'Tersimpan (offline)' : 'Transaksi berhasil',
      res.queued
        ? `${rupiah(total)}\n\nNomor nota diberikan setelah sinkronisasi.`
        : `${res.invoiceNumber}\n${rupiah(total)}\nKembalian ${rupiah(Math.max(0, (Number(paid) || 0) - total))}`,
      [{ text: 'Lanjut', onPress: () => setNotice(null) }],
    );
  }, [busy, cart, clearCart, load, method, paid, refreshPending, tenantId, totals.total, user]);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.store} numberOfLines={1}>
            {user?.tenant?.businessName ?? 'Serbabisa'}
          </Text>
          <Text style={s.cashier} numberOfLines={1}>
            {user?.fullName}
          </Text>
        </View>
        <Pill label={`${cart.length} item`} tone="info" />
      </View>

      {notice ? (
        <View style={{ paddingHorizontal: space(4), paddingBottom: space(2) }}>
          <Banner tone="ok" title="Tersimpan" message={notice} />
        </View>
      ) : null}
      {error ? (
        <View style={{ paddingHorizontal: space(4), paddingBottom: space(2) }}>
          <Banner tone="danger" title="Tidak bisa diproses" message={error} />
        </View>
      ) : null}

      <View style={s.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={onSubmitSearch}
          placeholder="Cari nama / SKU, atau pindai barcode lalu Enter"
          placeholderTextColor={C.textFaint}
          returnKeyType="search"
          style={s.search}
          autoCapitalize="none"
          testID="pos-search"
        />
      </View>

      <View style={{ flex: 1 }}>
        {loading && products.length === 0 ? (
          <EmptyState title="Memuat produk…" />
        ) : products.length === 0 ? (
          <EmptyState
            title={search ? 'Produk tidak ditemukan' : 'Belum ada produk'}
            hint={
              search
                ? 'Coba kata kunci lain, atau pindai barcode.'
                : 'Tambahkan produk dari tab Produk terlebih dahulu.'
            }
          />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            numColumns={2}
            contentContainerStyle={{ padding: space(3), gap: space(3) }}
            columnWrapperStyle={{ gap: space(3) }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: p }) => {
              const stock = stockMap.get(p.id) ?? p.stockQty;
              const out = p.type === 'PRODUCT' && stock <= 0;
              const low = p.type === 'PRODUCT' && stock > 0 && stock <= p.minStockQty;
              return (
                <Pressable
                  onPress={() => add(p)}
                  disabled={out}
                  style={[s.card, out && s.cardOut]}
                  testID={`product-${p.id}`}
                >
                  <Text style={s.cardName} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {p.sku ? <Text style={s.cardSku}>{p.sku}</Text> : null}
                  <Text style={s.cardPrice}>{rupiah(p.sellingPrice)}</Text>
                  {p.type === 'PRODUCT' ? (
                    <Pill
                      label={out ? 'Stok habis' : `Stok ${num(stock)}`}
                      tone={out ? 'danger' : low ? 'warn' : 'neutral'}
                    />
                  ) : (
                    <Pill label="Jasa" tone="info" />
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </View>

      {/* Panel keranjang + pembayaran. Tinggi tetap agar tidak menutupi daftar. */}
      <View style={s.bottom}>
        {cart.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space(2), paddingHorizontal: space(3) }}
            style={{ flexGrow: 0, maxHeight: 96 }}
          >
            {cart.map((l) => (
              <View key={l.catalogItemId} style={s.chip}>
                <View style={{ flex: 1 }}>
                  <Text style={s.chipName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={s.chipQty}>
                    {num(l.qty)} × {rupiah(l.price)}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Pressable onPress={() => setQty(l.catalogItemId, l.qty + 1)} hitSlop={6}>
                    <Text style={s.step}>＋</Text>
                  </Pressable>
                  <Pressable onPress={() => setQty(l.catalogItemId, l.qty - 1)} hitSlop={6}>
                    <Text style={s.step}>－</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={s.totalRow}>
          <View>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{rupiah(totals.total)}</Text>
          </View>
          {cart.length > 0 ? (
            <Pressable onPress={clearCart} hitSlop={8}>
              <Text style={s.clear}>Kosongkan</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space(2), paddingHorizontal: space(3) }}
        >
          {QUICK_CASH.map((q) => (
            <Pressable key={q} onPress={() => onPay(q)} style={s.quick}>
              <Text style={s.quickText}>{rupiah(q)}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => onPay(totals.total)}
            style={[s.quick, s.quickExact]}
          >
            <Text style={[s.quickText, { color: '#fff' }]}>Uang pas</Text>
          </Pressable>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: space(2), paddingHorizontal: space(3) }}>
          <TextInput
            value={paid}
            onChangeText={(t) => setPaid(t.replace(/[^0-9]/g, ''))}
            placeholder="Uang dibayar"
            placeholderTextColor={C.textFaint}
            keyboardType="number-pad"
            style={[s.paid, { flex: 1 }]}
            testID="pos-paid"
          />
          <Pressable
            onPress={() => setMethod((m) => (m === 'CASH' ? 'QRIS' : m === 'QRIS' ? 'TRANSFER' : m === 'TRANSFER' ? 'OTHER' : 'CASH'))}
            style={s.method}
          >
            <Text style={s.methodText}>{method}</Text>
          </Pressable>
        </View>

        {totals.change > 0 && method === 'CASH' ? (
          <Text style={s.change}>Kembalian {rupiah(totals.change)}</Text>
        ) : null}

        <View style={{ padding: space(3), paddingBottom: insets.bottom + space(2) }}>
          <Button
            label={busy ? 'Memproses…' : 'Bayar'}
            onPress={doCheckout}
            loading={busy}
            disabled={!cart.length || !!problem}
            size="lg"
            testID="pos-pay"
          />
          {problem && cart.length > 0 ? (
            <Text style={s.problem}>{problem}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  store: { fontSize: 16, fontWeight: '800', color: C.text },
  cashier: { fontSize: 12.5, color: C.textMuted },
  searchWrap: { padding: space(3), paddingBottom: 0 },
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
  card: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: space(3),
    gap: 6,
    minHeight: 108,
    justifyContent: 'space-between',
  },
  cardOut: { opacity: 0.5 },
  cardName: { fontSize: 13.5, fontWeight: '700', color: C.text },
  cardSku: { fontSize: 11, color: C.textFaint },
  cardPrice: { fontSize: 15, fontWeight: '800', color: C.primary },
  bottom: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: space(2),
    gap: space(2),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: C.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    minWidth: 170,
    maxWidth: 240,
  },
  chipName: { fontSize: 12.5, fontWeight: '700', color: C.text },
  chipQty: { fontSize: 11.5, color: C.textMuted },
  step: { fontSize: 18, color: C.primary, fontWeight: '800', textAlign: 'center' },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(4),
  },
  totalLabel: { fontSize: 12, color: C.textMuted, fontWeight: '600' },
  totalValue: { fontSize: 24, fontWeight: '900', color: C.text },
  clear: { color: C.danger, fontSize: 12.5, fontWeight: '700' },
  quick: {
    backgroundColor: C.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(2),
  },
  quickExact: { backgroundColor: C.primary },
  quickText: { fontSize: 12.5, fontWeight: '700', color: C.text },
  paid: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  method: {
    backgroundColor: C.infoSoft,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    justifyContent: 'center',
    minWidth: 104,
  },
  methodText: { color: C.info, fontWeight: '800', fontSize: 12.5, textAlign: 'center' },
  change: {
    textAlign: 'center',
    color: C.ok,
    fontWeight: '800',
    fontSize: 14,
  },
  problem: { textAlign: 'center', color: C.danger, fontSize: 12, marginTop: 6 },
});
