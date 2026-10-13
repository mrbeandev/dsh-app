import React, { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useApp } from '../state/app';

/**
 * Control-layer material (Apple HIG › Materials).
 * - iOS 26+: native Liquid Glass via expo-glass-effect.
 * - Android 12+: real backdrop blur via expo-blur, sampling the nearest <GlassTarget>.
 * - Everywhere else, or with Reduce Transparency on: an opaque system-grouped surface.
 * Use only for floating controls (bars, composer, sheets) — never for content.
 */
const NATIVE_GLASS = Platform.OS === 'ios' && isGlassEffectAPIAvailable();
const ANDROID_LIVE_BLUR = false;
const TargetContext = createContext<RefObject<View | null> | null>(null);

/** Wrap the scrolling content that floating glass controls should blur on Android. */
export function GlassTarget({ target, children, style }: { target: RefObject<View | null>; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!ANDROID_LIVE_BLUR) return <View ref={target} style={[{ flex: 1 }, style]}>{children}</View>;
  return <TargetContext.Provider value={target}><BlurTargetView ref={target} style={[{ flex: 1 }, style]}>{children}</BlurTargetView></TargetContext.Provider>;
}
/** Expose a blur target to glass controls rendered outside the target's subtree. */
export const GlassTargetProvider = TargetContext.Provider;

function useReduceTransparency() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then(v => { if (active) setOn(v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setOn);
    return () => { active = false; sub?.remove(); };
  }, []);
  return on;
}

export function Glass({ children, style, radius = 22, interactive = false, prominent = false, solidOnAndroid = false }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean; prominent?: boolean; solidOnAndroid?: boolean }) {
  const { colors } = useApp();
  const target = useContext(TargetContext);
  const reduce = useReduceTransparency();
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };
  const edge: ViewStyle = { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge };
  const shadow: ViewStyle = Platform.OS === 'android' ? { elevation: 0 } : { boxShadow: colors.dark ? '0 6px 20px #00000059' : '0 6px 20px #0000001a' };

  // Without anything to blur (e.g. a sheet over a scrim) translucency only hurts legibility.
  if (reduce || (solidOnAndroid && Platform.OS !== 'ios')) return <View style={[shape, edge, { backgroundColor: colors.dark ? '#28282a' : '#f7f8fa' }, style]}>{children}</View>;

  if (NATIVE_GLASS) {
    return <View style={[{ borderRadius: radius }, shadow]}><GlassView glassEffectStyle="regular" isInteractive={interactive} colorScheme={colors.dark ? 'dark' : 'light'} style={[shape, style]}>{children}</GlassView></View>;
  }

  // Android live blur is disabled: expo-blur's target binding throws "Cannot set prop 'blurTargetId'"
  // when the activity is recreated or backgrounded (seen on device). The translucent glass tint below
  // reproduces the approved look without it. Re-enable by setting ANDROID_LIVE_BLUR once fixed upstream.
  const blur = ANDROID_LIVE_BLUR && Platform.OS === 'android' && target
    ? <BlurView pointerEvents="none" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={prominent ? 70 : 55} tint={colors.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
    : Platform.OS === 'web' ? <BlurView pointerEvents="none" intensity={60} tint={colors.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} /> : null;

  return <View style={[shape, edge, shadow, style]}>
    {blur}
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
    {children}
  </View>;
}
