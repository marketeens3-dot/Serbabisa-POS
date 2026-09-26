/**
 * Komponen UI dasar.
 *
 * Ditulis tanpa pustaka UI karena Expo Go membatasi modul native: pustaka
 * componentUI yang berat biasanya menarik dependensi native di luar Expo SDK.
 * Komponen di sini hanya memakai React Native inti + SafeAreaContext, keduanya
 * sudah ada di Expo Go.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { C, radius, rupiah, space } from './theme';

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
  const isDisabled = disabled || loading;
  const bg =
    variant === 'primary'
      ? C.primary
      : variant === 'danger'
        ? C.danger
        : variant === 'secondary'
          ? C.surface
          : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : C.text;
  const pad = size === 'lg' ? 16 : size === 'sm' ? 8 : 12;

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
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: C.borderStrong,
          flexDirection: 'row',
          gap: 8,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 13 : 15 }}>
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
  return (
    <View style={{ gap: 6, width: '100%' }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.textFaint}
        style={[
          s.input,
          error ? { borderColor: C.danger, backgroundColor: C.dangerSoft } : null,
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
  return <View style={[s.card, style]}>{children}</View>;
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
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, textAlign: 'center' }}>
        {title}
      </Text>
      {hint ? (
        <Text
          style={{
            color: C.textMuted,
            fontSize: 13,
            textAlign: 'center',
            marginTop: 6,
            lineHeight: 19,
          }}
        >
          {hint}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space(4) }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  return (
    <View style={s.empty}>
      <ActivityIndicator color={C.primary} />
      <Text style={{ color: C.textMuted, marginTop: space(3), fontSize: 13 }}>{label}</Text>
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
  const map = {
    info: { bg: C.infoSoft, fg: C.info },
    warn: { bg: C.warnSoft, fg: C.warn },
    danger: { bg: C.dangerSoft, fg: C.danger },
    ok: { bg: C.okSoft, fg: C.ok },
  } as const;
  const t = map[tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg, borderColor: t.fg }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.fg, fontWeight: '800', fontSize: 13 }}>{title}</Text>
        {message ? (
          <Text style={{ color: C.text, fontSize: 12.5, lineHeight: 18 }}>{message}</Text>
        ) : null}
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
  const map = {
    neutral: { bg: C.surfaceAlt, fg: C.textMuted },
    ok: { bg: C.okSoft, fg: C.ok },
    warn: { bg: C.warnSoft, fg: C.warn },
    danger: { bg: C.dangerSoft, fg: C.danger },
    info: { bg: C.infoSoft, fg: C.info },
  } as const;
  const t = map[tone];
  return (
    <View style={[s.pill, { backgroundColor: t.bg }]}>
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
  const color = tone === 'danger' ? C.danger : tone === 'ok' ? C.ok : C.text;
  return (
    <View style={s.row}>
      <Text style={{ color: C.textMuted, fontSize: 13.5, flex: 1 }}>{label}</Text>
      <Text
        style={{
          color,
          fontSize: strong ? 16 : 13.5,
          fontWeight: strong ? '800' : '600',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function KeypadHint({ total, change }: { total: number; change: number }) {
  const good = change >= 0;
  return (
    <View style={{ gap: 4 }}>
      <Row label="Total" value={rupiah(total)} />
      <Row
        label="Kembalian"
        value={rupiah(change)}
        strong
        tone={good ? 'ok' : 'danger'}
      />
      {!good ? (
        <Text style={{ color: C.danger, fontSize: 12 }}>
          Uang pembayaran kurang dari total.
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    fontSize: 15,
    color: C.text,
    minHeight: 46,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: space(4),
    gap: space(3),
  },
  empty: {
    padding: space(10),
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: space(3),
  },
  pill: {
    paddingHorizontal: space(2),
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: 3,
  },
});
