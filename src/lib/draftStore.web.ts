/** Browser counterpart of draftStore: same API, backed by localStorage. */
const PREFIX = 'dsh.draft.';
const key = (url: string, sessionId: string) => `${PREFIX}${url}\u0000${sessionId}`;
const get = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const set = (k: string, v: string) => { try { if (v.trim()) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* storage unavailable */ } };

export function loadDrafts() { return Promise.resolve(); }
export function peekDraft(url: string, sessionId: string) { return get(key(url, sessionId)); }
export async function readDraft(url: string, sessionId: string) { return peekDraft(url, sessionId); }
export function saveDraft(url: string, sessionId: string, text: string) { set(key(url, sessionId), text); }
export async function flushDraft() { /* writes are synchronous */ }
export async function clearDraft(url: string, sessionId: string) { set(key(url, sessionId), ''); }
export async function clearDraftsFor(url: string) {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(`${PREFIX}${url}\u0000`) || k.startsWith(`${FILES}${url}\u0000`)) localStorage.removeItem(k); } catch { /* storage unavailable */ }
}

export type SavedImport = { id: string; uri: string; name: string; mimeType?: string; size?: number; image: boolean; receiptId?: string; error?: string };
const FILES = 'dsh.draft-files.';
export async function readDraftFiles(url: string, sessionId: string): Promise<SavedImport[]> { try { return JSON.parse(localStorage.getItem(`${FILES}${url}\u0000${sessionId}`) ?? '[]'); } catch { return []; } }
export async function saveDraftFiles(url: string, sessionId: string, list: SavedImport[]) { try { const k = `${FILES}${url}\u0000${sessionId}`; if (list.length) localStorage.setItem(k, JSON.stringify(list)); else localStorage.removeItem(k); } catch { /* storage unavailable */ } }
