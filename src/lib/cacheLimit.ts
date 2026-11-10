import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { clearCache, listCaches } from './cache';

/**
 * Cache size limit (Settings › Storage). When everything this device has cached for all Harnesses
 * goes over the limit, the whole cache is purged and rebuilt on demand from the Harness — keeping
 * the local database small so the app stays fast. Unsent drafts and offline-queued messages are
 * never purged. `0` = no limit.
 */
const KEY = 'dsh.cache-limit-mb';
export const CACHE_LIMIT_OPTIONS = [0, 100, 250, 500, 1024, 2048] as const;
export const DEFAULT_CACHE_LIMIT_MB = 500;

let cached: number | null = null;

export async function getCacheLimitMb(): Promise<number> {
  if (cached !== null) return cached;
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const n = raw === null || raw === undefined ? DEFAULT_CACHE_LIMIT_MB : Number(raw);
    cached = Number.isFinite(n) && n >= 0 ? n : DEFAULT_CACHE_LIMIT_MB;
  } catch { cached = DEFAULT_CACHE_LIMIT_MB; }
  return cached;
}

export async function setCacheLimitMb(mb: number) {
  cached = mb;
  try { if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, String(mb)); else await SecureStore.setItemAsync(KEY, String(mb)); } catch { /* best effort */ }
}

export function limitLabel(mb: number) {
  if (!mb) return 'No limit';
  return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`;
}

/** Pure decision, for tests: purge when a limit is set and the total is over it. */
export function overLimit(totalBytes: number, limitMb: number) {
  return limitMb > 0 && totalBytes > limitMb * 1024 * 1024;
}

let running: Promise<{ purged: boolean; freedBytes: number }> | null = null;
let lastCheck = 0;

/**
 * Check the total cache size against the limit and purge everything when it's over.
 * Throttled (at most once a minute unless `force`) and single-flight, so it can be called freely
 * (app start, after saving history, from Settings).
 */
export function enforceCacheLimit({ force = false, onPurged }: { force?: boolean; onPurged?: (freedBytes: number) => void } = {}) {
  if (running) return running;
  if (!force && Date.now() - lastCheck < 60_000) return Promise.resolve({ purged: false, freedBytes: 0 });
  lastCheck = Date.now();
  running = (async () => {
    const limit = await getCacheLimitMb();
    if (!limit) return { purged: false, freedBytes: 0 };
    const caches = await listCaches().catch(() => []);
    const total = caches.reduce((sum, c) => sum + c.bytes, 0);
    if (!overLimit(total, limit)) return { purged: false, freedBytes: 0 };
    for (const c of caches) await clearCache(c.url, { keepUnsent: true }).catch(() => {});
    onPurged?.(total);
    return { purged: true, freedBytes: total };
  })().finally(() => { running = null; });
  return running;
}

/** Test hook. */
export function _resetCacheLimit() { cached = null; running = null; lastCheck = 0; }
