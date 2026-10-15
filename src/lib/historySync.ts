import type { HarnessClient } from './harness';
import type { WireEvent } from './protocol';
import { coverage, eventsBetween, putEvents } from './eventStore';

type Address = Record<string, unknown>;
type Page = { records: { type: string; event?: WireEvent }[]; hasMore: boolean };
const eventsOf = (p: Page) => p.records.filter(r => r.type === 'event' && r.event).map(r => r.event!) as WireEvent[];

/**
 * Background backfill for one opened chat: page older history from the Harness and store it in
 * full on the phone, until the start of the session. Small pages, a pause between them, and it
 * stops when the chat closes (signal). Pages already stored are skipped via coverage.
 */
export async function backfill(client: HarnessClient, url: string, sessionId: string, address: Address, throughSeq: number, signal: AbortSignal) {
  for (let guard = 0; guard < 500 && !signal.aborted; guard++) {
    const cov = await coverage(url, sessionId);
    if (!cov || cov.complete) return;
    const page = await client.request<Page>('session/page', { address, throughSeq, beforeSeq: cov.low, maxMessages: 80 });
    if (signal.aborted) return;
    const events = eventsOf(page);
    await putEvents(url, sessionId, events, { reachedStart: !page.hasMore || !events.length });
    if (!page.hasMore || !events.length) return;
    await new Promise(r => setTimeout(r, 250)); // stay gentle on the Harness and the UI thread
  }
}

/**
 * Full events for a folded turn's range. From the phone first; if part of the range was never
 * downloaded, fetch exactly that window from the Harness once and store it.
 */
export async function turnEvents(client: HarnessClient | null, url: string, sessionId: string, address: Address, throughSeq: number, fromSeq: number, toSeq: number): Promise<WireEvent[]> {
  const local = await eventsBetween(url, sessionId, fromSeq, toSeq);
  const cov = await coverage(url, sessionId);
  const covered = !!cov && cov.low <= fromSeq && cov.high >= toSeq;
  if (covered || !client) return local;
  const page = await client.request<Page>('session/page', { address, throughSeq: Math.max(throughSeq, toSeq), beforeSeq: toSeq + 1, maxMessages: 400, turnWindow: undefined });
  const fetched = eventsOf(page).filter(e => e.seq >= fromSeq && e.seq <= toSeq);
  await putEvents(url, sessionId, eventsOf(page));
  const merged = new Map(local.map(e => [e.seq, e])); for (const e of fetched) merged.set(e.seq, e);
  return [...merged.values()].sort((a, b) => a.seq - b.seq);
}
