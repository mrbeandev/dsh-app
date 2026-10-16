import { clearEvents, storeBytes } from './eventStore';
import * as SQLite from 'expo-sqlite';
import type { Frame, Session, WireEvent } from './protocol';
import type { CachedDirectory } from './directoryCache';
import { bumpCacheEpoch, cacheEpoch } from './cacheEpoch';
export type CachedHarness = { url: string; sessions: Session[]; workspaces: Frame[]; savedAt: number };
export type CachedHistory = { records: WireEvent[]; cursor: number; hasMore: boolean; savedAt: number };
let database: Promise<SQLite.SQLiteDatabase> | undefined;
export { cacheEpoch };
async function db() {
  database ??= SQLite.openDatabaseAsync('dsh-cache.db').then(async d => {
    await d.execAsync(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS harness_cache(url TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history_cache(url TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(url,session_id)); CREATE TABLE IF NOT EXISTS directory_cache(url TEXT NOT NULL, scope TEXT NOT NULL, path TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(url,scope,path)); PRAGMA user_version=2;`);
    return d;
  });
  return database;
}
export async function readCatalog(url: string): Promise<CachedHarness | null> { const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM harness_cache WHERE url=?', url); return row ? JSON.parse(row.data) : null; }
export async function writeCatalog(value: CachedHarness, epoch = cacheEpoch(value.url)) { if (epoch !== cacheEpoch(value.url)) return; const d = await db(); if (epoch !== cacheEpoch(value.url)) return; await d.runAsync('INSERT OR REPLACE INTO harness_cache(url,data) VALUES (?,?)', value.url, JSON.stringify(value)); }
export async function listCaches(): Promise<{ url: string; bytes: number }[]> { return mergeSizes(await listCachesBase(), await storeBytes().catch(() => [])); }
async function listCachesBase(): Promise<{ url: string; bytes: number }[]> { return (await db()).getAllAsync<{ url: string; bytes: number }>(`SELECT url,SUM(bytes) AS bytes FROM (SELECT url,length(CAST(data AS BLOB)) AS bytes FROM harness_cache UNION ALL SELECT url,length(CAST(data AS BLOB)) AS bytes FROM history_cache UNION ALL SELECT url,length(CAST(data AS BLOB)) AS bytes FROM directory_cache) GROUP BY url`); }
export async function readHistory(url: string, sessionId: string): Promise<CachedHistory | null> { const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM history_cache WHERE url=? AND session_id=?', url, sessionId); return row ? JSON.parse(row.data) : null; }
export async function writeHistory(url: string, sessionId: string, value: CachedHistory, epoch = cacheEpoch(url)) { if (epoch !== cacheEpoch(url)) return; const d = await db(); if (epoch !== cacheEpoch(url)) return; await d.runAsync('INSERT OR REPLACE INTO history_cache(url,session_id,data) VALUES (?,?,?)', url, sessionId, JSON.stringify(value)); }
export async function clearCache(url: string) {
  await clearEvents(url).catch(() => {});
  bumpCacheEpoch(url);
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => { await tx.runAsync('DELETE FROM history_cache WHERE url=?', url); await tx.runAsync('DELETE FROM harness_cache WHERE url=?', url); await tx.runAsync('DELETE FROM directory_cache WHERE url=?', url); });
  await d.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
}
export async function clearWorkspaceHistory(url: string, sessionIds: string[]) { await clearEvents(url, sessionIds).catch(() => {}); const d = await db(); await d.withExclusiveTransactionAsync(async tx => { for (const id of sessionIds) await tx.runAsync('DELETE FROM history_cache WHERE url=? AND session_id=?', url, id); }); }
export async function readDirectoryCache(url: string, scope: string, path: string): Promise<CachedDirectory | null> {
  const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM directory_cache WHERE url=? AND scope=? AND path=?', url, scope, path);
  return row ? JSON.parse(row.data) : null;
}
export async function writeDirectoryCache(url: string, scope: string, path: string, value: CachedDirectory, epoch = cacheEpoch(url)) {
  if (epoch !== cacheEpoch(url)) return;
  const d = await db(); if (epoch !== cacheEpoch(url)) return;
  await d.runAsync('INSERT OR REPLACE INTO directory_cache(url,scope,path,data) VALUES (?,?,?,?)', url, scope, path, JSON.stringify(value));
}
export function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

function mergeSizes(a: { url: string; bytes: number }[], b: { url: string; bytes: number }[]) { const m = new Map<string, number>(); for (const x of [...a, ...b]) m.set(x.url, (m.get(x.url) ?? 0) + (Number(x.bytes) || 0)); return [...m].map(([url, bytes]) => ({ url, bytes })); }
