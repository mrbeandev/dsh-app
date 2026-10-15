import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({}));
vi.mock('@expo/vector-icons', () => ({}));
vi.mock('../state/app', () => ({}));
vi.mock('./ui', () => ({}));
const { syncAgo } = await import('./SyncStatus');

describe('syncAgo', () => {
  const now = 1_000_000_000;
  it('formats seconds, minutes, hours, days', () => {
    expect(syncAgo(0, now)).toBe('never');
    expect(syncAgo(now - 2_000, now)).toBe('just now');
    expect(syncAgo(now - 12_000, now)).toBe('12s ago');
    expect(syncAgo(now - 3 * 60_000, now)).toBe('3m ago');
    expect(syncAgo(now - 2 * 3_600_000, now)).toBe('2h ago');
    expect(syncAgo(now - 50 * 3_600_000, now)).toBe('2d ago');
  });
});
