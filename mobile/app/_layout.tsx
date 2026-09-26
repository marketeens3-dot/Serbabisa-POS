/**
 * Layout akar aplikasi.
 *
 * Bertanggung jawab: boot database + recovery sesi sebelum layar apa pun
 * dirender. Tanpa ini, layar pertama akan memproses `booted === false` dan
 * berkedip atau bahkan crash.
 */
import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppStore } from '../src/store';
import { C, radius, space } from '../src/ui/theme';

export default function RootLayout() {
  const booted = useAppStore((s) => s.booted);
  const boot = useAppStore((s) => s.boot);

  useEffect(() => {
    // boot() cukup sekali untuk seluruh siklus hidup aplikasi.
    void boot();
  }, [boot]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!booted ? (
        <View style={s.boot}>
          <View style={s.logoMark}>
            <Text style={s.logoText}>S</Text>
          </View>
          <Text style={s.bootTitle}>Serbabisa POS</Text>
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
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.bg,
    gap: space(4),
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  bootTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
});
