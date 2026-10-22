import type { PromptPart } from './imports';
/** Browser counterpart of outbox.ts (localStorage). Same API and behaviour. */
export type OutboxItem = { id: string; url: string; sessionId: string; text: string; parts: PromptPart[]; mode: 'queue' | 'steer'; createdAt: number; attempts: number; error?: string };
const KEY = 'dsh.outbox';
const read = (): OutboxItem[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const write = (l: OutboxItem[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage unavailable */ } changed(); };
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(l => { try { l(); } catch { /* ignore */ } });
export function onOutboxChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function listOutbox(url?: string, sessionId?: string) { return read().filter(i => (!url || i.url === url) && (!sessionId || i.sessionId === sessionId)).sort((a, b) => a.createdAt - b.createdAt); }
export async function enqueue(item: Omit<OutboxItem, 'createdAt' | 'attempts'>) { const full = { ...item, createdAt: Date.now(), attempts: 0 }; write([...read().filter(i => i.id !== item.id), full]); return full; }
export async function updateOutbox(item: OutboxItem) { write(read().map(i => i.id === item.id ? item : i)); }
export async function removeOutbox(id: string) { write(read().filter(i => i.id !== id)); }
export async function clearOutboxFor(url: string) { write(read().filter(i => i.url !== url)); }
export async function drainOutbox(url: string, send: (item: OutboxItem) => Promise<void>, isTransportError: (e: unknown) => boolean, errorText: (e: unknown) => string) {
  let sent = 0, failed = 0;
  for (const item of await listOutbox(url)) {
    if (item.error) { failed++; continue; }
    try { await send(item); await removeOutbox(item.id); sent++; }
    catch (e) { if (isTransportError(e)) break; await updateOutbox({ ...item, attempts: item.attempts + 1, error: errorText(e) }); failed++; }
  }
  return { sent, failed };
}
