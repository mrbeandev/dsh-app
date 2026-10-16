import { describe, expect, it } from 'vitest';
import { applyFileStat, mergeDirectory, refreshFileMetadata, type CachedDirectory } from './directoryCache';

const cached: CachedDirectory = { path: '.', truncated: false, savedAt: 1, entries: [
  { name: 'a.txt', type: 'file', size: 100, mtime: 1, version: 'old' },
  { name: 'removed', type: 'file', size: 20 },
] };
describe('cache-first folder metadata', () => {
  it('merges cached dates while fresh sizes including zero win, removes deleted rows', () => {
    const next = mergeDirectory({ path: '.', truncated: false, entries: [{ name: 'a.txt', type: 'file', size: 0 }] }, cached);
    expect(next.entries).toEqual([{ name: 'a.txt', type: 'file', size: 0, mtime: 1, version: 'old' }]);
  });
  it('does not carry file metadata to a replacement directory', () => {
    expect(mergeDirectory({ path: '.', truncated: false, entries: [{ name: 'a.txt', type: 'directory' }] }, cached).entries)
      .toEqual([{ name: 'a.txt', type: 'directory' }]);
  });
  it('updates sizes and timestamps from stat', () => {
    expect(applyFileStat(cached.entries[0], { absolutePath: '/a.txt', bytes: 0, version: '1:2:0:2000000000:3' }))
      .toMatchObject({ size: 0, mtime: 2000, version: '1:2:0:2000000000:3' });
  });
  it('refreshes more than 300 files with at most four requests in flight', async () => {
    let inFlight = 0, max = 0, calls = 0; const changes: string[] = [];
    const entries = Array.from({ length: 310 }, (_, i) => ({ name: `${i}`, type: 'file' as const, size: 1 }));
    await refreshFileMetadata(entries, async e => {
      calls++; max = Math.max(max, ++inFlight); await Promise.resolve(); inFlight--;
      return { absolutePath: e.name, bytes: 2, version: '1:2:2:2000000000:3' };
    }, e => changes.push(e.name), () => true);
    expect(calls).toBe(310); expect(max).toBeLessThanOrEqual(4); expect(changes).toHaveLength(310);
  });
  it('retains metadata on network errors, skips directories, emits only changes', async () => {
    const changed: string[] = [];
    const entry = applyFileStat(cached.entries[0], { absolutePath: 'a', bytes: 100, version: '1:2:100:2000000000:3' });
    let calls = 0;
    await refreshFileMetadata([entry, { name: 'bad', type: 'file', size: 42 }, { name: 'folder', type: 'directory' }], async e => {
      calls++; if (e.name === 'bad') throw new Error('offline');
      return { absolutePath: 'a', bytes: 100, version: entry.version! };
    }, e => changed.push(e.name), () => true);
    expect(calls).toBe(2); expect(changed).toEqual([]);
  });
  it('stops scheduling and publishing when the folder is no longer active', async () => {
    let active = true, calls = 0, changes = 0;
    await refreshFileMetadata(Array.from({ length: 20 }, (_, i) => ({ name: `${i}`, type: 'file' as const })), async () => {
      calls++; await Promise.resolve(); active = false; return { absolutePath: '/', bytes: 2, version: 'v' };
    }, () => changes++, () => active);
    expect(calls).toBeLessThanOrEqual(4); expect(changes).toBe(0);
  });
});
