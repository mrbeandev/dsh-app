import { describe, expect, it } from 'vitest';
import { bumpAllSessionGenerations, bumpSessionGenerations, sessionGeneration } from './sessionReset';

describe('session cache reset generations', () => {
  it('bumps only the cleared sessions', () => {
    const a = sessionGeneration('a'), b = sessionGeneration('b');
    bumpSessionGenerations(['a']);
    expect(sessionGeneration('a')).toBe(a + 1);
    expect(sessionGeneration('b')).toBe(b);
    bumpSessionGenerations(['a', 'b']);
    expect(sessionGeneration('a')).toBe(a + 2);
    expect(sessionGeneration('b')).toBe(b + 1);
  });
  it('a whole-Harness clear bumps every session', () => {
    const a = sessionGeneration('x'), b = sessionGeneration('y');
    bumpAllSessionGenerations();
    expect(sessionGeneration('x')).toBe(a + 1);
    expect(sessionGeneration('y')).toBe(b + 1);
  });
});
