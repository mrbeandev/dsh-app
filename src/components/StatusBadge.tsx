import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useApp } from '../state/app';

export type BadgeKind = 'working' | 'input' | 'unseen' | 'none';

/**
 * Animated session status badge (animations run on the UI thread):
 * - working: green dot inside a spinning arc, so it reads as "still in progress";
 * - unseen (finished, not opened yet): blue dot with a ring radiating outward;
 * - input (needs attention): orange dot with a pulsing, radiating glow.
 * With the system "reduce motion" setting on, the badges are drawn still.
 */
export function StatusBadge({ kind, size = 12 }: { kind: BadgeKind; size?: number }) {
  if (kind === 'none') return <View style={{ width: size }} />;
  return <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {kind === 'working' ? <Spinner size={size} /> : <Radiate size={size} kind={kind} />}
  </View>;
}

function Spinner({ size }: { size: number }) {
  const { colors } = useApp(); const still = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    turn.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear, reduceMotion: ReduceMotion.Never }), -1, false);
    return () => cancelAnimation(turn);
  }, [still, turn]);
  const arc = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const dot = Math.round(size * 0.42);
  return <>
    <View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: colors.live, opacity: 0.18 }} />
    <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: 'transparent', borderTopColor: colors.live, borderRightColor: colors.live }, arc]} />
    <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: colors.live }} />
  </>;
}

function Radiate({ size, kind }: { size: number; kind: 'input' | 'unseen' }) {
  const { colors } = useApp(); const still = useReducedMotion();
  const color = kind === 'input' ? colors.warning : colors.link;
  const t = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    // Attention pulses faster than "finished", so it stands out more.
    t.value = withRepeat(withTiming(1, { duration: kind === 'input' ? 1200 : 2000, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.Never }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t, kind]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - t.value), transform: [{ scale: 0.5 + t.value * 0.9 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: kind === 'input' ? 0.35 + 0.35 * Math.sin(t.value * Math.PI) : 0.25 }));
  const dot = Math.round(size * 0.5);
  return <>
    {!still ? <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, ring]} /> : null}
    <Animated.View style={[{ position: 'absolute', width: dot + 4, height: dot + 4, borderRadius: (dot + 4) / 2, backgroundColor: color }, still ? { opacity: 0.3 } : glow]} />
    <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
  </>;
}
