import { describe, expect, it, vi } from 'vitest';
import { recentSession, rememberSession, shouldOpenRecent } from './recentSession';
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('last viewed session on this device', () => {
  it('remembers independently for each Harness and normalises trailing slashes', async () => {
    await rememberSession('http://one/', 's1'); await rememberSession('http://two', 's2');
    expect(await recentSession('http://one')).toBe('s1');
    expect(await recentSession('http://two/')).toBe('s2');
    await rememberSession('http://one', 's3');
    expect(await recentSession('http://one')).toBe('s3');
    expect(await recentSession('http://unknown')).toBeNull();
    expect(store.size).toBe(1);
  });
  it('persists across module reload (app restart)', async () => {
    await rememberSession('http://restart', 's4'); vi.resetModules();
    const fresh = await import('./recentSession');
    expect(await fresh.recentSession('http://restart')).toBe('s4');
  });
  it('recognises left swipes without stealing right or vertical scrolling', () => {
    expect(shouldOpenRecent(-140, 5, -100)).toBe(true);
    expect(shouldOpenRecent(-60, 2, -800)).toBe(true);
    expect(shouldOpenRecent(140, 0, 800)).toBe(false);
    expect(shouldOpenRecent(-20, 0, -100)).toBe(false);
    expect(shouldOpenRecent(-140, 150, -800)).toBe(false);
  });
});
