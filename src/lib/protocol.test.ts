import { describe, expect, it } from 'vitest';
import { buildTranscript, endpoint, normalizeConnection, rpcEnvelope, sessionTitle, toolTitle, type TranscriptRow, type WireEvent } from './protocol';

const ev = (seq: number, type: string, data: Record<string, unknown> = {}): WireEvent => ({ type, seq, time: 0, data });
const text = (t: string) => [{ type: 'text', text: t }];
const only = (rows: TranscriptRow[], kind: TranscriptRow['kind']) => rows.filter(r => r.kind === kind);

describe('connection', () => {
  it('accepts local and tunnel addresses without a mode', () => {
    expect(normalizeConnection({ url: ' http://localhost:3080/ ', token: ' secret ' })).toEqual({ url: 'http://localhost:3080', token: 'secret' });
    expect(normalizeConnection({ url: 'https://example.com/harness/?token=abc', token: '' })).toEqual({ url: 'https://example.com/harness', token: 'abc' });
  });
  it('rejects unsafe schemes and missing credentials', () => {
    expect(() => normalizeConnection({ url: 'file:///tmp', token: 'x' })).toThrow();
    expect(() => normalizeConnection({ url: 'https://user:pass@example.com', token: 'x' })).toThrow();
    expect(() => normalizeConnection({ url: 'https://example.com', token: '' })).toThrow();
  });
  it('preserves tunnel path prefixes', () => expect(endpoint('https://example.com/dsh/', '/api/session/list')).toBe('https://example.com/dsh/api/session/list'));
  it('wraps strict named args in the RPC envelope', () => expect(rpcEnvelope('session/list', { _request: {} }, 'abc')).toEqual({ type: 'client-request', rpcId: 'abc', method: 'session/list', payload: { args: { _request: {} } } }));
  it('reads projected titles', () => expect(sessionTitle({ sessionId: 'x', updatedAt: 0, blank: false, running: false, projections: { values: { title: 'Build app' } } })).toBe('Build app'));
});

describe('transcript', () => {
  it('shows user prompts and assistant replies with reasoning, hides bookkeeping', () => {
    const rows = buildTranscript([ev(0, 'turn/start', { turn: 1 }), ev(1, 'user/message', { source: { kind: 'user' }, content: text('Hello') }), ev(2, 'step/start'), ev(3, 'request/header'), ev(4, 'assistant/message', { message: { content: [{ type: 'reasoning', text: 'think' }, ...text('Hi')] } }), ev(5, 'step/end'), ev(6, 'turn/end', { reason: { kind: 'completed' } })]);
    expect(rows.map(r => r.kind)).toEqual(['user', 'assistant']);
    expect(rows[1]).toMatchObject({ text: 'Hi', reasoning: 'think' });
  });
  it('pairs tool calls with their results by callId', () => {
    const rows = buildTranscript([ev(1, 'tool/call', { callId: 'c1', name: 'bash', arguments: '{"command":"npm test"}' }), ev(2, 'tool/result', { message: { toolCallId: 'c1', isError: false, content: text('ok') } })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'tool', name: 'bash', result: 'ok', pending: false });
  });
  it('marks a tool as pending until its result arrives, and flags errors', () => {
    expect(buildTranscript([ev(1, 'tool/call', { callId: 'c', name: 'read', arguments: '{}' })])[0]).toMatchObject({ pending: true });
    const failed = buildTranscript([ev(1, 'tool/call', { callId: 'c', name: 'read', arguments: '{}' }), ev(2, 'tool/result', { message: { toolCallId: 'c', isError: true, content: text('nope') }, error: { name: 'E', code: 'X', reason: 'denied' } })])[0];
    expect(failed).toMatchObject({ isError: true, errorReason: 'denied' });
  });
  it('hides ordinary context injections but keeps goal rounds, skills and notices', () => {
    const rows = buildTranscript([
      ev(1, 'user/message', { source: { kind: 'runtime-context' }, content: text('ctx') }),
      ev(2, 'user/message', { source: { kind: 'time-context' }, content: text('time') }),
      ev(3, 'user/message', { source: { kind: 'goal', round: 2 }, content: text('<goal_round>') }),
      ev(4, 'user/message', { source: { kind: 'skill-invocation' }, content: text('skill body') }),
      ev(5, 'user/message', { source: { kind: 'webhook', form: 'notice', summary: 'Push to main' }, content: text('payload') }),
    ]);
    expect(only(rows, 'context').map(r => (r as any).label)).toEqual(['Goal round 2', 'Skill loaded', 'Webhook']);
    expect(rows.find(r => r.kind === 'context' && r.label === 'Webhook')).toMatchObject({ summary: 'Push to main' });
  });
  it('collapses compaction start, summary checkpoint and end into one row', () => {
    const rows = buildTranscript([ev(1, 'compaction/start', { compactionId: 'k' }), ev(2, 'compaction/summary', { compactionId: 'k', summary: text('Summary'), shadowedTokenCount: 42000 }), ev(3, 'user/message', { source: { kind: 'compact-checkpoint' }, content: text('Summary') }), ev(4, 'compaction/end', { compactionId: 'k' })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'compaction', state: 'done', summary: 'Summary', tokens: 42000 });
  });
  it('shows the system prompt once per change', () => {
    const sys = (seq: number, t: string) => ev(seq, 'system/message', { message: { content: text(t) } });
    expect(only(buildTranscript([sys(1, 'A'), sys(2, 'A'), sys(3, 'B')]), 'system')).toHaveLength(2);
  });
  it('renders turn failures and model failures', () => {
    const rows = buildTranscript([ev(1, 'assistant/attempt', { stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'No API key' } } } }] }), ev(2, 'turn/end', { reason: { kind: 'aborted', reason: { kind: 'user' } } }), ev(3, 'turn/end', { reason: { kind: 'error', error: { code: 'QUOTA', message: 'x' } } })]);
    expect(only(rows, 'failure').map(r => (r as any).text)).toEqual(['Generation failed: No API key', 'Stopped', 'Usage quota reached. Try again later.']);
  });
  it('keeps unknown events inspectable', () => expect(buildTranscript([ev(3, 'future/event', { a: 1 })])[0]?.kind).toBe('event'));
});

describe('tool titles', () => {
  it('summarizes common tools', () => {
    expect(toolTitle('bash', '{"command":"npm test\\nmore"}')).toEqual({ verb: 'Ran', target: 'npm test' });
    expect(toolTitle('read', '{"file_path":"src/app/index.tsx"}')).toEqual({ verb: 'Read', target: 'index.tsx' });
    expect(toolTitle('mcp__x__do_thing', 'not json').verb).toBe('do thing');
  });
});
