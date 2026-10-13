import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

describe('relativeTime', () => {
  const now = new Date(2026, 9, 13, 15, 0, 0).getTime();
  it('formats recent times compactly', () => {
    expect(relativeTime(now - 20_000, now)).toBe('now');
    expect(relativeTime(now - 27 * 60_000, now)).toBe('27m');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h');
  });
  it('uses Yesterday for the previous calendar day', () => {
    expect(relativeTime(new Date(2026, 9, 12, 23, 0).getTime(), now)).toBe('Yesterday');
  });
  it('accepts ISO strings and ignores invalid input', () => {
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m');
    expect(relativeTime('not a date', now)).toBe('');
    expect(relativeTime(undefined, now)).toBe('');
  });
});
