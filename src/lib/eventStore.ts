import * as SQLite from 'expo-sqlite';
import type { WireEvent } from './protocol';
import { cacheEpoch } from './cacheEpoch';

/**
 * Per-event local store for chat history (phone's SQLite). Every event is kept in full, one row per
 * event, so the chat can read a light projection and fetch a single step's body on demand.
 * Coverage (`low`..`high`) records which contiguous seq range has been downloaded.
 */
let database: Promise<SQLite.SQLiteDatabase> | undefined;
function db() {
  database ??= SQLite.openDatabaseAsync('dsh-events.db').then(async d => {
    await d.execAsync(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS events(url TEXT NOT NULL, session_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, time INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(url, session_id, seq));
      CREATE TABLE IF NOT EXISTS coverage(url TEXT NOT NULL, session_id TEXT NOT NULL, low INTEGER NOT NULL, high INTEGER NOT NULL, complete INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(url, session_id));`);
    return d;
  });
  return database;
}

export type Coverage = { low: number; high: number; complete: boolean };

/** Save events (full bodies). Extends coverage; `complete` once the very first event is stored. */
export async function putEvents(url: string, sessionId: string, events: readonly WireEvent[], opts: { reachedStart?: boolean } = {}, epoch = cacheEpoch(url)) {
  if (!events.length && !opts.reachedStart) return;
  const d = await db();
  if (epoch !== cacheEpoch(url)) return;
  await d.withExclusiveTransactionAsync(async tx => {
    const stmt = await tx.prepareAsync('INSERT OR REPLACE INTO events(url, session_id, seq, type, time, data) VALUES (?,?,?,?,?,?)');
    try { for (const e of events) await stmt.executeAsync(url, sessionId, e.seq, e.type, e.time ?? 0, JSON.stringify(e.data ?? {})); }
    finally { await stmt.finalizeAsync(); }
    const cur = await tx.getFirstAsync<{ low: number; high: number; complete: number }>('SELECT low, high, complete FROM coverage WHERE url=? AND session_id=?', url, sessionId);
    const seqs = events.map(e => e.seq);
    const low = Math.min(cur?.low ?? Infinity, ...(seqs.length ? seqs : [Infinity]));
    const high = Math.max(cur?.high ?? -Infinity, ...(seqs.length ? seqs : [-Infinity]));
    const complete = cur?.complete || opts.reachedStart ? 1 : 0;
    if (Number.isFinite(low) && Number.isFinite(high)) await tx.runAsync('INSERT OR REPLACE INTO coverage(url, session_id, low, high, complete) VALUES (?,?,?,?,?)', url, sessionId, low, high, complete);
  });
}

export async function coverage(url: string, sessionId: string): Promise<Coverage | null> {
  const r = await (await db()).getFirstAsync<{ low: number; high: number; complete: number }>('SELECT low, high, complete FROM coverage WHERE url=? AND session_id=?', url, sessionId);
  return r ? { low: r.low, high: r.high, complete: !!r.complete } : null;
}

const row = (r: { seq: number; type: string; time: number; data: string }): WireEvent => ({ seq: r.seq, type: r.type, time: r.time, data: JSON.parse(r.data) });

/** Full events in [fromSeq, toSeq], ascending. */
export async function eventsBetween(url: string, sessionId: string, fromSeq: number, toSeq: number): Promise<WireEvent[]> {
  const rows = await (await db()).getAllAsync<{ seq: number; type: string; time: number; data: string }>('SELECT seq, type, time, data FROM events WHERE url=? AND session_id=? AND seq BETWEEN ? AND ? ORDER BY seq', url, sessionId, fromSeq, toSeq);
  return rows.map(row);
}

/** One full event, or null when not downloaded. */
export async function eventAt(url: string, sessionId: string, seq: number): Promise<WireEvent | null> {
  const r = await (await db()).getFirstAsync<{ seq: number; type: string; time: number; data: string }>('SELECT seq, type, time, data FROM events WHERE url=? AND session_id=? AND seq=?', url, sessionId, seq);
  return r ? row(r) : null;
}

/** The tool/result event answering a call (same session, after the call). */
export async function resultFor(url: string, sessionId: string, callSeq: number, callId: string): Promise<WireEvent | null> {
  const rows = await (await db()).getAllAsync<{ seq: number; type: string; time: number; data: string }>("SELECT seq, type, time, data FROM events WHERE url=? AND session_id=? AND seq > ? AND type='tool/result' ORDER BY seq LIMIT 200", url, sessionId, callSeq);
  for (const r of rows) { const e = row(r); const m: any = e.data?.message; if (String(m?.toolCallId ?? m?.source?.callId ?? '') === callId) return e; }
  return null;
}

/** Event count and bytes for a session (Thread Details). */
export async function storeStats(url: string, sessionId: string) {
  const r = await (await db()).getFirstAsync<{ n: number; bytes: number; first: number; last: number }>('SELECT COUNT(*) AS n, COALESCE(SUM(length(CAST(data AS BLOB))),0) AS bytes, MIN(seq) AS first, MAX(seq) AS last FROM events WHERE url=? AND session_id=?', url, sessionId);
  const types = await (await db()).getAllAsync<{ type: string; n: number }>('SELECT type, COUNT(*) AS n FROM events WHERE url=? AND session_id=? GROUP BY type', url, sessionId);
  return { count: r?.n ?? 0, bytes: r?.bytes ?? 0, first: r?.first ?? 0, last: r?.last ?? 0, types };
}

export async function storeBytes(): Promise<{ url: string; bytes: number }[]> {
  return (await db()).getAllAsync<{ url: string; bytes: number }>('SELECT url, SUM(length(CAST(data AS BLOB))) AS bytes FROM events GROUP BY url');
}

export async function clearEvents(url: string, sessionIds?: string[]) {
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => {
    if (!sessionIds) { await tx.runAsync('DELETE FROM events WHERE url=?', url); await tx.runAsync('DELETE FROM coverage WHERE url=?', url); return; }
    for (const id of sessionIds) { await tx.runAsync('DELETE FROM events WHERE url=? AND session_id=?', url, id); await tx.runAsync('DELETE FROM coverage WHERE url=? AND session_id=?', url, id); }
  });
}
