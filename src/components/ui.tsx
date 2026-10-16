import React from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { Glass } from './Glass';
import { Dots } from './Loader';
import { CopyButton } from './CopyButton';
import { paneFinish } from '../lib/solidGlass';

/**
 * Apple HIG iOS text styles (Large / default Dynamic Type size).
 * Sizes in points; React Native scales them with the system font-size setting.
 */
export const type = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400' },
} satisfies Record<string, TextStyle>;
export type TypeStyle = keyof typeof type;

/** HIG minimum hit target (44×44 pt). Visible controls can be slimmer; hitSlop fills the rest. */
export const HIT = 44;
export const slop = (visible: number) => { const v = Math.max(0, (HIT - visible) / 2); return { top: v, bottom: v, left: v, right: v }; };

export function Screen({ children, edges = ['top', 'bottom'] }: { children: React.ReactNode; edges?: ('top' | 'bottom')[] }) { const { colors } = useApp(); return <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>{children}</SafeAreaView>; }

export function T({ children, style = 'body', color, weight, numberOfLines, selectable, align, styleOverride }: { children: React.ReactNode; style?: TypeStyle; color?: 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | string; weight?: TextStyle['fontWeight']; numberOfLines?: number; selectable?: boolean; align?: TextStyle['textAlign']; styleOverride?: StyleProp<TextStyle> }) {
  const { colors } = useApp();
  const c = !color || color === 'primary' ? colors.text : color === 'secondary' ? colors.muted : color === 'tertiary' ? colors.tertiary : color === 'accent' ? colors.primary : color === 'danger' ? colors.danger : color;
  return <Text numberOfLines={numberOfLines} selectable={selectable} style={[type[style], { color: c, textAlign: align }, weight ? { fontWeight: weight } : null, styleOverride]}>{children}</Text>;
}

/** Backwards-compatible label: maps legacy pixel sizes onto the nearest HIG text style. */
export function Label({ children, muted = false, size = 15, weight }: { children: React.ReactNode; muted?: boolean; size?: number; weight?: '400' | '500' | '600' | '700' }) {
  const style: TypeStyle = size >= 20 ? 'title3' : size >= 17 ? 'body' : size >= 15 ? 'subhead' : size >= 13 ? 'footnote' : size >= 12 ? 'caption1' : 'caption2';
  return <T style={style} color={muted ? 'secondary' : 'primary'} weight={weight}>{children}</T>;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Bare toolbar glyph: no fill (HIG — toolbar items sit on the shared glass bar). */
export function IconButton({ icon, label, onPress, size = 22, tint, disabled }: { icon: IconName; label: string; onPress: () => void; size?: number; tint?: string; disabled?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={slop(36)} style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, opacity: disabled ? 0.35 : pressed ? 0.45 : 1 })}><Ionicons name={icon} size={size} color={tint ?? colors.text} /></Pressable>;
}

/** Floating glass capsule grouping one or more toolbar glyphs, like the iOS 26 navigation bar items. */
export function GlassCluster({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Glass radius={14} style={[{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 2 }, style]}>{children}</Glass>;
}

/**
 * Compact navigation bar. Controls float as glass capsules over a scroll-edge fade,
 * leaving the content layer untouched (HIG: Materials, Scroll views).
 */
export function Header({ title, subtitle, back = false, large = false, leading, logo, children }: { title: string; subtitle?: string; logo?: React.ReactNode; back?: boolean; compact?: boolean; large?: boolean; leading?: React.ReactNode; children?: React.ReactNode }) {
  // One slim glass bar holding back · title · actions (matches the approved prototype).
  return <View style={s.header}>
    <Glass radius={14} style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 2 }}>
      {back ? <IconButton icon="chevron-back" size={20} label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /> : leading ?? <View style={{ width: 10 }} />}
      <View style={{ flex: 1, paddingHorizontal: 4, paddingVertical: subtitle ? 4 : 0, justifyContent: 'center' }}>
        {logo ?? <T style={large ? 'title3' : 'subhead'} weight="600" numberOfLines={1}>{title}</T>}
        {subtitle ? <T style="caption2" color="secondary" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {children}
    </Glass>
  </View>;
}

/** Gradient that fades content as it scrolls under floating glass controls (HIG scroll edge effect). */
export function ScrollEdge({ edge = 'top', height = 28 }: { edge?: 'top' | 'bottom'; height?: number }) {
  const { colors } = useApp();
  const from = edge === 'top' ? 'to bottom' : 'to top';
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height, [edge]: 0, experimental_backgroundImage: `linear-gradient(${from}, ${colors.bg} 0%, ${colors.bg}00 100%)` } as ViewStyle} />;
}

/** HIG button: capsule, 44 pt (regular) or 50 pt (large), prominent style for the primary action. */
export function Button({ title, onPress, loading, disabled, secondary = false, destructive = false, icon }: { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; secondary?: boolean; destructive?: boolean; icon?: IconName }) {
  const { colors } = useApp();
  const fg = secondary ? (destructive ? colors.danger : colors.primary) : '#ffffff';
  // Prototype style: off-white pill with dark label for the primary action; quiet hairline pill otherwise.
  const primaryFg = colors.bg;
  const label = secondary ? fg : destructive ? '#ffffff' : primaryFg;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => ({ height: 46, paddingHorizontal: 20, borderRadius: 11, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: secondary ? colors.fill : destructive ? colors.danger : colors.text, borderWidth: secondary ? StyleSheet.hairlineWidth : 0, borderColor: colors.border, boxShadow: pressed ? `inset 0 1px 0 ${colors.rim}` : `inset 0 1px 0 ${colors.rim}, 0 4px 10px -6px ${colors.shadow}`, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 })}>{loading ? <Dots size="sm" color={label} /> : <>{icon && <Ionicons name={icon} size={18} color={label} />}<T style="footnote" weight="600" color={label} styleOverride={{ fontSize: 14 }}>{title}</T></>}</Pressable>;
}

/** Grouped inset text field with a footnote label above. */
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return <View style={{ gap: 6 }}><View style={{ paddingHorizontal: 14 }}><T style="caption1" color="secondary">{label.toUpperCase()}</T></View><TextInput accessibilityLabel={label} placeholderTextColor={colors.tertiary} {...props} style={[type.subhead, { fontSize: 14, borderRadius: 12, backgroundColor: colors.field, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.fieldEdge, boxShadow: `inset 0 1px 0 ${colors.rim}`, color: colors.text, paddingHorizontal: 14, height: 42 }, props.multiline && { height: undefined, minHeight: 88, paddingVertical: 11, textAlignVertical: 'top' }, props.style]} /></View>;
}

/** Search field: 36 pt capsule with a magnifying glass, matching the iOS search bar. */
export function SearchField({ value, onChangeText, placeholder, glass = false }: { value: string; onChangeText: (v: string) => void; placeholder: string; glass?: boolean }) {
  const { colors } = useApp();
  const inner = <><Ionicons name="search" size={16} color={colors.muted} /><TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} returnKeyType="search" clearButtonMode="while-editing" style={[type.body, { flex: 1, color: colors.text, paddingVertical: 0, height: 36 }]} />{value && Platform.OS !== 'ios' ? <IconButton icon="close-circle" size={17} tint={colors.tertiary} label="Clear search" onPress={() => onChangeText('')} /> : null}</>;
  return glass ? <Glass radius={11} depth="control" style={s.search}>{inner}</Glass> : <View style={[s.search, paneFinish(colors, 'control')]}>{inner}</View>;
}

/** iOS grouped-inset section: footnote caps header, rounded container, optional footer. */
export function Section({ header, footer, children }: { header?: string; footer?: string; children: React.ReactNode }) {
  const { colors } = useApp();
  return <View style={{ gap: 6 }}>
    {header ? <View style={{ paddingHorizontal: 14 }}><T style="caption1" color="secondary">{header.toUpperCase()}</T></View> : null}
    <Glass depth="panel" radius={14}>{React.Children.toArray(children).filter(Boolean).map((child, i) => <View key={i}>{i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 14 }} />}{child}</View>)}</Glass>
    {footer ? <View style={{ paddingHorizontal: 14 }}><T style="caption1" color="secondary">{footer}</T></View> : null}
  </View>;
}

/** 44 pt list row with optional leading icon, value, and disclosure chevron. */
export function Row({ title, subtitle, value, icon, iconTint, onPress, chevron = !!onPress, destructive, accessory, selected, copy }: { title: string; subtitle?: string; value?: string; icon?: IconName; iconTint?: string; onPress?: () => void; chevron?: boolean; destructive?: boolean; accessory?: React.ReactNode; selected?: boolean; /** Adds an inline copy button for this text. */ copy?: string }) {
  const { colors } = useApp();
  // Slim row: 44 pt minimum target, compact 14/12 pt text (matches the approved prototype density).
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={selected !== undefined ? { selected } : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: subtitle ? 7 : 10, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed || selected ? colors.state : 'transparent' })}>
    {icon ? <Ionicons name={icon} size={18} color={iconTint ?? (destructive ? colors.danger : colors.primary)} /> : null}
    <View style={{ flex: 1 }}><T style="footnote" weight="500" color={destructive ? 'danger' : 'primary'} numberOfLines={1} styleOverride={{ fontSize: 14 }}>{title}</T>{subtitle ? <T style="caption1" color="secondary" numberOfLines={2}>{subtitle}</T> : null}</View>
    {value ? <T style="caption1" color="secondary" numberOfLines={1}>{value}</T> : null}
    {accessory}
    {copy ? <CopyButton value={copy} label={`Copy ${title}`} /> : null}
    {selected ? <Ionicons name="checkmark" size={17} color={colors.primary} /> : null}
    {chevron ? <Ionicons name="chevron-forward" size={14} color={colors.tertiary} /> : null}
  </Pressable>;
}

export function ErrorNotice({ message }: { message: string }) { return message ? <View accessibilityRole="alert" style={{ paddingHorizontal: 16, paddingVertical: 8 }}><T style="footnote" color="danger">{message}</T></View> : null; }

export function Empty({ icon = 'chatbubble-outline', title, detail }: { icon?: IconName; title: string; detail: string }) {
  const { colors } = useApp();
  return <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 24, gap: 8 }}><Ionicons name={icon} size={40} color={colors.tertiary} /><T style="title3" align="center">{title}</T><View style={{ maxWidth: 300 }}><T style="subhead" color="secondary" align="center">{detail}</T></View></View>;
}

export const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 4, paddingBottom: 8, minHeight: 56 },
  body: { padding: 14, gap: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { height: 36, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
