import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => new Map<string, string>());
const cache = vi.hoisted(() => ({ list: [] as { url: string; bytes: number }[], cleared: [] as [string, unknown][] }));
vi.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('./cache', () => ({ listCaches: async () => cache.list, clearCache: async (url: string, opts: unknown) => { cache.cleared.push([url, opts]); } }));
const { enforceCacheLimit, getCacheLimitMb, limitLabel, overLimit, setCacheLimitMb, DEFAULT_CACHE_LIMIT_MB, _resetCacheLimit } = await import('./cacheLimit');
const MB = 1024 * 1024;

describe('cache limit', () => {
  beforeEach(() => { store.clear(); cache.list = []; cache.cleared = []; _resetCacheLimit(); });
  it('defaults to 500 MB and remembers the chosen limit', async () => {
    expect(await getCacheLimitMb()).toBe(DEFAULT_CACHE_LIMIT_MB);
    await setCacheLimitMb(100); _resetCacheLimit();
    expect(await getCacheLimitMb()).toBe(100);
  });
  it('only purges when a limit is set and the total is over it', () => {
    expect(overLimit(600 * MB, 500)).toBe(true);
    expect(overLimit(500 * MB, 500)).toBe(false);
    expect(overLimit(9999 * MB, 0)).toBe(false);
  });
  it('purges every Harness cache at once but keeps unsent drafts and queued messages', async () => {
    await setCacheLimitMb(100);
    cache.list = [{ url: 'https://a', bytes: 80 * MB }, { url: 'https://b', bytes: 40 * MB }];
    let freed = 0;
    const r = await enforceCacheLimit({ force: true, onPurged: b => { freed = b; } });
    expect(r).toEqual({ purged: true, freedBytes: 120 * MB }); expect(freed).toBe(120 * MB);
    expect(cache.cleared).toEqual([['https://a', { keepUnsent: true }], ['https://b', { keepUnsent: true }]]);
  });
  it('does nothing under the limit or with No limit, and throttles automatic checks', async () => {
    await setCacheLimitMb(500); cache.list = [{ url: 'https://a', bytes: 10 * MB }];
    expect((await enforceCacheLimit({ force: true })).purged).toBe(false);
    await setCacheLimitMb(0); cache.list = [{ url: 'https://a', bytes: 5000 * MB }];
    expect((await enforceCacheLimit({ force: true })).purged).toBe(false);
    await setCacheLimitMb(100); _resetCacheLimit(); await setCacheLimitMb(100);
    await enforceCacheLimit(); // first automatic check runs
    cache.cleared = [];
    expect((await enforceCacheLimit()).purged).toBe(false); // within a minute: skipped
    expect(cache.cleared).toEqual([]);
  });
  it('labels limits for the settings row', () => {
    expect(limitLabel(0)).toBe('No limit'); expect(limitLabel(250)).toBe('250 MB'); expect(limitLabel(2048)).toBe('2 GB');
  });
});
