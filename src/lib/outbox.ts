import * as SQLite from 'expo-sqlite';
import type { PromptPart } from './imports';

/**
 * Offline outbox: messages you send while disconnected are stored on the phone and delivered to the
 * Harness one by one, in order, once the connection is back. Each entry keeps a fixed requestId so a
 * retry after a dropped response can't create a duplicate message.
 *
 * Text-only messages can be queued at any time. Attachments are queued as their prepared prompt parts
 * (already-uploaded file receipts, or encoded images), so nothing has to be re-picked later.
 */
export type OutboxItem = { id: string; url: string; sessionId: string; text: string; parts: PromptPart[]; mode: 'queue' | 'steer'; createdAt: number; attempts: number; error?: string };

let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  database ??= SQLite.openDatabaseAsync('dsh-outbox.db').then(async d => {
    await d.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY NOT NULL, url TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);');
    return d;
  });
  return database;
}

const listeners = new Set<() => void>();
export function onOutboxChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const changed = () => listeners.forEach(l => { try { l(); } catch { /* listener errors never break the queue */ } });

export async function listOutbox(url?: string, sessionId?: string): Promise<OutboxItem[]> {
  const d = await db();
  const rows = url && sessionId
    ? await d.getAllAsync<{ data: string }>('SELECT data FROM outbox WHERE url=? AND session_id=? ORDER BY created_at', url, sessionId)
    : url ? await d.getAllAsync<{ data: string }>('SELECT data FROM outbox WHERE url=? ORDER BY created_at', url)
    : await d.getAllAsync<{ data: string }>('SELECT data FROM outbox ORDER BY created_at');
  return rows.map(r => JSON.parse(r.data));
}

export async function enqueue(item: Omit<OutboxItem, 'createdAt' | 'attempts'>) {
  const full: OutboxItem = { ...item, createdAt: Date.now(), attempts: 0 };
  await (await db()).runAsync('INSERT OR REPLACE INTO outbox(id, url, session_id, data, created_at) VALUES (?,?,?,?,?)', full.id, full.url, full.sessionId, JSON.stringify(full), full.createdAt);
  changed();
  return full;
}

export async function updateOutbox(item: OutboxItem) {
  await (await db()).runAsync('UPDATE outbox SET data=? WHERE id=?', JSON.stringify(item), item.id);
  changed();
}

export async function removeOutbox(id: string) {
  await (await db()).runAsync('DELETE FROM outbox WHERE id=?', id);
  changed();
}

export async function clearOutboxFor(url: string) {
  await (await db()).runAsync('DELETE FROM outbox WHERE url=?', url).catch(() => {});
  changed();
}

/**
 * Deliver queued messages in order. Stops at the first transport failure (still offline / Harness
 * unreachable) so order is preserved; a message the Harness rejects outright is kept with its error
 * so the user can retry or delete it instead of it silently disappearing.
 */
export async function drainOutbox(url: string, send: (item: OutboxItem) => Promise<void>, isTransportError: (e: unknown) => boolean, errorText: (e: unknown) => string): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const item of await listOutbox(url)) {
    if (item.error) { failed++; continue; } // waits for the user (retry / delete)
    try {
      await send(item);
      await removeOutbox(item.id); sent++;
    } catch (e) {
      if (isTransportError(e)) break; // connection dropped again — keep the rest queued, in order
      await updateOutbox({ ...item, attempts: item.attempts + 1, error: errorText(e) }); failed++;
    }
  }
  return { sent, failed };
}
