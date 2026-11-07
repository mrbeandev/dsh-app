import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => 'abcdef12-3456-7890-abcd-ef1234567890' }));
const { openTerminal, _resetTerminalMode } = await import('./terminalStream');

function fakeClient() {
  const sent: unknown[] = []; const calls: [string, any][] = []; const streams: { endpoint: string; args: any; receive: (f: any) => void }[] = [];
  return {
    sent, calls, streams,
    duplex: (endpoint: string, args: any, receive: (f: any) => void) => { streams.push({ endpoint, args, receive }); return { send: (v: unknown) => { sent.push(v); return true; }, close: () => {} }; },
    follow: (endpoint: string, args: any, receive: (f: any) => void) => { streams.push({ endpoint, args, receive }); return () => {}; },
    call: async (method: string, args: any) => { calls.push([method, args]); return {}; },
  };
}

describe('terminal connection (Harness 0.2.1 attach)', () => {
  beforeEach(() => _resetTerminalMode());
  it('attaches with one two-way stream and sends numbered write/resize items', async () => {
    const c = fakeClient(); const got: any[] = [];
    const t = openTerminal(c, 's1', 'term-1', f => got.push(f));
    expect(c.streams[0]).toMatchObject({ endpoint: 'terminal/attach', args: { agentId: 's1', id: 'term-1' } });
    c.streams[0].receive({ type: 'snapshot', sequence: 0, screen: '$ ', info: { state: 'running' }, writable: true });
    t.resize(100, 30); await t.write('ls\n'); await t.write('pwd\n');
    expect(c.sent).toEqual([{ type: 'resize', sequence: 1, cols: 100, rows: 30 }, { type: 'write', sequence: 2, data: 'ls\n' }, { type: 'write', sequence: 3, data: 'pwd\n' }]);
    expect(c.calls).toEqual([]);
    expect(got[0].type).toBe('snapshot');
  });
  it('restarts numbering when the Host re-sends a snapshot (reconnect)', async () => {
    const c = fakeClient(); const t = openTerminal(c, 's1', 'term-1', () => {});
    await t.write('a'); c.streams[0].receive({ type: 'snapshot', sequence: 0, screen: '', info: {}, writable: true }); await t.write('b');
    expect(c.sent.map((x: any) => x.sequence)).toEqual([1, 1]);
  });
  it('explains a read-only refusal instead of failing silently', () => {
    const c = fakeClient(); const got: any[] = [];
    openTerminal(c, 's1', 'term-1', f => got.push(f));
    c.streams[0].receive({ type: 'ack', sequence: 2, refusal: 'read-only' });
    expect(got[0]).toMatchObject({ type: 'stream-error' }); expect(got[0].error.message).toMatch(/another device/);
  });
});

describe('terminal connection (Harness 0.2.0 fallback)', () => {
  beforeEach(() => _resetTerminalMode());
  it('falls back to follow + write/resize calls when attach does not exist', async () => {
    const c = fakeClient(); const got: any[] = [];
    const t = openTerminal(c, 's1', 'term-1', f => got.push(f));
    c.streams[0].receive({ type: 'stream-error', error: { code: 'gateway/not-found', message: 'typert gateway: terminal/attach: no active Remote method exports this endpoint' } });
    expect(c.streams[1]).toMatchObject({ endpoint: 'terminal/follow', args: { agentId: 's1', id: 'term-1' } });
    await t.write('ls\n'); t.resize(80, 24);
    expect(c.calls[0]).toEqual(['terminal/write', expect.objectContaining({ agentId: 's1', id: 'term-1', data: 'ls\n' })]);
    expect(c.calls[1][0]).toBe('terminal/resize');
    expect(got).toEqual([]); // the missing-endpoint error is handled, not shown
    openTerminal(c, 's1', 'term-2', () => {});
    expect(c.streams[2].endpoint).toBe('terminal/follow'); // remembered for later terminals
  });
});
