/**
 * Layout akar aplikasi.
 *
 * Bertanggung jawab: boot database + recovery sesi sebelum layar apa pun
 * dirender. Tanpa ini, layar pertama akan memproses `booted === false` dan
 * berkedip atau bahkan crash.
 *
 *Di sini juga dipasang ThemeProvider, jadi seluruh layar (termasuk yang
 * belum sempat disentuh) sudah ikut memakai warna mode gelap.
 */
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator } from 'react-native';
import { useAppStore } from '../src/store';
import { ThemeProvider, useTheme } from '../src/ui/theme-provider';

function Shell() {
  const booted = useAppStore((s) => s.booted);
  const boot = useAppStore((s) => s.boot);
  const { theme } = useTheme();
  const { C, radius, space } = theme;

  useEffect(() => {
    // boot() cukup sekali untuk seluruh siklus hidup aplikasi.
    void boot();
  }, [boot]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {!booted ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space(4),
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: radius.xl,
              backgroundColor: C.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: C.primaryForeground, fontSize: 32, fontWeight: '900' }}>S</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 18, fontWeight: '800' }}>Serbabisa POS</Text>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.surface },
            headerTitleStyle: { color: C.text, fontWeight: '700' },
            headerTintColor: C.text,
            contentStyle: { backgroundColor: C.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="change-password" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
