import { expect, it, vi } from 'vitest';
vi.mock('react-native-gesture-handler', () => ({ Gesture: {} }));

const { pinchOutcome } = await import('./usePinch');

it('pinch-in when fingers close past the threshold', () => { expect(pinchOutcome(0.6)).toBe('in'); });
it('pinch-out when fingers spread past the threshold', () => { expect(pinchOutcome(1.5)).toBe('out'); });
it('small finger movement does nothing', () => { expect(pinchOutcome(0.95)).toBeNull(); expect(pinchOutcome(1.1)).toBeNull(); });
