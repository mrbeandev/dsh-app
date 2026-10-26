import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./diagnostics', () => ({ diagnostic: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'rpc-1' }));
vi.mock('expo/fetch', () => ({ fetch: (...a: unknown[]) => (globalThis as any).fetch(...a) }));
const { HarnessClient } = await import('./harness');

const fetchMock = vi.fn();
const res = (status: number, cookie: string | null = null) => ({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k: string) => (k.toLowerCase() === 'set-cookie' ? cookie : null) },
  json: async () => ({ type: 'server-response', rpcId: 'rpc-1', result: { ok: true, value: { items: [] } } }),
});
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('native token exchange', () => {
  it('accepts the 303 + cookie without downloading the redirected Web UI page', async () => {
    fetchMock.mockResolvedValueOnce(res(303, 'dsh_session=abc; Path=/; HttpOnly')).mockResolvedValueOnce(res(200));
    const client = new HarnessClient({ url: 'https://h.example', token: 't' });
    await client.authenticate();
    expect(fetchMock).toHaveBeenCalledTimes(2); // exchange + session/list, no follow request
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
    expect(fetchMock.mock.calls[1][0]).toBe('https://h.example/api/session/list');
    expect(fetchMock.mock.calls[1][1].headers.Cookie).toBe('dsh_session=abc');
    await expect(client.initialList).resolves.toEqual({ items: [] });
  });
  it('trusts a 303 even when the cookie jar hides Set-Cookie (the jar already holds the session)', async () => {
    fetchMock.mockResolvedValueOnce(res(303, null)).mockResolvedValueOnce(res(200));
    await new HarnessClient({ url: 'https://h.example', token: 't' }).authenticate();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('falls back to following the redirect when the manual exchange fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(200));
    await new HarnessClient({ url: 'https://h.example', token: 't' }).authenticate();
    expect(fetchMock.mock.calls[1][1].redirect).toBe('follow');
  });
  it('still rejects a refused token', async () => {
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(401));
    await expect(new HarnessClient({ url: 'https://h.example', token: 'bad' }).authenticate()).rejects.toMatchObject({ code: 'authentication' });
  });
});

describe('answering questions', () => {
  it('gives up after 15 s instead of spinning forever when the Harness never confirms', async () => {
    vi.useFakeTimers();
    fetchMock.mockReturnValueOnce(new Promise(() => {})); // request lost on a flipping tunnel
    const client = new HarnessClient({ url: 'https://h.example', token: 't' });
    client.clientId = 'c1';
    const p = client.answer('e1', { answers: [] }, 'c1').catch(e => e);
    await vi.advanceTimersByTimeAsync(15_001);
    const err = await p;
    expect(err.code).toBe('transport');
    expect(String(err.message)).toMatch(/sent again/);
    vi.useRealTimers();
  });
  it('refuses to answer on a stale connection with a clear message', async () => {
    const client = new HarnessClient({ url: 'https://h.example', token: 't' });
    client.clientId = 'new';
    await expect(client.answer('e1', {}, 'old')).rejects.toMatchObject({ code: 'stale' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
