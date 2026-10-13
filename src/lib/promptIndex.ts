import type { HarnessClient } from './harness';
import type { WireEvent } from './protocol';

/**
 * Prompt list for the pinch-to-browse sheet.
 *
 * Source: the Harness `turnOutline` projection (whole-session, ~200 B/turn, already streamed to the
 * app with session projections) — no transcript download. The outline has no timestamps, so the
 * turn's start time is resolved lazily per visible row:
 *   1. from loaded history (turn/start event in memory) — free;
 *   2. else one `session/page` with maxMessages:1 ending at the turn's `turn/start` seq (~2.5 KB);
 * and memoised for the app session (a turn's start time never changes).
 */
export type OutlineEntry = { turn: number; seq: number; prompt: string; response: string };
export type PromptRow = OutlineEntry & { time?: number };

const times = new Map<string, number>(); // `${sessionId}:${seq}` → epoch ms
const inflight = new Map<string, Promise<number | undefined>>();
const key = (sessionId: string, seq: number) => `${sessionId}:${seq}`;

export function outlineOf(values: Record<string, any> | undefined): OutlineEntry[] {
  const raw = values?.turnOutline;
  return Array.isArray(raw) ? raw.filter(e => e && typeof e.seq === 'number' && typeof e.turn === 'number') : [];
}

/** Seed times from events already loaded in the chat. */
export function seedTimes(sessionId: string, events: readonly WireEvent[]) {
  for (const e of events) if (e.type === 'turn/start' && typeof e.time === 'number') times.set(key(sessionId, e.seq), e.time);
}
export const knownTime = (sessionId: string, seq: number) => times.get(key(sessionId, seq));

export function fetchTime(client: HarnessClient, sessionId: string, seq: number): Promise<number | undefined> {
  const k = key(sessionId, seq);
  if (times.has(k)) return Promise.resolve(times.get(k));
  const running = inflight.get(k); if (running) return running;
  const p = client.request<{ records: { type: string; event?: WireEvent }[] }>('session/page', { address: { kind: 'session', sessionId }, throughSeq: seq, beforeSeq: seq + 1, maxMessages: 1 })
    .then(page => { const e = page.records.map(r => r.event).find(x => x?.seq === seq); if (e?.time) times.set(k, e.time); return e?.time; })
    .catch(() => undefined)
    .finally(() => inflight.delete(k));
  inflight.set(k, p); return p;
}

/** "Today 14:05", "Yesterday 09:12", "Mon 18:40", "12 Oct 18:40", "12 Oct 2025". */
export function promptTime(ms: number, now = Date.now()) {
  const d = new Date(ms), n = new Date(now);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 86400000);
  if (diff === 0) return `Today ${hm}`;
  if (diff === 1) return `Yesterday ${hm}`;
  if (diff > 1 && diff < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${hm}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.getDate()} ${d.toLocaleDateString([], { month: 'short' })} ${hm}`;
  return `${d.getDate()} ${d.toLocaleDateString([], { month: 'short' })} ${d.getFullYear()}`;
}
