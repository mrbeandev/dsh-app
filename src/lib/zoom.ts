/**
 * Keep a zoomed image from being dragged past its own edges: at `scale`, content of size `viewport`
 * may move at most half of the overflow in each direction. Runs on the UI thread (worklet).
 */
export function clampOffset(offset: number, scale: number, viewport: number) {
  'worklet';
  const max = Math.max(0, (viewport * scale - viewport) / 2);
  return Math.min(max, Math.max(-max, offset));
}
