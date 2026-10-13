import type { Frame, Session, WireEvent } from './protocol';
export type CachedHarness = { url: string; sessions: Session[]; workspaces: Frame[]; savedAt: number };
export type CachedHistory = { records: WireEvent[]; cursor: number; hasMore: boolean; savedAt: number };
const epochs = new Map<string, number>();
export const cacheEpoch = (url: string) => epochs.get(url) ?? 0;
function open(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open('dsh-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('cache'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function operation<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const d = await open(); return new Promise((resolve, reject) => { const tx = d.transaction('cache', mode); const r = act(tx.objectStore('cache')); tx.oncomplete = () => { resolve(r.result); d.close(); }; tx.onerror = () => { reject(tx.error); d.close(); }; }); }
const key = (url: string, id = '') => JSON.stringify([url, id]);
export async function readCatalog(url: string): Promise<CachedHarness | null> { return await operation('readonly', s => s.get(key(url))) ?? null; }
export async function writeCatalog(value: CachedHarness, epoch = cacheEpoch(value.url)) { if (epoch === cacheEpoch(value.url)) await operation('readwrite', s => s.put(value, key(value.url))); }
export async function readHistory(url: string, id: string): Promise<CachedHistory | null> { return await operation('readonly', s => s.get(key(url, id))) ?? null; }
export async function writeHistory(url: string, id: string, value: CachedHistory, epoch = cacheEpoch(url)) { if (epoch === cacheEpoch(url)) await operation('readwrite', s => s.put(value, key(url, id))); }
export async function listCaches(): Promise<{ url: string; bytes: number }[]> {
  const d = await open(); return new Promise((resolve, reject) => { const totals = new Map<string, number>(); const tx = d.transaction('cache'); const r = tx.objectStore('cache').openCursor(); r.onsuccess = () => { const c = r.result; if (c) { const [url] = JSON.parse(String(c.key)); totals.set(url, (totals.get(url) ?? 0) + new TextEncoder().encode(JSON.stringify(c.value)).length); c.continue(); } }; tx.oncomplete = () => { d.close(); resolve([...totals].map(([url, bytes]) => ({ url, bytes }))); }; tx.onerror = () => reject(tx.error); });
}
export async function clearCache(url: string) { epochs.set(url, cacheEpoch(url) + 1); await remove(url); }
async function remove(url: string, ids?: string[]) { const d = await open(); await new Promise<void>((resolve, reject) => { const tx = d.transaction('cache', 'readwrite'); const r = tx.objectStore('cache').openCursor(); r.onsuccess = () => { const c = r.result; if (c) { const [u, id] = JSON.parse(String(c.key)); if (u === url && (!ids || ids.includes(id))) c.delete(); c.continue(); } }; tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); d.close(); }
export async function clearWorkspaceHistory(url: string, ids: string[]) { await remove(url, ids); }
export function formatBytes(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
