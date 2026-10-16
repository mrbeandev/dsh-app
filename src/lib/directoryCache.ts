import type { DirectoryListing, FileEntry, FileStat } from './workspaceFiles';
import { mtimeOf } from './workspaceFiles';

export type CachedFileEntry = FileEntry & { mtime?: number; version?: string };
export type CachedDirectory = Omit<DirectoryListing, 'entries'> & { entries: CachedFileEntry[]; savedAt: number };
/** Keep cached metadata only for the same entry kind; fresh list sizes always win, including zero. */
export function mergeDirectory(listing: DirectoryListing, cached: CachedDirectory | null): CachedDirectory {
  const old = new Map(cached?.entries.map(e => [e.name, e]) ?? []);
  return { ...listing, savedAt: Date.now(), entries: listing.entries.map(e => {
    const prior = old.get(e.name);
    return prior?.type === e.type ? { ...prior, ...e, size: e.size ?? prior.size } : { ...e };
  }) };
}
export function applyFileStat(entry: CachedFileEntry, stat: FileStat): CachedFileEntry {
  return { ...entry, size: stat.bytes ?? entry.size, mtime: mtimeOf(stat.version), version: stat.version };
}
export function sameMetadata(a: CachedFileEntry, b: CachedFileEntry) {
  return a.size === b.size && a.mtime === b.mtime && a.version === b.version;
}
/** Bounded async scan; never stat directories (the official file stat API only supports files).
 * Publish changed rows immediately. Stop scheduling work when the user navigates away.
 */
export async function refreshFileMetadata(entries: CachedFileEntry[], stat: (entry: CachedFileEntry) => Promise<FileStat>, changed: (entry: CachedFileEntry) => void, active: () => boolean) {
  const files = entries.filter(e => e.type === 'file'); let index = 0;
  const worker = async () => {
    while (active() && index < files.length) {
      const entry = files[index++];
      try { const next = applyFileStat(entry, await stat(entry)); if (active() && !sameMetadata(entry, next)) changed(next); }
      catch { /* retain cached size/time for unreadable files or transient network failures */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
}
