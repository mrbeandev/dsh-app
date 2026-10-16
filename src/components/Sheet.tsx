import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Dimensions, Easing, Modal, PanResponder, Pressable, View, type GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { IconButton, T } from './ui';
import { Glass } from './Glass';

/**
 * Bottom sheet following Apple HIG › Sheets:
 * grabber, swipe down to dismiss, tap the grabber or dimmed area to close,
 * a visible close button as the non-gesture alternative, Reduce Motion respected.
 * Parent owns `visible`; the sheet animates out, then calls onClose.
 */
export function Sheet({ visible, onClose, title, children, height = 0.72 }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; height?: number }) {
  if (!visible) return null;
  return <SheetBody onClose={onClose} title={title} height={height}>{children}</SheetBody>;
}

function SheetBody({ onClose, title, children, height }: { onClose: () => void; title: string; children: React.ReactNode; height: number }) {
  const { colors } = useApp(); const insets = useSafeAreaInsets();
  const [screen] = useState(() => Dimensions.get('window').height);
  const [y] = useState(() => new Animated.Value(screen));
  const onCloseRef = useRef(onClose);
  const reduce = useRef(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const [handlers, setHandlers] = useState<GestureResponderHandlers | null>(null);
  const [close, setClose] = useState<() => void>(() => () => onClose());

  useEffect(() => {
    const animate = (to: number, done?: () => void) => {
      if (reduce.current) { y.setValue(to); done?.(); return; }
      Animated.timing(y, { toValue: to, duration: to === 0 ? 300 : 220, easing: to === 0 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true }).start(() => done?.());
    };
    const settle = () => Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
    const dismiss = () => animate(screen, () => onCloseRef.current());
    const pan = PanResponder.create({
      // Capture phase so the drag wins over the grabber/close buttons once the finger moves down.
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      // Bubble phase: claims touches on empty header space; buttons still claim their own taps first.
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => { if (g.dy > 110 || g.vy > 0.9) dismiss(); else settle(); },
      onPanResponderTerminate: settle,
    });
    setHandlers(pan.panHandlers); setClose(() => dismiss);
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { reduce.current = v; }).catch(() => {}).finally(() => animate(0));
  }, [y, screen]);

  const dim = y.interpolate({ inputRange: [0, screen], outputRange: [1, 0], extrapolate: 'clamp' });
  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={close}>
    <Animated.View style={{ flex: 1, backgroundColor: '#00000066', opacity: dim }}><Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ flex: 1 }} /></Animated.View>
    <Animated.View accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${height * 100}%`, transform: [{ translateY: y }] }}>
      <Glass radius={18} depth="popover" prominent solidOnAndroid style={{ flex: 1, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, paddingBottom: insets.bottom }}>
        <View {...handlers}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss sheet" accessibilityHint="Swipe down or tap to close" onPress={close} style={{ height: 22, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: colors.tertiary }} /></Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, paddingBottom: 6, minHeight: 40 }}>
            <View style={{ flex: 1 }}><T style="headline">{title}</T></View>
            <IconButton icon="close" size={20} tint={colors.text} label="Close" onPress={close} />
          </View>
        </View>
        {children}
      </Glass>
    </Animated.View>
  </Modal>;
}
