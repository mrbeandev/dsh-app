import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarnessClient } from './harness';
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'rpc-1' }));
const fetchMock = vi.fn();
function response(value: unknown, status = 200) { return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => ({ type: 'server-response', rpcId: 'rpc-1', result: { ok: true, value } }) }; }
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  static last: FakeSocket;
  onopen?: () => void; onclose?: () => void; onmessage?: (e: { data: string }) => void; onerror?: () => void;
  sent: any[] = [];
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.onclose?.(); }
}
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); vi.stubGlobal('WebSocket', FakeSocket); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
describe('Harness transport', () => {
  it('exchanges launch token then checks authenticated API', async () => {
    fetchMock.mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({ items: [] }));
    const client = new HarnessClient({ url: 'http://localhost:3080', token: 'a&b' });
    await client.authenticate();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:3080/?token=a%26b');
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:3080/api/session/list');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).payload).toEqual({ args: { _request: {} } });
    expect(fetchMock.mock.calls[1][1].credentials).toBe('include');
  });
  it('distinguishes authentication and capability failures', async () => {
    const client = new HarnessClient({ url: 'https://example.com', token: 'token' });
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(client.call('session/list', { _request: {} })).rejects.toMatchObject({ code: 'unauthenticated' });
    fetchMock.mockResolvedValueOnce(response({}, 404));
    await expect(client.call('future/feature', {})).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('opens, delivers and cancels logical streams', () => {
    const client = new HarnessClient({ url: 'https://example.com/harness', token: 'token' });
    const receive = vi.fn();
    const stop = client.follow('session/follow', { request: { address: { kind: 'session', sessionId: 's' } } }, receive);
    client.connectStreams(); const socket = FakeSocket.last; socket.onopen?.();
    expect(socket.url).toBe('wss://example.com/harness/api/remote.mux');
    expect(socket.sent[0]).toMatchObject({ type: 'open', endpoint: 'session/follow', payload: { args: { request: { address: { sessionId: 's' } } } } });
    socket.onmessage?.({ data: JSON.stringify({ type: 'item', streamId: '1', value: { type: 'snapshot' } }) });
    expect(receive).toHaveBeenCalledWith({ type: 'snapshot' });
    stop(); expect(socket.sent[1]).toEqual({ type: 'cancel', streamId: '1' }); client.disconnect();
  });
  it('never answers a request from a retired generation', async () => {
    const client = new HarnessClient({ url: 'https://example.com', token: 'token' }); client.clientId = 'new';
    await expect(client.answer('event', 'allowed-once', 'old')).rejects.toMatchObject({ code: 'stale' }); expect(fetchMock).not.toHaveBeenCalled();
  });
});
