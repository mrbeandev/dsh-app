import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useApp } from '../state/app';
import { T } from './ui';

/**
 * Download button that fills like liquid from left to right: a tinted body at the progress
 * width, a rolling wave crest on its leading edge, and a slow shimmer — all native-driver
 * transforms, so it stays smooth while bytes arrive. The label sits on top in both colours.
 */
export function LiquidProgress({ progress, label, height = 46 }: { progress: number; label: string; height?: number }) {
  const { colors } = useApp();
  const [width, setWidth] = useState(0);
  const [fill] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(0));
  useEffect(() => { Animated.timing(fill, { toValue: Math.max(0, Math.min(1, progress)), duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); }, [progress, fill]);
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then(reduce => { if (reduce) return; loop = Animated.loop(Animated.timing(wave, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })); loop.start(); });
    return () => loop?.stop();
  }, [wave]);
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  const crest = wave.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-3, 3, -3] });
  const shimmer = wave.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  const liquid = colors.primary;
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }} onLayout={e => setWidth(e.nativeEvent.layout.width)}
    style={{ height, borderRadius: 11, boxShadow: `inset 0 1px 0 ${colors.rim}`, overflow: 'hidden', backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge }}>
    <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fillWidth, overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: liquid, opacity: 0.85 }]} />
      {/* wave crest: two soft blobs bobbing on the leading edge */}
      <Animated.View style={{ position: 'absolute', right: -height * 0.35, top: -height * 0.15, width: height * 0.7, height: height * 1.3, borderRadius: height, backgroundColor: liquid, transform: [{ translateY: crest }] }} />
      <Animated.View style={{ position: 'absolute', right: -height * 0.55, top: height * 0.1, width: height * 0.6, height: height, borderRadius: height, backgroundColor: liquid, opacity: 0.6, transform: [{ translateY: Animated.multiply(crest, -1) }] }} />
      {/* surface shimmer */}
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: width * 0.35, backgroundColor: '#ffffff', opacity: 0.12, transform: [{ translateX: shimmer }, { skewX: '-20deg' }] }} />
    </Animated.View>
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <T style="footnote" weight="600" color={progress > 0.55 ? colors.primaryForeground : colors.text} styleOverride={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{label}</T>
    </View>
  </View>;
}
