/**
 * Tab bar.
 *
 * Lima tab: Kasir, Produk, Pelanggan, Riwayat, Pengaturan. "Laporan" sengaja
 * TIDAK ada di sini — laporan butuh data lengkap dari server dan HP sering
 * dipakai offline; memuatnya sebagai tab tersendiri hanya menjebak kasir dengan
 * angka yang belum lengkap. Laporan tetap tersedia di Pengaturan → "Lihat di
 * browser".
 */
import React, { useMemo } from 'react';
import { Tabs } from 'expo-router';
import { Text, View, StyleSheet, Platform, type ColorValue } from 'react-native';
import { space } from '../../src/ui/theme';
import type { Theme } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/theme-provider';

// `color` bertipe ColorValue, bukan string: expo-router meneruskan warna tab
// yang bisa berupa token transparan. Menyempitkan ke string akan membuat
// typecheck gagal di setiap pemakaian tabBarIcon.
type IconProps = { color: ColorValue; focused: boolean; size: number };

/**
 * Ikon tab.
 *
 * Digambar dari View + Text, bukan icon pack: library icon عادة menarik
 * dependensi native (react-native-vector-icons) yang TIDAK ada di Expo Go,
 * sehingga aplikasi akan crash saat dibuka. Glyph teks selalu aman.
 */
function TabIcon({ glyph, ...rest }: IconProps & { glyph: string }) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const C = theme.C;
  const radius = theme.radius;
  const space = theme.space;
  return (
    <View style={s.iconWrap}>
      <Text
        style={{
          fontSize: Math.max(16, Math.min(20, rest.size * 0.95)),
          color: rest.color,
          opacity: rest.focused ? 1 : 0.6,
        }}
      >
        {glyph}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const C = theme.C;
  const radius = theme.radius;
  const space = theme.space;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textFaint,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.border,
          height: Platform.OS === 'ios' ? 84 : 62,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="pos"
        options={{
          title: 'Kasir',
          tabBarIcon: (p) => <TabIcon {...p} glyph="▤" />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produk',
          tabBarIcon: (p) => <TabIcon {...p} glyph="☰" />,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Pelanggan',
          tabBarIcon: (p) => <TabIcon {...p} glyph="☺" />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Riwayat',
          tabBarIcon: (p) => <TabIcon {...p} glyph="≡" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Pengaturan',
          tabBarIcon: (p) => <TabIcon {...p} glyph="⚙" />,
        }}
      />
    </Tabs>
  );
}

const makeStyles = ({ C, radius, space }: Theme) => StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', minHeight: 22, paddingTop: space(1) },
});
