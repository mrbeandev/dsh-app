import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

/** Pure decision used by the gesture (exported for tests). */
export function pinchOutcome(scale: number, inScale = 0.78, outScale = 1.3): 'in' | 'out' | null {
  return scale < inScale ? 'in' : scale > outScale ? 'out' : null;
}

/**
 * Real two-finger pinch for a scrollable list (react-native-gesture-handler).
 *
 * The pinch recognises as soon as a second finger lands and, while active, **blocks the list's own
 * scroll gesture** (`blocksExternalGesture` on the list's native gesture), so a vertical pinch no
 * longer just scrolls the chat. One-finger drags never activate a pinch, so normal scrolling is
 * unaffected. Fires once per gesture when scale crosses `inScale` (pinch in) or `outScale`.
 */
export function usePinch({ onPinchIn, onPinchOut, inScale = 0.78, outScale = 1.3 }: { onPinchIn?: () => void; onPinchOut?: () => void; inScale?: number; outScale?: number }) {
  // Gestures are rebuilt only when the callbacks change identity (stable useCallback in the caller).
  return useMemo(() => {
    const list = Gesture.Native(); // wraps the FlatList via GestureDetector
    const state = { fired: false };
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => { state.fired = false; })
      .onUpdate(e => {
        if (state.fired) return;
        const o = pinchOutcome(e.scale, inScale, outScale);
        if (o) { state.fired = true; (o === 'in' ? onPinchIn : onPinchOut)?.(); }
      })
      .blocksExternalGesture(list);
    return { pinch, list };
  }, [onPinchIn, onPinchOut, inScale, outScale]);
}
