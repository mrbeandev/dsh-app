import { describe, expect, it } from 'vitest';
import { endpoint, normalizeConnection, projectEvent, rpcEnvelope, sessionTitle } from './protocol';
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
});
describe('wire contract', () => {
  it('wraps strict named args in the RPC envelope', () => expect(rpcEnvelope('session/list', { _request: {} }, 'abc')).toEqual({ type: 'client-request', rpcId: 'abc', method: 'session/list', payload: { args: { _request: {} } } }));
  it('projects user and durable assistant messages', () => {
    expect(projectEvent({ type: 'user/message', seq: 1, time: 0, data: { content: [{ type: 'text', text: 'Hello' }] } })?.text).toBe('Hello');
    expect(projectEvent({ type: 'assistant/message', seq: 2, time: 0, data: { message: { content: [{ type: 'text', text: 'Hi' }] } } })?.kind).toBe('assistant');
  });
  it('hides injected runtime messages and shows missing provider credentials', () => {
    expect(projectEvent({ type: 'user/message', seq: 1, time: 0, data: { source: { kind: 'runtime-context' }, content: 'Internal context' } })).toBeNull();
    expect(projectEvent({ type: 'assistant/attempt', seq: 2, time: 0, data: { stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'MISSING_CREDENTIAL', message: 'No API key' } } } }] } })?.text).toContain('No API key');
  });
  it('keeps unknown events inspectable', () => expect(projectEvent({ type: 'future/event', seq: 3, time: 0, data: { a: 1 } })?.kind).toBe('event'));
  it('reads projected titles', () => expect(sessionTitle({ sessionId: 'x', updatedAt: 0, blank: false, running: false, projections: { values: { title: 'Build app' } } })).toBe('Build app'));
});
