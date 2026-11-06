/**
 * Shared building blocks.
 *
 * Deliberately few: a ground, a panel, four type roles, a chip and a button.
 * Hierarchy comes from surface lightness and hairlines rather than shadows,
 * which is how a real instrument panel reads.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, tabular, type, usePalette, type Palette } from '../theme';

// --- surfaces ---------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  refreshControl,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const padding = {
    paddingBottom: insets.bottom + space.section,
    paddingHorizontal: space.gap,
  };

  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: palette.ground }, padding, contentStyle]}>
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: palette.ground }]}
      contentContainerStyle={[padding, contentStyle]}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Panel({
  children,
  style,
  tone = 'base',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'base' | 'high';
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: tone === 'high' ? palette.panelHigh : palette.panel,
          borderRadius: radius.panel,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line,
          padding: space.gap,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const palette = usePalette();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: palette.line,
        marginLeft: inset,
      }}
    />
  );
}

export function Row({
  children,
  gap = space.base,
  align = 'center',
  justify = 'flex-start',
  style,
}: {
  children: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap }, style]}
    >
      {children}
    </View>
  );
}

// --- type -------------------------------------------------------------------

interface TextProps {
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Screen and section headings. Sentence case throughout — no all-caps eyebrows. */
export function Title({ children, color, style, numberOfLines }: TextProps) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: color ?? palette.text, fontSize: type.title, fontWeight: '600', letterSpacing: -0.3 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Heading({ children, color, style, numberOfLines }: TextProps) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: color ?? palette.text, fontSize: type.heading, fontWeight: '700', letterSpacing: -0.6 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, color, style, numberOfLines }: TextProps) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: color ?? palette.text, fontSize: type.body, lineHeight: type.body * 1.47 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Label({ children, color, style, numberOfLines }: TextProps) {
  const palette = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ color: color ?? palette.muted, fontSize: type.label, lineHeight: type.label * 1.4 }, style]}
    >
      {children}
    </Text>
  );
}

/**
 * A measured value. The number is the type event: large, tabular and tightly
 * tracked, with the unit set small beside it rather than running on.
 */
export function Reading({
  value,
  unit,
  size = type.reading,
  color,
  align = 'left',
}: {
  value: string;
  unit?: string;
  size?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
}) {
  const palette = usePalette();
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: justify, gap: space.tight }}>
      <Text
        style={[
          tabular,
          {
            color: color ?? palette.text,
            fontSize: size,
            fontWeight: '600',
            letterSpacing: size > 30 ? -1.4 : -0.5,
          },
        ]}
      >
        {value}
      </Text>
      {unit ? (
        <Text style={{ color: palette.muted, fontSize: Math.max(12, size * 0.34), fontWeight: '500' }}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

// --- controls ---------------------------------------------------------------

export function Button({
  label,
  onPress,
  tone = 'neutral',
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'neutral' | 'danger' | 'quiet';
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const inactive = disabled || busy;

  const background =
    tone === 'primary' ? palette.amber
      : tone === 'danger' ? palette.red
      : tone === 'quiet' ? 'transparent'
      : palette.panelHigh;

  const foreground =
    tone === 'primary' || tone === 'danger'
      ? (palette.isDark ? '#0A0E14' : '#FFFFFF')
      : tone === 'quiet' ? palette.muted
      : palette.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        {
          backgroundColor: background,
          borderRadius: radius.tile,
          paddingVertical: 14,
          paddingHorizontal: space.gap,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48,
          opacity: inactive ? 0.45 : pressed ? 0.8 : 1,
          borderWidth: tone === 'quiet' ? StyleSheet.hairlineWidth : 0,
          borderColor: palette.line,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={{ color: foreground, fontSize: type.body, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  color,
  background,
  style,
}: {
  label: string;
  color?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: background ?? palette.panelHigh,
          borderRadius: radius.chip,
          paddingVertical: 5,
          paddingHorizontal: 11,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ color: color ?? palette.muted, fontSize: type.micro, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

export function Tappable({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

/**
 * An empty screen is an invitation to act, so it always carries the action
 * that fills it rather than only explaining why it is empty.
 */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={{ paddingVertical: space.page, gap: space.base, alignItems: 'flex-start' }}>
      <Title>{title}</Title>
      <Body color={palette.muted} style={{ maxWidth: 440 }}>
        {body}
      </Body>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} tone="primary" style={{ marginTop: space.small, alignSelf: 'stretch' }} />
      ) : null}
    </View>
  );
}

/** A labelled value in a definition list. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.gap, paddingVertical: 7 }}>
      <Label style={{ flexShrink: 0 }}>{label}</Label>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          style={[tabular, { color: palette.text, fontSize: type.body, textAlign: 'right', flexShrink: 1 }]}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return <Title style={{ marginTop: space.wide, marginBottom: space.base }}>{children}</Title>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
