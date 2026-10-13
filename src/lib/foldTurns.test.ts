import { describe, expect, it } from 'vitest';
import { buildTranscript, foldTurns, type WireEvent } from './protocol';

const ev = (seq: number, time: number, type: string, data: Record<string, unknown> = {}): WireEvent => ({ seq, time, type, data } as WireEvent);
const text = (t: string) => [{ type: 'text', text: t }];
// Shape taken from a real Harness turn: prompt → 2 tool calls across steps → final reply.
const turn = (base: number, t0: number, end: Record<string, unknown> | null) => [
  ev(base, t0, 'turn/start', { turn: 1 }), ev(base + 1, t0 + 5, 'step/start', { turn: 1, step: 1 }),
  ev(base + 2, t0 + 10, 'user/message', { content: text('do some tool calls') }),
  ev(base + 3, t0 + 2000, 'assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'plan' }, { type: 'text', text: 'Looking.' }, { type: 'tool-call', id: 'a', name: 'glob_ide', arguments: '{"pattern":"**/*"}' }] } }),
  ev(base + 4, t0 + 2001, 'tool/call', { callId: 'a', name: 'glob_ide', arguments: '{"pattern":"**/*"}' }),
  ev(base + 5, t0 + 2100, 'tool/result', { message: { role: 'tool', toolCallId: 'a', source: { kind: 'tool', callId: 'a' }, content: text('no files'), isError: false } }),
  ev(base + 6, t0 + 2101, 'step/end', {}), ev(base + 7, t0 + 2200, 'step/start', { turn: 1, step: 2 }),
  ev(base + 8, t0 + 4000, 'tool/call', { callId: 'b', name: 'grep_ide', arguments: '{"pattern":"."}' }),
  ev(base + 9, t0 + 4100, 'tool/result', { message: { role: 'tool', toolCallId: 'b', source: { kind: 'tool', callId: 'b' }, content: text('no matches'), isError: false } }),
  ev(base + 10, t0 + 4200, 'step/start', { turn: 1, step: 3 }),
  ev(base + 11, t0 + 245000, 'assistant/message', { turn: 1, step: 3, message: { role: 'assistant', content: text('The workspace is empty.') } }),
  ...(end ? [ev(base + 12, t0 + 245010, 'turn/end', end)] : []),
];
const fold = (events: WireEvent[]) => foldTurns(events, buildTranscript(events));

describe('foldTurns (Completed in … marker)', () => {
  it('folds a finished turn: prompt, marker with duration, final reply', () => {
    const rows = fold(turn(1, 1_000_000, { reason: { kind: 'completed' } }));
    expect(rows.map(r => r.kind)).toEqual(['user', 'turn', 'assistant']);
    const marker = rows[1] as Extract<typeof rows[number], { kind: 'turn' }>;
    expect(marker.outcome).toBe('completed');
    expect(Math.round(marker.durationMs / 1000)).toBe(245);
    expect(marker.tools).toBe(2);
    expect(marker.steps).toBe(3);
    expect((rows[2] as any).text).toBe('The workspace is empty.');
    expect(marker.rows.some(r => r.kind === 'assistant' && (r as any).text === 'Looking.')).toBe(true);
  });
  it('keeps a running turn fully expanded', () => {
    const rows = fold(turn(1, 0, null));
    expect(rows.some(r => r.kind === 'turn')).toBe(false);
    expect(rows.filter(r => r.kind === 'tool')).toHaveLength(2);
  });
  it('marks interrupted turns as stopped and keeps the failure notice visible', () => {
    const rows = fold(turn(1, 0, { reason: { kind: 'aborted', reason: { kind: 'user' } } }));
    const marker = rows.find(r => r.kind === 'turn') as any;
    expect(marker.outcome).toBe('interrupted');
    expect(rows[rows.length - 1].kind).toBe('failure');
  });
  it('folds each turn separately', () => {
    const rows = fold([...turn(1, 0, { reason: { kind: 'completed' } }), ...turn(100, 300000, { reason: { kind: 'completed' } })]);
    expect(rows.map(r => r.kind)).toEqual(['user', 'turn', 'assistant', 'user', 'turn', 'assistant']);
  });
});
