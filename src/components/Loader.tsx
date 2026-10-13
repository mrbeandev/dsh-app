import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../state/app';

/** Shared looping driver (0→1). Reduce Motion: holds still at a mid value instead of animating. */
function useLoop(duration: number) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null; let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { v.setValue(0.5); return; }
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    }).catch(() => {});
    return () => { active = false; loop?.stop(); };
  }, [v, duration]);
  return v;
}

/**
 * Brand loader: three dots rising and brightening in a wave (the "agent is working" motif).
 * size: 'sm' inline (buttons, rows) · 'md' sections · 'lg' full-screen.
 */
export function Dots({ size = 'md', color, style }: { size?: 'sm' | 'md' | 'lg'; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp(); const t = useLoop(1100);
  const d = size === 'sm' ? 5 : size === 'lg' ? 9 : 7; const gap = d * 0.7; const lift = d * 0.9;
  const tint = color ?? colors.primary;
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={[{ flexDirection: 'row', alignItems: 'center', gap, height: d + lift * 2, justifyContent: 'center' }, style]}>
    {[0, 1, 2].map(i => {
      const s = i * 0.18; // phase offset per dot
      const input = [0, s, s + 0.2, s + 0.4, 1];
      const translateY = t.interpolate({ inputRange: input, outputRange: [0, 0, -lift, 0, 0] });
      const opacity = t.interpolate({ inputRange: input, outputRange: [0.35, 0.35, 1, 0.35, 0.35] });
      const scale = t.interpolate({ inputRange: input, outputRange: [0.85, 0.85, 1.1, 0.85, 0.85] });
      return <Animated.View key={i} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: tint, opacity, transform: [{ translateY }, { scale }] }} />;
    })}
  </View>;
}

/** Centered page/section loader with an optional label (e.g. "Loading chat…"). */
export function Loading({ label, fill = true, size = 'lg', style }: { label?: string; fill?: boolean; size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp();
  return <View accessibilityLiveRegion="polite" style={[{ alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 32 }, fill && { flex: 1 }, style]}>
    <Dots size={size} />
    {label ? <Text style={{ fontSize: 13, lineHeight: 18, color: colors.muted }}>{label}</Text> : null}
  </View>;
}

/** Shimmering placeholder block — skeleton for list rows and chat bubbles while data loads. */
export function Skeleton({ width = '100%', height = 12, radius = 6, style }: { width?: ViewStyle['width']; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useApp(); const t = useLoop(1400);
  const opacity = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 1, 0.45] });
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.fill, opacity }, style]} />;
}

/** Skeleton list matching the workspace tree / file list row shape. */
export function SkeletonRows({ rows = 6, indent = true }: { rows?: number; indent?: boolean }) {
  return <View accessibilityLabel="Loading" style={{ paddingHorizontal: 14, gap: 4, paddingTop: 8 }}>
    {Array.from({ length: rows }).map((_, i) => {
      const header = indent && i % 3 === 0;
      return <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 38, paddingLeft: header || !indent ? 0 : 28 }}>
        <Skeleton width={header ? 14 : 8} height={header ? 14 : 8} radius={header ? 4 : 4} />
        <Skeleton width={header ? '45%' : `${55 + ((i * 17) % 30)}%`} height={header ? 12 : 10} />
        <View style={{ flex: 1 }} />
        {!header ? <Skeleton width={24} height={8} /> : null}
      </View>;
    })}
  </View>;
}

/** Skeleton for a chat transcript: alternating user bubble / assistant paragraph. */
export function SkeletonChat() {
  return <View accessibilityLabel="Loading chat" style={{ gap: 18, paddingTop: 8 }}>
    {[0, 1, 2].map(i => <View key={i} style={{ gap: 7 }}>
      <View style={{ alignSelf: 'flex-end', width: '62%', padding: 12, borderRadius: 16, gap: 6 }}><Skeleton width="30%" height={8} /><Skeleton height={10} /><Skeleton width="70%" height={10} /></View>
      <View style={{ gap: 6 }}><Skeleton width="22%" height={8} /><Skeleton height={10} /><Skeleton height={10} /><Skeleton width="84%" height={10} /></View>
    </View>)}
  </View>;
}

export const loaderStyles = StyleSheet.create({ inline: { paddingVertical: 6 } });
