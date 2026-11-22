import { useSyncExternalStore } from 'react';

/**
 * Per-session "cache was cleared" generation. Clearing a session's (or workspace's) cache bumps it;
 * an open chat watches its own generation, drops what it holds in memory and reloads live from the
 * Harness, and skips writing its old history back to the cache.
 */
const generations = new Map<string, number>();
const listeners = new Set<() => void>();
let all = 0; // bumped when the whole Harness cache is cleared

export const sessionGeneration = (sessionId: string) => (generations.get(sessionId) ?? 0) + all;
export function bumpSessionGenerations(sessionIds: string[]) {
  for (const id of sessionIds) generations.set(id, (generations.get(id) ?? 0) + 1);
  for (const l of listeners) l();
}
export function useSessionGeneration(sessionId: string) {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => sessionGeneration(sessionId));
}
/** Every open chat reloads (whole-Harness Clear Cache). */
export function bumpAllSessionGenerations() { all++; for (const l of listeners) l(); }
