import { useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { shouldOpenRecent } from '../lib/recentSession';

/** Horizontal-only home shortcut; native list scrolling stays simultaneous and vertical swipes fail. */
export function SwipeToRecent({ onOpen, enabled, children }: { onOpen: () => void; enabled: boolean; children: React.ReactNode }) {
  const [event] = useState(() => `dsh-open-recent-${Math.random().toString(36).slice(2)}`);
  useEffect(() => { const sub = DeviceEventEmitter.addListener(event, onOpen); return () => sub.remove(); }, [event, onOpen]);
  const pan = useMemo(() => Gesture.Pan().runOnJS(true).enabled(enabled).maxPointers(1)
    .activeOffsetX(-24).failOffsetX(16).failOffsetY([-18, 18])
    .onEnd(e => { if (shouldOpenRecent(e.translationX, e.translationY, e.velocityX)) DeviceEventEmitter.emit(event); }), [enabled, event]);
  const native = useMemo(() => Gesture.Native(), []);
  const simultaneous = useMemo(() => Gesture.Simultaneous(pan, native), [pan, native]);
  return <GestureDetector gesture={simultaneous}><View style={{ flex: 1 }} collapsable={false}>{children}</View></GestureDetector>;
}
