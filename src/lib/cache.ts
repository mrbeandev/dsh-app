import * as SQLite from 'expo-sqlite';
import type { Frame, Session, WireEvent } from './protocol';
export type CachedHarness = { url: string; sessions: Session[]; workspaces: Frame[]; savedAt: number };
export type CachedHistory = { records: WireEvent[]; cursor: number; hasMore: boolean; savedAt: number };
let database: Promise<SQLite.SQLiteDatabase> | undefined;
const generations = new Map<string, number>();
export const cacheEpoch = (url: string) => generations.get(url) ?? 0;
async function db() {
  database ??= SQLite.openDatabaseAsync('dsh-cache.db').then(async d => {
    await d.execAsync(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS harness_cache(url TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history_cache(url TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(url,session_id)); PRAGMA user_version=1;`);
    return d;
  });
  return database;
}
export async function readCatalog(url: string): Promise<CachedHarness | null> { const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM harness_cache WHERE url=?', url); return row ? JSON.parse(row.data) : null; }
export async function writeCatalog(value: CachedHarness, epoch = cacheEpoch(value.url)) { if (epoch !== cacheEpoch(value.url)) return; const d = await db(); if (epoch !== cacheEpoch(value.url)) return; await d.runAsync('INSERT OR REPLACE INTO harness_cache(url,data) VALUES (?,?)', value.url, JSON.stringify(value)); }
export async function listCaches(): Promise<{ url: string; bytes: number }[]> { return (await db()).getAllAsync<{ url: string; bytes: number }>(`SELECT url,SUM(bytes) AS bytes FROM (SELECT url,length(CAST(data AS BLOB)) AS bytes FROM harness_cache UNION ALL SELECT url,length(CAST(data AS BLOB)) AS bytes FROM history_cache) GROUP BY url`); }
export async function readHistory(url: string, sessionId: string): Promise<CachedHistory | null> { const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM history_cache WHERE url=? AND session_id=?', url, sessionId); return row ? JSON.parse(row.data) : null; }
export async function writeHistory(url: string, sessionId: string, value: CachedHistory, epoch = cacheEpoch(url)) { if (epoch !== cacheEpoch(url)) return; const d = await db(); if (epoch !== cacheEpoch(url)) return; await d.runAsync('INSERT OR REPLACE INTO history_cache(url,session_id,data) VALUES (?,?,?)', url, sessionId, JSON.stringify(value)); }
export async function clearCache(url: string) {
  generations.set(url, cacheEpoch(url) + 1);
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => { await tx.runAsync('DELETE FROM history_cache WHERE url=?', url); await tx.runAsync('DELETE FROM harness_cache WHERE url=?', url); });
  await d.execAsync('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
}
export async function clearWorkspaceHistory(url: string, sessionIds: string[]) { const d = await db(); await d.withExclusiveTransactionAsync(async tx => { for (const id of sessionIds) await tx.runAsync('DELETE FROM history_cache WHERE url=? AND session_id=?', url, id); }); }
export function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
