export type Connection = { url: string; token: string };
export type Session = { sessionId: string; updatedAt: number; running: boolean; blank: boolean; cwd?: string; projections?: { values: Record<string, unknown> } };
export type WireEvent = { type: string; seq: number; time: number; data: Record<string, unknown> };
export type Frame = Record<string, any>;

export function normalizeConnection(input: Connection): Connection {
  let url: URL;
  try { url = new URL(input.url.trim()); } catch { throw new Error('Enter a complete Harness URL, including http:// or https://.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  const token = input.token.trim() || url.searchParams.get('token') || '';
  if (!token) throw new Error('Enter the auth token printed by your Harness.');
  url.search = ''; url.hash = '';
  return { url: url.toString().replace(/\/$/, ''), token };
}
export function endpoint(base: string, path: string) { return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`; }
export function rpcEnvelope(method: string, args: Record<string, unknown>, rpcId: string) {
  return { type: 'client-request', rpcId, method, payload: { args } };
}
export function sessionTitle(session: Session) {
  const title = session.projections?.values.title;
  return typeof title === 'string' && title ? title : 'Untitled thread';
}
export function textContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textContent).filter(Boolean).join('\n');
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    if (item.type === 'text' || item.type === 'reasoning') return String(item.text ?? '');
    if (item.type === 'file') return `Attachment: ${(item.attachment as any)?.name ?? 'file'}`;
  }
  return '';
}
export type TranscriptRow = { id: string; kind: 'user' | 'assistant' | 'tool' | 'event'; text: string; label?: string };
export function projectEvent(event: WireEvent): TranscriptRow | null {
  const d = event.data;
  if (event.type === 'message/user' || event.type === 'user/message') return { id: String(event.seq), kind: 'user', text: textContent(d.content) };
  if (event.type === 'attempt/settled' || event.type === 'assistant/message') {
    const message = (d.message ?? d.assistantMessage) as any;
    const text = textContent(message?.content ?? d.content ?? d.chunks);
    return text ? { id: String(event.seq), kind: 'assistant', text } : null;
  }
  if (event.type.includes('tool')) return { id: String(event.seq), kind: 'tool', label: String(d.name ?? d.toolName ?? event.type), text: JSON.stringify(d, null, 2) };
  if (['turn/start', 'turn/end', 'attempt/start', 'attempt/started'].includes(event.type)) return null;
  return { id: String(event.seq), kind: 'event', label: event.type, text: JSON.stringify(d, null, 2) };
}
