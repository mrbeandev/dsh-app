/** Per-Harness cache generation: bumped on Clear so in-flight writes from before are dropped. */
const generations = new Map<string, number>();
export const cacheEpoch = (url: string) => generations.get(url) ?? 0;
export const bumpCacheEpoch = (url: string) => { generations.set(url, cacheEpoch(url) + 1); };
