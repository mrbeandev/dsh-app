import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ low: 100, complete: false, puts: 0, local: [] as { seq: number; type: string; time: number; data: object }[] }));
vi.mock('./eventStore', () => ({
  coverage: async () => ({ low: store.low, high: 200, complete: store.complete }),
  eventsBetween: async (_u: string, _s: string, from: number, to: number) => store.local.filter(e => e.seq >= from && e.seq <= to),
  putEvents: async (_u: string, _s: string, _e: unknown[], o: { reachedStart?: boolean } = {}) => { store.puts++; store.low -= 10; if (o.reachedStart) store.complete = true; },
}));
const { backfill, markInteraction, turnEvents } = await import('./historySync');

const page = (hasMore: boolean) => ({ records: [{ type: 'event', event: { seq: 1, type: 'x', time: 0, data: {} } }], hasMore });
beforeEach(() => { vi.useFakeTimers(); store.low = 100; store.complete = false; store.puts = 0; store.local = []; });
afterEach(() => vi.useRealTimers());

describe('history backfill scheduling', () => {
  it('waits for the chat to settle before the first page', async () => {
    const request = vi.fn(async () => page(false));
    const run = backfill({ request } as never, 'u', 's', {}, 200, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    await run;
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('pauses while the user is scrolling and resumes afterwards', async () => {
    const request = vi.fn(async () => page(false));
    const run = backfill({ request } as never, 'u', 's', {}, 200, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1400);
    markInteraction(3000); // user starts scrolling just before the first page
    await vi.advanceTimersByTimeAsync(2000);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    await run;
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('stops when the chat closes', async () => {
    const request = vi.fn(async () => page(true));
    const ctl = new AbortController();
    const run = backfill({ request } as never, 'u', 's', {}, 200, ctl.signal);
    ctl.abort();
    await vi.advanceTimersByTimeAsync(5000);
    await run;
    expect(request).not.toHaveBeenCalled();
  });
});

describe('loading a folded row (thought / tool) on demand', () => {
  const ev = (seq: number) => ({ seq, type: 'assistant/message', time: 0, data: {} });
  it('fetches from the Harness when the event sits in a gap inside the stored range', async () => {
    store.low = 50; store.local = [ev(50), ev(120)]; // range 50..200 claims 80, but 80 isn't stored
    const request = vi.fn(async () => ({ records: [{ type: 'event', event: ev(80) }], hasMore: false }));
    const out = await turnEvents({ request } as never, 'u', 's', {} as never, 200, 80, 80);
    expect(request).toHaveBeenCalledTimes(1);
    expect(out.map(e => e.seq)).toEqual([80]);
  });
  it('uses the phone copy when the event is stored', async () => {
    store.low = 50; store.local = [ev(80)];
    const request = vi.fn();
    const out = await turnEvents({ request } as never, 'u', 's', {} as never, 200, 80, 80);
    expect(request).not.toHaveBeenCalled();
    expect(out.map(e => e.seq)).toEqual([80]);
  });
});
