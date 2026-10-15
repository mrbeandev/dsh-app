import { useEffect, useState } from 'react';
import { Animated, DeviceEventEmitter, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

/**
 * Interactive swipe-back: drag right anywhere on the screen and it follows the finger, revealing the
 * screen underneath (the route is presented as a transparent card). Release past ~35% of the width,
 * or with a quick flick, to finish and go back; otherwise it springs back.
 *
 * Horizontal only: it activates after 18 px to the right and fails on vertical movement, so the chat
 * still scrolls, and horizontally-scrolling content (code blocks) keeps working when swiped left.
 */
export function SwipeBack({ onBack, enabled = true, children }: { onBack: () => void; enabled?: boolean; children: React.ReactNode }) {
  // One stable controller per mount: holds the animated value, gesture state and latest onBack.
  const [c] = useState(() => {
    const width = Dimensions.get('window').width;
    const x = new Animated.Value(0);
    const state = { done: false, last: 0 };
    const eventName = `dsh-swipe-back-${Math.random().toString(36).slice(2)}`;
    const cancel = () => Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 18 }).start();
    const finish = (vx: number) => {
      state.done = true;
      const duration = Math.max(120, Math.min(260, (width - state.last) / Math.max(0.6, vx)));
      Animated.timing(x, { toValue: width, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => DeviceEventEmitter.emit(eventName));
    };
    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .activeOffsetX(18)
      .failOffsetX(-12)
      .failOffsetY([-14, 14])
      .onUpdate(e => { if (state.done) return; state.last = Math.max(0, e.translationX); x.setValue(state.last); })
      .onEnd(e => {
        if (state.done) return;
        const vx = e.velocityX / 1000; // px per ms
        if (e.translationX > width * 0.35 || (vx > 0.5 && e.translationX > 40)) finish(vx); else { state.last = 0; cancel(); }
      });
    const shade = x.interpolate({ inputRange: [0, width], outputRange: [0.28, 0], extrapolate: 'clamp' });
    const off = Gesture.Pan().enabled(false);
    return { x, state, pan, off, shade, eventName };
  });

  useEffect(() => { const sub = DeviceEventEmitter.addListener(c.eventName, onBack); return () => sub.remove(); }, [c, onBack]);

  return <View style={StyleSheet.absoluteFill}>
    {/* Dim the screen underneath; it brightens as the chat slides away. */}
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: c.shade }]} />
    <GestureDetector gesture={enabled ? c.pan : c.off}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: c.x }], shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 12 }]}>
        {children}
      </Animated.View>
    </GestureDetector>
  </View>;
}
