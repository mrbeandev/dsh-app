import React, { createContext, useEffect, useState, type RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useApp } from '../state/app';
import { material, opaqueSurface, surfaceColor, type SurfaceDepth } from '../lib/solidGlass';

// Keep the target API stable for existing screens. Solid Glass deliberately uses neutral, nearly
// solid panes rather than Liquid Glass refraction or expensive per-row backdrop filters.
const TargetContext = createContext<RefObject<View | null> | null>(null);
export function GlassTarget({ target, children, style }: { target: RefObject<View | null>; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View ref={target} style={[{ flex: 1 }, style]}>{children}</View>;
}
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
/** Solid Glass pane: flat neutral face, fine edge, top rim and contact shadow. */
export function Glass({ children, style, radius = material.radius, interactive = false, prominent = false, solidOnAndroid = false, depth }: {
  children?: React.ReactNode; style?: StyleProp<ViewStyle>; radius?: number; interactive?: boolean;
  prominent?: boolean; solidOnAndroid?: boolean; depth?: SurfaceDepth;
}) {
  const { colors } = useApp();
  const reduce = useReduceTransparency();
  const layer = depth ?? (prominent || solidOnAndroid ? 'popover' : interactive ? 'control' : 'card');
  return <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: reduce || layer === 'popover' || layer === 'card' ? opaqueSurface(colors, layer) : surfaceColor(colors, layer),
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge,
    boxShadow: layer === 'popover' ? `0 16px 36px -12px ${colors.shadow}` : layer === 'control' ? `0 1px 2px ${colors.shadow}` : `0 8px 24px -14px ${colors.shadow}`,
  }, style]}>
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.inner, borderTopColor: colors.rim }]} />
    {children}
  </View>;
}
