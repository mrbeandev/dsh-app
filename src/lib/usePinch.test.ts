import { expect, it, vi } from 'vitest';

vi.mock('react', () => ({ useRef: (v: unknown) => ({ current: v }) }));
const { usePinch } = await import('./usePinch');

const ev = (pts: [number, number][]) => ({ nativeEvent: { touches: pts.map(([x, y]) => ({ pageX: x, pageY: y })) } }) as any;

it('fires pinch-in once when two fingers close, and ignores one-finger scrolls', () => {
  const onPinchIn = vi.fn(); const onPinchOut = vi.fn();
  const h = usePinch({ onPinchIn, onPinchOut });
  h.onTouchMove(ev([[100, 500]])); // one finger: scrolling, nothing happens
  h.onTouchStart(ev([[100, 500], [500, 500]]));
  h.onTouchMove(ev([[200, 500], [400, 500]])); // 400 → 200 px = 0.5
  h.onTouchMove(ev([[250, 500], [350, 500]]));
  expect(onPinchIn).toHaveBeenCalledTimes(1);
  expect(onPinchOut).not.toHaveBeenCalled();
});
it('fires pinch-out when two fingers spread', () => {
  const onPinchOut = vi.fn();
  const h = usePinch({ onPinchOut });
  h.onTouchStart(ev([[300, 500], [400, 500]])); // 100 px
  h.onTouchMove(ev([[200, 500], [500, 500]])); // 300 px
  expect(onPinchOut).toHaveBeenCalledTimes(1);
});
