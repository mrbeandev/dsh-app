import * as SQLite from 'expo-sqlite';

/**
 * Unsent composer text per Harness + session. Kept until the message is actually sent or steered,
 * so leaving a chat (or closing the app) never loses what you typed.
 *
 * Reads are served from memory after the first load so reopening a chat shows the draft on the
 * very first frame; writes are debounced so typing doesn't hit SQLite on every keystroke.
 */
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  database ??= SQLite.openDatabaseAsync('dsh-drafts.db').then(async d => {
    await d.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS drafts(url TEXT NOT NULL, session_id TEXT NOT NULL, text TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(url, session_id)); CREATE TABLE IF NOT EXISTS draft_files(url TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(url, session_id));');
    return d;
  });
  return database;
}

const memory = new Map<string, string>();
let loaded: Promise<void> | undefined;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const key = (url: string, sessionId: string) => `${url}\u0000${sessionId}`;

/** Load every saved draft once (they're tiny), so later reads are synchronous. */
export function loadDrafts() {
  loaded ??= db().then(async d => {
    const rows = await d.getAllAsync<{ url: string; session_id: string; text: string }>('SELECT url, session_id, text FROM drafts');
    for (const r of rows) if (!memory.has(key(r.url, r.session_id))) memory.set(key(r.url, r.session_id), r.text);
  }).catch(() => {});
  return loaded;
}

export function peekDraft(url: string, sessionId: string): string {
  return memory.get(key(url, sessionId)) ?? '';
}

export async function readDraft(url: string, sessionId: string): Promise<string> {
  await loadDrafts();
  return peekDraft(url, sessionId);
}

async function persist(url: string, sessionId: string) {
  const text = memory.get(key(url, sessionId)) ?? '';
  const d = await db();
  if (text.trim()) await d.runAsync('INSERT OR REPLACE INTO drafts(url, session_id, text, updated_at) VALUES (?,?,?,?)', url, sessionId, text, Date.now());
  else await d.runAsync('DELETE FROM drafts WHERE url=? AND session_id=?', url, sessionId);
}

/** Remember the draft now (memory) and on disk shortly after typing pauses. */
export function saveDraft(url: string, sessionId: string, text: string, delay = 400) {
  const k = key(url, sessionId);
  if (text) memory.set(k, text); else memory.delete(k);
  clearTimeout(pending.get(k));
  pending.set(k, setTimeout(() => { pending.delete(k); void persist(url, sessionId).catch(() => {}); }, delay));
}

/** Write any debounced draft immediately (leaving the chat / app going to background). */
export async function flushDraft(url: string, sessionId: string) {
  const k = key(url, sessionId);
  const t = pending.get(k);
  if (!t) return;
  clearTimeout(t); pending.delete(k);
  await persist(url, sessionId).catch(() => {});
}

/** Called once a message was accepted by the Harness. */
export async function clearDraft(url: string, sessionId: string) {
  const k = key(url, sessionId);
  memory.delete(k); clearTimeout(pending.get(k)); pending.delete(k);
  await persist(url, sessionId).catch(() => {});
}

/** Cache clearing for a Harness also drops its drafts. */
export async function clearDraftsFor(url: string) {
  for (const k of [...memory.keys()]) if (k.startsWith(`${url}\u0000`)) memory.delete(k);
  for (const k of [...files.keys()]) if (k.startsWith(`${url}\u0000`)) files.delete(k);
  const d = await db();
  await d.runAsync('DELETE FROM drafts WHERE url=?', url).catch(() => {});
  await d.runAsync('DELETE FROM draft_files WHERE url=?', url).catch(() => {});
}

/**
 * Attachments picked for an unsent message, saved alongside the text. Only small metadata is stored
 * (file location, name, upload receipt); image bytes are re-read from the saved file when restored.
 */
export type SavedImport = { id: string; uri: string; name: string; mimeType?: string; size?: number; image: boolean; receiptId?: string; error?: string };
const files = new Map<string, SavedImport[]>();

export async function readDraftFiles(url: string, sessionId: string): Promise<SavedImport[]> {
  const k = key(url, sessionId);
  if (files.has(k)) return files.get(k)!;
  const row = await (await db()).getFirstAsync<{ data: string }>('SELECT data FROM draft_files WHERE url=? AND session_id=?', url, sessionId).catch(() => null);
  const list: SavedImport[] = row ? JSON.parse(row.data) : [];
  files.set(k, list);
  return list;
}

export async function saveDraftFiles(url: string, sessionId: string, list: SavedImport[]) {
  const k = key(url, sessionId);
  files.set(k, list);
  const d = await db();
  if (list.length) await d.runAsync('INSERT OR REPLACE INTO draft_files(url, session_id, data) VALUES (?,?,?)', url, sessionId, JSON.stringify(list));
  else await d.runAsync('DELETE FROM draft_files WHERE url=? AND session_id=?', url, sessionId);
}
