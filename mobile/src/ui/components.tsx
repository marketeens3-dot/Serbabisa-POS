/**
 * Komponen UI dasar.
 *
 * Ditulis tanpa pustaka UI karena Expo Go membatasi modul native: pustaka
 * component UI yang berat biasanya menarik dependensi native di luar Expo SDK.
 * Komponen di sini hanya memakai React Native inti + AsyncStorage, semuanya
 * sudah ada di Expo Go.
 *
 * Bahasa visualnya mengikuti aplikasi web (src/app/globals.css): primary biru,
 * radius 10px, kartu nyaris solid dengan border tipis, dan mode gelap yang
 * mengikuti token yang sama. Warna diambil lewat `useTheme()`, BUKAN konstanta,
 * sehingga seluruh komponen ikut berubah saat mode diganti.
 *
 * API setiap komponen sengaja TIDAK diubah supaya file layar yang sudah ada
 * tidak perlu disentuh hanya karena restyle.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { rupiah } from './theme';
import { useTheme } from './theme-provider';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  size = 'md',
  style,
  testID,
}: ButtonProps) {
  const { theme } = useTheme();
  const { C, radius } = theme;
  const isDisabled = disabled || loading;

  // Primary = biru solid. Secondary = permukaan + border (bukan outline tipis
  // seperti versi lama, supaya kontrasnya terbaca di layar HP).
  let bg: string = C.primary;
  let fg: string = C.primaryForeground;
  let borderColor = 'transparent';

  if (variant === 'danger') {
    bg = C.danger;
    // Bukan putih: `C.onFill` benar di kedua mode. Putih di atas merah
    // mode gelap hanya ~2,9:1, jadi teks tombol hapus jadi tak terbaca.
    fg = C.onFill;
  } else if (variant === 'secondary') {
    bg = C.card;
    fg = C.text;
    borderColor = C.borderStrong;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    fg = C.textMuted;
  }

  const pad = size === 'lg' ? 16 : size === 'sm' ? 8 : 12;
  // Target sentuh: shadcn web memakai h-9/h-10; di HP minimal 44px.
  const minHeight = size === 'lg' ? 52 : size === 'sm' ? 36 : 46;

  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          paddingVertical: pad,
          paddingHorizontal: pad + 6,
          borderRadius: radius.md,
          minHeight,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.5 : pressed ? 0.88 : 1,
          borderWidth: borderColor === 'transparent' ? 0 : 1,
          borderColor,
          flexDirection: 'row',
          gap: 8,
        },
        variant === 'primary' || variant === 'danger' ? { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 13 : 15, letterSpacing: 0.1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
};

export function Field({ label, hint, error, style, ...rest }: FieldProps) {
  const { theme } = useTheme();
  const { C, radius, space } = theme;
  return (
    <View style={{ gap: 6, width: '100%' }}>
      {label ? <Text style={{ color: C.textMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.textFaint}
        style={[
          {
            backgroundColor: C.card,
            borderWidth: 1,
            // Web memakai border 1px + ring subtle; di sini borderThickness
            // Native 1px sudah setara, dan warna input lebih tegas agar tidak
            // "menyatu" dengan latar (temuan QA waktu lalu).
            borderColor: error ? C.danger : C.input,
            borderRadius: radius.md,
            paddingHorizontal: space(3),
            paddingVertical: space(3),
            fontSize: 15,
            color: C.text,
            minHeight: 46,
          },
          error ? { backgroundColor: C.dangerSoft } : null,
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={{ color: C.danger, fontSize: 12 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ color: C.textFaint, fontSize: 12 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useTheme();
  const { C, radius, space } = theme;
  return (
    <View
      style={[
        {
          backgroundColor: C.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: C.border,
          padding: space(4),
          gap: space(3),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { C, space } = theme;
  return (
    <View style={{ padding: space(10), alignItems: 'center', justifyContent: 'center', gap: space(2) }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' }}>
        {title}
      </Text>
      {hint ? (
        <Text style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>
          {hint}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space(4) }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  const { theme } = useTheme();
  const { C, space } = theme;
  return (
    <View style={{ padding: space(10), alignItems: 'center', justifyContent: 'center', gap: space(2) }}>
      <ActivityIndicator color={C.primary} />
      <Text style={{ color: C.textMuted, marginTop: space(2), fontSize: 13 }}>{label}</Text>
    </View>
  );
}

export function Banner({
  tone = 'info',
  title,
  message,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const { C, radius, space } = theme;
  const t = theme.soft[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        backgroundColor: t.bg,
        borderRadius: radius.md,
        borderWidth: 1,
        // Border mengikuti tone, bukan teks — version web memakai border subtle
        // + aksen kiri tebal.
        borderColor: t.fg,
        borderLeftWidth: 4,
        padding: space(3),
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.fg, fontWeight: '800', fontSize: 13 }}>{title}</Text>
        {message ? <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 18 }}>{message}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info';
}) {
  const { theme } = useTheme();
  const { C, space } = theme;
  const t = theme.soft[tone];
  return (
    <View
      style={{
        paddingHorizontal: space(2),
        paddingVertical: 3,
        borderRadius: 999,
        alignSelf: 'flex-start',
        backgroundColor: t.bg,
      }}
    >
      <Text style={{ color: t.fg, fontSize: 11.5, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Baris ringkasan label–nilai, untuk layar nota & laporan. */
export function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'danger' | 'ok';
}) {
  const { theme } = useTheme();
  const { C } = theme;
  const color = tone === 'danger' ? C.danger : tone === 'ok' ? C.ok : C.text;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 3 }}>
      <Text style={{ color: C.textMuted, fontSize: 13.5, flex: 1 }}>{label}</Text>
      <Text
        style={{
          color,
          fontSize: strong ? 16 : 13.5,
          fontWeight: strong ? '800' : '600',
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function KeypadHint({ total, change }: { total: number; change: number }) {
  const { theme } = useTheme();
  const { C } = theme;
  const good = change >= 0;
  return (
    <View style={{ gap: 4 }}>
      <Row label="Total" value={rupiah(total)} />
      <Row label="Kembalian" value={rupiah(change)} strong tone={good ? 'ok' : 'danger'} />
      {!good ? <Text style={{ color: C.danger, fontSize: 12 }}>Uang pembayaran kurang dari total.</Text> : null}
    </View>
  );
}
