import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
const { _resetSendMode, loadSendMode, sendActions, sendModeFrom, setSendMode } = await import('./sendPreference');

describe('send while working', () => {
  beforeEach(() => { store.clear(); _resetSendMode(); });
  it('defaults to queue (the Harness default) and remembers steer', async () => {
    expect(await loadSendMode()).toBe('queue');
    await setSendMode('steer'); _resetSendMode();
    expect(await loadSendMode()).toBe('steer');
  });
  it('tap uses the preferred mode, long-press the other', () => {
    expect(sendActions('queue')).toEqual({ tap: 'queue', longPress: 'steer' });
    expect(sendActions('steer')).toEqual({ tap: 'steer', longPress: 'queue' });
  });
  it('treats anything unknown as queue', () => { expect(sendModeFrom('x')).toBe('queue'); expect(sendModeFrom(null)).toBe('queue'); });
});
