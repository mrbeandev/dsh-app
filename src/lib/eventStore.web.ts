import type { WireEvent } from './protocol';
import type { Coverage } from './eventStore';

/** Web preview: in-memory event store (the shipping app uses SQLite, see eventStore.ts). */
const mem = new Map<string, { events: Map<number, WireEvent>; cov: Coverage | null }>();
const bucket = (url: string, id: string) => { const k = `${url}\n${id}`; let b = mem.get(k); if (!b) { b = { events: new Map(), cov: null }; mem.set(k, b); } return b; };
export type { Coverage };
export async function putEvents(url: string, id: string, events: readonly WireEvent[], opts: { reachedStart?: boolean } = {}) {
  const b = bucket(url, id); for (const e of events) b.events.set(e.seq, e);
  const seqs = [...b.events.keys()]; if (!seqs.length) return;
  b.cov = { low: Math.min(...seqs), high: Math.max(...seqs), complete: !!(b.cov?.complete || opts.reachedStart) };
}
export async function coverage(url: string, id: string) { return bucket(url, id).cov; }
export async function eventsBetween(url: string, id: string, a: number, z: number) { return [...bucket(url, id).events.values()].filter(e => e.seq >= a && e.seq <= z).sort((x, y) => x.seq - y.seq); }
export async function eventAt(url: string, id: string, seq: number) { return bucket(url, id).events.get(seq) ?? null; }
export async function resultFor(url: string, id: string, callSeq: number, callId: string) {
  return [...bucket(url, id).events.values()].sort((x, y) => x.seq - y.seq).find(e => e.seq > callSeq && e.type === 'tool/result' && String((e.data as any)?.message?.toolCallId ?? '') === callId) ?? null;
}
export async function storeStats(url: string, id: string) {
  const ev = [...bucket(url, id).events.values()]; const counts = new Map<string, number>(); ev.forEach(e => counts.set(e.type, (counts.get(e.type) ?? 0) + 1));
  return { count: ev.length, bytes: JSON.stringify(ev.map(e => e.data)).length, first: Math.min(...ev.map(e => e.seq)), last: Math.max(...ev.map(e => e.seq)), types: [...counts].map(([type, n]) => ({ type, n })) };
}
export async function storeBytes() { return [] as { url: string; bytes: number }[]; }
export async function clearEvents(url: string, ids?: string[]) { for (const k of [...mem.keys()]) { const [u, id] = k.split('\n'); if (u === url && (!ids || ids.includes(id))) mem.delete(k); } }
