import { describe, expect, it, vi } from 'vitest';
import { fetchTime, knownTime, outlineOf, promptTime, seedTimes } from './promptIndex';

describe('prompt index', () => {
  it('reads the real turnOutline projection shape', () => {
    const v = { turnOutline: [{ turn: 1, seq: 6, prompt: 'Reply with exactly ANDROID_EXPO_OK. Do not use an…', response: '' }, { turn: 4, seq: 41, prompt: 'Hi', response: 'Hi! How can I help you today?' }, null] };
    expect(outlineOf(v).map(e => e.seq)).toEqual([6, 41]);
    expect(outlineOf(undefined)).toEqual([]);
  });
  it('takes times from loaded turn/start events without any request', () => {
    seedTimes('s1', [{ seq: 41, time: 1791886060532, type: 'turn/start', data: {} } as any]);
    expect(knownTime('s1', 41)).toBe(1791886060532);
  });
  it('fetches one turn time with a single maxMessages:1 page and memoises it', async () => {
    const request = vi.fn().mockResolvedValue({ records: [{ type: 'event', event: { seq: 7, time: 123, type: 'turn/start' } }] });
    const client = { request } as any;
    expect(await fetchTime(client, 's2', 7)).toBe(123);
    expect(await fetchTime(client, 's2', 7)).toBe(123);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({ throughSeq: 7, beforeSeq: 8, maxMessages: 1 });
  });
  it('formats relative dates', () => {
    const now = new Date(2026, 9, 13, 20, 0).getTime();
    expect(promptTime(new Date(2026, 9, 13, 14, 5).getTime(), now)).toMatch(/^Today /);
    expect(promptTime(new Date(2026, 9, 12, 9, 12).getTime(), now)).toMatch(/^Yesterday /);
    expect(promptTime(new Date(2025, 1, 3).getTime(), now)).toMatch(/2025$/);
  });
});
