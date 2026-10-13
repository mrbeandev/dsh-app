import { useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

/**
 * Two-finger pinch detector built on raw touch events (no gesture library).
 * Attach the returned handlers to a View that wraps scrollable content: it only *observes*
 * touches (never claims the responder), so one-finger scrolling is untouched. Fires once per
 * gesture when the finger distance shrinks below `inRatio` (pinch in) or grows past `outRatio`.
 */
export function usePinch({ onPinchIn, onPinchOut, inRatio = 0.7, outRatio = 1.4 }: { onPinchIn?: () => void; onPinchOut?: () => void; inRatio?: number; outRatio?: number }) {
  const start = useRef<number | null>(null); const fired = useRef(false);
  const dist = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return null;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };
  return {
    onTouchStart: (e: GestureResponderEvent) => { const d = dist(e); if (d) { start.current = d; fired.current = false; } },
    onTouchMove: (e: GestureResponderEvent) => {
      const d = dist(e);
      if (d === null) return;
      if (start.current === null) { start.current = d; fired.current = false; return; }
      if (fired.current || start.current < 40) return;
      const r = d / start.current;
      if (r < inRatio && onPinchIn) { fired.current = true; onPinchIn(); }
      else if (r > outRatio && onPinchOut) { fired.current = true; onPinchOut(); }
    },
    onTouchEnd: (e: GestureResponderEvent) => { if (e.nativeEvent.touches.length < 2) start.current = null; },
    onTouchCancel: () => { start.current = null; },
  };
}
