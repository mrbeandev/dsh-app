import * as SecureStore from 'expo-secure-store';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Remembers which Harness files have been downloaded to this phone, so reopening the file shows
 * "Downloaded · Open / Share" (and plays videos from the saved copy) instead of a fresh Download
 * button. Keyed by Harness + absolute path; a record is only trusted while the file's version
 * (size/mtime stamp from stat) is unchanged and the saved copy still exists.
 */
export type DownloadRecord = { version: string; bytes?: number; localUri: string; publicUri?: string; name: string; folderName?: string; savedAt: number };

const KEY = 'dsh.download-records';
const MAX = 200;
let cache: Record<string, DownloadRecord> | null = null;

const keyOf = (harness: string, absolutePath: string) => `${harness.replace(/\/+$/, '')}\u0000${absolutePath}`;

async function load(): Promise<Record<string, DownloadRecord>> {
  if (cache) return cache;
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch { cache = {}; }
  return cache!;
}
async function save() {
  if (!cache) return;
  // Keep the newest MAX records; SecureStore values should stay small.
  const entries = Object.entries(cache).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX);
  cache = Object.fromEntries(entries);
  const raw = JSON.stringify(cache);
  try { if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw); else await SecureStore.setItemAsync(KEY, raw); } catch { /* best effort */ }
}

function localExists(uri: string) {
  if (Platform.OS === 'web') return true;
  try { return new File(uri).exists; } catch { return false; }
}

/** The record for this file, or null when never downloaded, changed on the Harness, or the copy was deleted. */
export async function findDownload(harness: string, absolutePath: string, version: string | undefined): Promise<DownloadRecord | null> {
  const records = await load();
  const rec = records[keyOf(harness, absolutePath)];
  if (!rec) return null;
  if (version && rec.version && rec.version !== version) return null;
  if (!localExists(rec.localUri)) { delete records[keyOf(harness, absolutePath)]; await save(); return null; }
  return rec;
}

export async function recordDownload(harness: string, absolutePath: string, rec: Omit<DownloadRecord, 'savedAt'>) {
  const records = await load();
  records[keyOf(harness, absolutePath)] = { ...rec, savedAt: Date.now() };
  await save();
}

export async function forgetDownload(harness: string, absolutePath: string) {
  const records = await load();
  delete records[keyOf(harness, absolutePath)];
  await save();
}

/** Test hook. */
export function _resetDownloadRecords() { cache = null; }
