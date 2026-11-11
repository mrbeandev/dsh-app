import { useEffect } from 'react';
import { Image, Modal, Pressable, StatusBar, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { T } from './ui';
import { clampOffset } from '../lib/zoom';

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Full-screen image preview: pinch to zoom (up to 6×), drag to pan while zoomed, double-tap to zoom in
 * on that spot or back out, swipe down (when not zoomed) or tap ✕ to close. The file name and details
 * show only here, not on the thumbnail. Works on Android and iOS (gesture-handler + reanimated; the
 * Modal gets its own GestureHandlerRootView, which Android needs for gestures inside a Modal).
 */
export function ImageViewer({ uri, name, detail, visible, onClose, onRemove }: { uri: string; name?: string; detail?: string; visible: boolean; onClose: () => void; onRemove?: () => void }) {
  const { width, height } = useWindowDimensions(); const insets = useSafeAreaInsets();
  const scale = useSharedValue(1); const savedScale = useSharedValue(1);
  const x = useSharedValue(0); const y = useSharedValue(0); const savedX = useSharedValue(0); const savedY = useSharedValue(0);
  const dismissY = useSharedValue(0);
  const imgH = height - insets.top - insets.bottom - 120;

  // Every open starts un-zoomed.
  useEffect(() => {
    if (!visible) return;
    scale.set(1); savedScale.set(1); x.set(0); y.set(0); savedX.set(0); savedY.set(0); dismissY.set(0);
  }, [visible, scale, savedScale, x, y, savedX, savedY, dismissY]);

  const pinch = Gesture.Pinch()
    .onUpdate(e => { scale.set(Math.min(MAX_SCALE, Math.max(0.8, savedScale.get() * e.scale))); })
    .onEnd(() => {
      if (scale.get() <= 1.02) {
        scale.set(withTiming(1)); savedScale.set(1); x.set(withTiming(0)); y.set(withTiming(0)); savedX.set(0); savedY.set(0);
        return;
      }
      savedScale.set(scale.get());
      const cx = clampOffset(x.get(), scale.get(), width); const cy = clampOffset(y.get(), scale.get(), imgH);
      x.set(withTiming(cx)); y.set(withTiming(cy)); savedX.set(cx); savedY.set(cy);
    });

  const pan = Gesture.Pan().averageTouches(true)
    .onUpdate(e => {
      if (savedScale.get() > 1.02) {
        x.set(clampOffset(savedX.get() + e.translationX, scale.get(), width));
        y.set(clampOffset(savedY.get() + e.translationY, scale.get(), imgH));
      } else if (e.translationY > 0) dismissY.set(e.translationY); // not zoomed: drag down to close
    })
    .onEnd(e => {
      if (savedScale.get() > 1.02) { savedX.set(x.get()); savedY.set(y.get()); return; }
      if (dismissY.get() > 140 || e.velocityY > 1200) runOnJS(onClose)();
      else dismissY.set(withTiming(0));
    });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDuration(260)
    .onEnd(e => {
      if (savedScale.get() > 1.02) {
        scale.set(withTiming(1)); savedScale.set(1); x.set(withTiming(0)); y.set(withTiming(0)); savedX.set(0); savedY.set(0);
        return;
      }
      // Zoom towards the tapped point.
      const tx = clampOffset((width / 2 - e.x) * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, width);
      const ty = clampOffset((imgH / 2 - e.y) * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, imgH);
      scale.set(withTiming(DOUBLE_TAP_SCALE)); savedScale.set(DOUBLE_TAP_SCALE);
      x.set(withTiming(tx)); y.set(withTiming(ty)); savedX.set(tx); savedY.set(ty);
    });

  const gestures = Gesture.Simultaneous(pinch, pan, doubleTap);
  const imageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() + dismissY.get() }, { scale: scale.get() }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: 1 - Math.min(0.6, dismissY.get() / 500) }));

  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000f2' }, backdrop]} />
      <GestureDetector gesture={gestures}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} accessibilityHint="Pinch to zoom, drag to move, double-tap to zoom in or out, swipe down to close">
          {uri ? <Animated.View style={[{ width, height: imgH }, imageStyle]}>
            <Image source={{ uri }} resizeMode="contain" accessibilityLabel={name ? `Image ${name}` : 'Image'} style={{ width, height: imgH }} />
          </Animated.View> : null}
        </View>
      </GestureDetector>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          {name ? <T style="subhead" weight="600" numberOfLines={1} color="#ffffff">{name}</T> : null}
          {detail ? <T style="caption1" numberOfLines={1} color="#ffffffaa">{detail}</T> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff26' }}>
          <Ionicons name="close" size={22} color="#ffffff" />
        </Pressable>
      </View>
      {onRemove ? <View pointerEvents="box-none" style={{ position: 'absolute', bottom: insets.bottom + 20, left: 0, right: 0, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove attachment" onPress={() => { onRemove(); onClose(); }} style={({ pressed }) => ({ height: 42, paddingHorizontal: 18, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? '#ffffff40' : '#ffffff26' })}>
          <Ionicons name="trash-outline" size={17} color="#ffffff" /><T style="footnote" weight="600" color="#ffffff">Remove</T>
        </Pressable>
      </View> : null}
    </GestureHandlerRootView>
  </Modal>;
}
