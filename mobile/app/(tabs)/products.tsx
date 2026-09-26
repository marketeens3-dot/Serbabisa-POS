/**
 * Tab Produk — katalog lokal.
 *
 * Bridgeta untuk mencari dan memeriksa stok, bukan untuk mengedit. Editing
 * katalog tetap di aplikasi web/desktop: mengubah harga dan stok dari HP
 * saat sedang ada antrean offline berisiko menimpa perubahan kasir lain.
 * Yang bisa dibuat dari HP hanya PELANGGAN baru, karena tidak menyentuh stok.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../src/store';
import {
  listProducts,
  listCategories,
  effectiveStock,
  stockCount,
  type Product,
  type Category,
} from '../../src/db/repo';
import { Button, EmptyState, Pill } from '../../src/ui/components';
import { num, radius, rupiah, space } from '../../src/ui/theme';
import type { Theme } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/theme-provider';

type Tab = 'all' | 'PRODUCT' | 'SERVICE';

export default function ProductsScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const C = theme.C;
  const radius = theme.radius;
  const space = theme.space;
  const insets = useSafeAreaInsets();
  const tenantId = useAppStore((s) => s.user?.tenant?.id ?? '');

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stock, setStock] = useState<Map<string, number>>(new Map());
  const [counts, setCounts] = useState({ out: 0, low: 0 });

  const load = useCallback(async () => {
    if (!tenantId) return;
    const [list, cats, c] = await Promise.all([
      listProducts({ tenantId, search, categoryId, type: tab === 'all' ? null : tab, lowStockOnly: lowOnly, limit: 200 }),
      listCategories(tenantId),
      stockCount(tenantId),
    ]);
    setProducts(list);
    setCategories(cats);
    setStock(await effectiveStock(list));
    setCounts(c);
  }, [tenantId, search, categoryId, tab, lowOnly]);

  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 180 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const tabs = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'Semua' },
        { key: 'PRODUCT' as const, label: 'Produk' },
        { key: 'SERVICE' as const, label: 'Jasa' },
      ],
    [],
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Text style={s.title}>Produk &amp; Jasa</Text>
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {counts.out > 0 ? <Pill label={`${counts.out} habis`} tone="danger" /> : null}
          {counts.low > 0 ? <Pill label={`${counts.low} menipis`} tone="warn" /> : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: space(4), gap: space(3) }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama atau SKU"
          placeholderTextColor={C.textFaint}
          style={s.search}
          autoCapitalize="none"
        />
        <View style={{ flexDirection: 'row', gap: space(2) }}>
          {tabs.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[s.tab, tab === t.key && s.tabActive]}
            >
              <Text style={[s.tabText, tab === t.key && { color: C.onFill }]}>{t.label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setLowOnly((v) => !v)}
            style={[s.tab, lowOnly && { backgroundColor: C.warn, borderColor: C.warn }]}
          >
            <Text style={[s.tabText, lowOnly && { color: C.onFill }]}>Stok menipis</Text>
          </Pressable>
        </View>
        {categories.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            <Pressable
              onPress={() => setCategoryId(null)}
              style={[s.chip, categoryId === null && s.chipActive]}
            >
              <Text style={[s.chipText, categoryId === null && { color: C.onFill }]}>Semua kategori</Text>
            </Pressable>
            {categories.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
                style={[s.chip, categoryId === c.id && s.chipActive]}
              >
                <Text style={[s.chipText, categoryId === c.id && { color: C.onFill }]}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, marginTop: space(3) }}>
        {products.length === 0 ? (
          <EmptyState
            title="Tidak ada data"
            hint={
              search || lowOnly || categoryId
                ? 'Coba longgarkan filter pencarian.'
                : 'Belum ada produk. Tambahkan lewat aplikasi web.'
            }
          />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: space(4), gap: space(2) }}
            renderItem={({ item: p }) => {
              const qty = stock.get(p.id) ?? p.stockQty;
              const out = p.type === 'PRODUCT' && qty <= 0;
              const low = p.type === 'PRODUCT' && qty > 0 && qty <= p.minStockQty;
              return (
                <View style={s.item}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.itemName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={s.itemMeta}>
                      {p.sku ? `${p.sku} · ` : ''}
                      {p.categoryName ?? 'tanpa kategori'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={s.itemPrice}>{rupiah(p.sellingPrice)}</Text>
                    {p.type === 'PRODUCT' ? (
                      <Pill
                        label={out ? 'Habis' : `${num(qty)} ${p.unit}`}
                        tone={out ? 'danger' : low ? 'warn' : 'neutral'}
                      />
                    ) : (
                      <Pill label="Jasa" tone="info" />
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const makeStyles = ({ C, radius, space }: Theme) => StyleSheet.create({
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
  tab: {
    paddingHorizontal: space(3),
    paddingVertical: space(2),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabText: { fontSize: 12.5, fontWeight: '700', color: C.textMuted },
  chip: {
    paddingHorizontal: space(3),
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: C.textMuted },
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
  itemMeta: { fontSize: 11.5, color: C.textFaint },
  itemPrice: { fontSize: 14, fontWeight: '800', color: C.text },
});
