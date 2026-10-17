import { Platform } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { randomUUID } from 'expo-crypto';
import { Connection, endpoint, Frame, normalizeConnection, rpcEnvelope } from './protocol';
import { attachBinary, parseMultipart } from './multipart';
import { diagnostic } from './diagnostics';
import { friendlyNetworkError } from './connectivity';

export class HarnessError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export class HarnessClient {
  connection: Connection;
  private socket: WebSocket | null = null;
  private streams = new Map<string, { endpoint: string; args: Record<string, unknown>; receive: (frame: Frame) => void }>();
  private cookie = '';
  private nextStream = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private networkPaused = false;
  setNetworkOffline(offline: boolean) {
    this.networkPaused = offline;
    if (offline) { clearTimeout(this.retry); this.socket?.close(); }
    else if (!this.closed && !this.socketOpen) this.connectStreams();
  }
  private attempts = 0;
  clientId = '';
  onStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void = () => {};
  /** Called whenever anything arrives from the Harness (stream frame or successful RPC). */
  onActivity: () => void = () => {};
  get socketOpen() { return this.socket?.readyState === WebSocket.OPEN; }
  /** Native binary transfers use the same authenticated session as Remote calls. */
  get transferHeaders(): Record<string, string> { return Platform.OS !== 'web' && this.cookie ? { Cookie: this.cookie } : {}; }
  /** Skip the back-off and reconnect the live socket now (no-op while it is open). */
  reconnectNow() { if (this.closed || this.socketOpen) return; clearTimeout(this.retry); this.attempts = 0; try { this.socket?.close(); } catch { /* already closed */ } this.connectStreams(); }
  constructor(connection: Connection) { this.connection = normalizeConnection(connection); }
  async authenticate() {
    const url = new URL(endpoint(this.connection.url, '/'));
    url.searchParams.set('token', this.connection.token);
    // Capture the token exchange's redirect cookie before native fetch follows it and hides Set-Cookie.
    // React Native's fetch ignores redirect:'manual' on Android and silently downloads the whole Web UI
    // page; expo/fetch honours it, so the 303's Set-Cookie is readable and nothing else is fetched.
    const exchange = Platform.OS === 'web' ? null : await expoFetch(url.toString(), { credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(12000) }).catch(() => null);
    const minted = exchange?.headers.get('set-cookie');
    if (minted) this.cookie = minted.split(';')[0];
    // The Harness answers a valid token with 303 + Set-Cookie. That already authenticates us, so skip
    // following the redirect (it downloads the whole Web UI page: ~1 s extra on a mobile tunnel).
    // Fall back to the follow request only if the exchange itself failed (older Harness / network error).
    // A 303 is only sent for a valid token (a bad one gets 401). Android's shared cookie jar stores the
    // session cookie even when it hides Set-Cookie from JS, so the redirect needn't be followed.
    const exchanged = !!exchange && (exchange.ok || exchange.status === 303);
    const response = exchanged ? exchange! : await fetch(url.toString(), { credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(12000) });
    // Native fetch maintains the cookie jar; explicitly retain a cookie when exposed by the platform.
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    if (!response.ok && !exchanged) throw new HarnessError('authentication', 'Harness refused the connection. Check the URL and current auth token.');
    // This list call proves the session works; keep its result so the first refresh can reuse it
    // instead of paying for an identical round trip over a slow tunnel.
    // A bad token already fails at the exchange above, so don't make the user wait for the session list
    // (~3 s over a mobile tunnel) before the live socket opens: fetch it in parallel and let the first
    // refresh await it. An auth failure here still surfaces through that refresh.
    const list = this.call('session/list', { _request: {} });
    list.catch(() => {}); // observed by the first refresh; avoid an unhandled-rejection warning meanwhile
    this.initialList = list;
  }
  /** session/list request started by authenticate(); consumed once by the first refresh. */
  initialList: Promise<any> | null = null;
  async call<T = any>(method: string, args: Record<string, unknown>): Promise<T> {
    const start = Date.now(); diagnostic('rpc.start', { method });
    try { return await this.performCall<T>(method, args); }
    catch (e) { diagnostic('rpc.error', { method, durationMs: Date.now() - start, code: e instanceof HarnessError ? e.code : 'transport' }); throw e; }
    finally { diagnostic('rpc.end', { method, durationMs: Date.now() - start }); }
  }
  private async performCall<T = any>(method: string, args: Record<string, unknown>): Promise<T> {
    const rpcId = randomUUID();
    const response = await fetch(endpoint(this.connection.url, `/api/${method}`), {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(Platform.OS !== 'web' && this.cookie ? { Cookie: this.cookie } : {}) },
      body: JSON.stringify(rpcEnvelope(method, args, rpcId)),
    });
    if (response.status === 401) throw new HarnessError('unauthenticated', 'Auth token expired. Reconnect with the current Harness token.');
    if (response.status === 403) throw new HarnessError('forbidden', 'Harness rejected this host or origin. Check the host configuration.');
    if (response.status === 404) throw new HarnessError('unavailable', 'This Harness does not support this feature.');
    if (!response.ok) throw new HarnessError('transport', `Harness request failed (${response.status}).`);
    const data = await response.json();
    if (data.type !== 'server-response' || data.rpcId !== rpcId) throw new HarnessError('protocol', 'Unexpected Harness response.');
    if (!data.result?.ok) throw new HarnessError(data.result?.error?.code ?? 'unknown', data.result?.error?.message ?? 'Harness request failed.');
    this.onActivity();
    return data.result.value;
  }
  request<T = any>(method: string, request: Record<string, unknown>) { return this.call<T>(method, { request }); }
  /** Binary Remote (e.g. workspaceFiles/readBytes): multipart response with JSON metadata + raw byte parts. */
  async callBinary<T = any>(method: string, args: Record<string, unknown>): Promise<T> {
    const rpcId = randomUUID();
    const response = await fetch(endpoint(this.connection.url, `/api/${method}`), {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', ...(Platform.OS !== 'web' && this.cookie ? { Cookie: this.cookie } : {}) },
      body: JSON.stringify(rpcEnvelope(method, args, rpcId)),
    });
    if (response.status === 401) throw new HarnessError('unauthenticated', 'Auth token expired. Reconnect with the current Harness token.');
    if (!response.ok) throw new HarnessError('transport', `Harness request failed (${response.status}).`);
    const type = response.headers.get('content-type') ?? '';
    const body = new Uint8Array(await response.arrayBuffer());
    if (!type.startsWith('multipart/')) {
      const data = JSON.parse(new TextDecoder().decode(body));
      if (!data.result?.ok) throw new HarnessError(data.result?.error?.code ?? 'unknown', data.result?.error?.message ?? 'Harness request failed.');
      this.onActivity(); return data.result.value;
    }
    const { metadata, parts } = parseMultipart(body, type);
    if (metadata?.rpcId !== rpcId) throw new HarnessError('protocol', 'Unexpected Harness response.');
    if (!metadata.result?.ok) throw new HarnessError(metadata.result?.error?.code ?? 'unknown', metadata.result?.error?.message ?? 'Harness request failed.');
    return attachBinary(metadata, parts);
  }
  connectStreams() {
    if (this.networkPaused) return;
    this.closed = false;
    const url = endpoint(this.connection.url, '/api/remote.mux').replace(/^http/, 'ws');
    const Socket = WebSocket as any;
    this.socket = Platform.OS === 'web' ? new WebSocket(url) : new Socket(url, undefined, this.cookie ? { headers: { Cookie: this.cookie } } : undefined);
    this.socket!.onopen = () => {
      this.attempts = 0;
      diagnostic('socket.state', { status: 'open', count: this.streams.size });
      for (const [streamId, stream] of this.streams) this.open(streamId, stream.endpoint, stream.args);
    };
    this.socket!.onmessage = (message) => {
      try {
        const frame = JSON.parse(String(message.data)); this.onActivity();
        if (frame.type === 'item') this.streams.get(frame.streamId)?.receive(frame.value);
        if (frame.type === 'error') { diagnostic('stream.error', { code: frame.error?.code ?? 'unknown' }); this.streams.get(frame.streamId)?.receive({ type: 'stream-error', error: frame.error }); }
      } catch { /* Ignore malformed frames, never execute server content. */ }
    };
    this.socket!.onclose = () => {
      this.clientId = '';
      if (!this.closed && !this.networkPaused) {
        diagnostic('socket.state', { status: 'reconnecting' }); this.onStatus('reconnecting');
        this.retry = setTimeout(() => this.connectStreams(), Math.min(1000 * 2 ** this.attempts++, 15000));
      }
    };
    this.socket!.onerror = () => { this.socket?.close(); };
  }
  private open(streamId: string, endpoint: string, args: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args } }));
  }
  follow(endpoint: string, args: Record<string, unknown>, receive: (frame: Frame) => void) {
    const streamId = String(++this.nextStream);
    this.streams.set(streamId, { endpoint, args, receive });
    this.open(streamId, endpoint, args);
    return () => {
      this.streams.delete(streamId);
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'cancel', streamId }));
    };
  }
  async answer(eventId: string, value: unknown, clientId: string) {
    if (!clientId || clientId !== this.clientId) throw new HarnessError('stale', 'Connection changed. Wait for the request to be replayed before answering.');
    return this.call('$events/result', { clientId, eventId, outcome: { kind: 'result', value } });
  }
  disconnect() {
    this.closed = true; clearTimeout(this.retry); this.streams.clear(); this.socket?.close(); this.socket = null; this.clientId = ''; this.onStatus('disconnected');
  }
}
export function errorMessage(error: unknown) { return error instanceof Error ? friendlyNetworkError(error.message) : 'Something went wrong. Please try again.'; }