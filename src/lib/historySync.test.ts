import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ low: 100, complete: false, puts: 0 }));
vi.mock('./eventStore', () => ({
  coverage: async () => ({ low: store.low, high: 200, complete: store.complete }),
  eventsBetween: async () => [],
  putEvents: async (_u: string, _s: string, _e: unknown[], o: { reachedStart?: boolean } = {}) => { store.puts++; store.low -= 10; if (o.reachedStart) store.complete = true; },
}));
const { backfill, markInteraction } = await import('./historySync');

const page = (hasMore: boolean) => ({ records: [{ type: 'event', event: { seq: 1, type: 'x', time: 0, data: {} } }], hasMore });
beforeEach(() => { vi.useFakeTimers(); store.low = 100; store.complete = false; store.puts = 0; });
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
