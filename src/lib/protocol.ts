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
    if (item.type === 'text') return String(item.text ?? '');
    if (item.type === 'file') return `Attachment: ${(item.attachment as any)?.name ?? 'file'}`;
    if (item.type === 'image') return '[Image]';
  }
  return '';
}
function reasoningText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.filter((b: any) => b?.type === 'reasoning' || b?.type === 'thinking').map((b: any) => String(b.text ?? b.thinking ?? '')).filter(Boolean).join('\n');
}

/**
 * One row in the mobile chat. Mirrors the DSH web chat's node kinds
 * (dsh-client-ui-chat): user prompts, assistant replies with reasoning,
 * tool calls paired with their results, context injections, compaction,
 * system prompt, turn failures, and command rows.
 */
export type TranscriptRow =
  | { id: string; kind: 'user'; text: string; source?: string }
  | { id: string; kind: 'assistant'; text: string; reasoning?: string; interrupted?: boolean }
  | { id: string; kind: 'tool'; callId: string; name: string; args: string; result?: string; isError?: boolean; errorReason?: string; pending: boolean }
  | { id: string; kind: 'context'; label: string; summary?: string; text: string; icon: ContextIcon }
  | { id: string; kind: 'compaction'; state: 'running' | 'done' | 'failed'; summary?: string; tokens?: number; error?: string }
  | { id: string; kind: 'system'; text: string }
  | { id: string; kind: 'failure'; text: string; warning?: boolean }
  | { id: string; kind: 'notice'; label: string; text?: string }
  | { id: string; kind: 'event'; label: string; text: string };
export type ContextIcon = 'time' | 'goal' | 'skill' | 'plan' | 'schedule' | 'hook' | 'tools' | 'answer' | 'subagent' | 'webhook' | 'info';

/** Event types that carry no user-visible content (the web chat hides them too). */
const HIDDEN = new Set(['turn/start', 'step/start', 'step/end', 'request/header', 'request/context', 'session/end-seed', 'attempt/start', 'attempt/started', 'permission/preset', 'sandbox/mode', 'approval/policy', 'model/selection', 'session/title', 'agent/inbox/spliced', 'compaction/prune', 'goal/change', 'todo/write', 'tool/ptc-dispatch', 'tool/ptc-dispatch-start']);

/** How each user/message `source.kind` is presented. Unknown non-user kinds fall back to a generic context row. */
const CONTEXT_SOURCES: Record<string, { label: string; icon: ContextIcon; hidden?: boolean }> = {
  'runtime-context': { label: 'Runtime context', icon: 'info', hidden: true },
  'time-context': { label: 'Time context', icon: 'time', hidden: true },
  'tmux-context': { label: 'Terminal context', icon: 'info', hidden: true },
  'model-selection': { label: 'Model changed', icon: 'info' },
  goal: { label: 'Goal round', icon: 'goal' },
  'tool-goal': { label: 'Goal update', icon: 'goal' },
  'skill-invocation': { label: 'Skill loaded', icon: 'skill' },
  'plan-mode': { label: 'Plan mode', icon: 'plan' },
  schedule: { label: 'Scheduled reminder', icon: 'schedule' },
  'hooks-claude-code': { label: 'Hook output', icon: 'hook' },
  'hooks-codex': { label: 'Hook output', icon: 'hook' },
  'tool-registry': { label: 'Tools changed', icon: 'tools' },
  'ptc-mode': { label: 'Tool mode', icon: 'tools' },
  'tool-jobs': { label: 'Background job update', icon: 'tools' },
  'user-question-reply': { label: 'Your answer', icon: 'answer' },
  'user-approval': { label: 'Approval', icon: 'answer' },
  'repeat-tool-reminder': { label: 'Repeat-tool reminder', icon: 'info', hidden: true },
  'subagent-settled': { label: 'Subagent finished', icon: 'subagent' },
  webhook: { label: 'Webhook', icon: 'webhook' },
};

function contextRow(seq: number, source: Record<string, any>, text: string): TranscriptRow | null {
  const kind = String(source.kind ?? 'context');
  const known = CONTEXT_SOURCES[kind];
  // Ordinary context injections are omitted, as in the web chat; notices with a one-line summary stay visible.
  const summary = source.form === 'notice' && typeof source.summary === 'string' ? source.summary : undefined;
  if (known?.hidden && !summary) return null;
  if (!known && (source.form === 'instructions' || source.form === 'snapshot' || source.form === 'catalog') && !summary) return null;
  const label = kind === 'goal' && source.round ? `Goal round ${source.round}` : known?.label ?? kind.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase());
  return { id: String(seq), kind: 'context', label, summary, text, icon: known?.icon ?? 'info' };
}

function failureText(reason: any): string | null {
  if (!reason || reason.kind === 'completed') return null;
  if (reason.kind === 'error') { const e = reason.error ?? {}; return e.code === 'QUOTA' || e.code === 'ACCOUNT_QUOTA' ? 'Usage quota reached. Try again later.' : String(e.message ?? e.code ?? 'The turn failed.'); }
  if (reason.kind === 'aborted') return reason.reason?.kind === 'user' ? 'Stopped' : 'Turn cancelled';
  if (reason.kind === 'max-tokens') return 'Reached the output-token limit';
  if (reason.kind === 'blocked') return 'Turn blocked';
  if (reason.kind === 'interrupted') return 'Turn interrupted';
  return null;
}

/**
 * Fold the event log into chat rows. Tool calls are paired with their results by callId,
 * compaction start/summary/end collapse into one row, and bookkeeping events disappear.
 */
export function buildTranscript(events: readonly WireEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const tools = new Map<string, Extract<TranscriptRow, { kind: 'tool' }>>();
  const compactions = new Map<string, Extract<TranscriptRow, { kind: 'compaction' }>>();
  let lastSystem = '';
  for (const event of events) {
    const d = event.data ?? {};
    const id = String(event.seq);
    if (HIDDEN.has(event.type)) continue;
    switch (event.type) {
      case 'user/message':
      case 'message/user': {
        const source = (d.source ?? (d.message as any)?.source ?? {}) as Record<string, any>;
        const text = textContent(d.content ?? (d.message as any)?.content);
        if (!source.kind || source.kind === 'user') { if (text) rows.push({ id, kind: 'user', text }); break; }
        if (source.kind === 'compact-checkpoint') {
          // The replacement message carries the summary; show it on the compaction row instead of a duplicate.
          const latest = [...compactions.values()].pop();
          if (latest) latest.summary ||= text; else rows.push({ id, kind: 'compaction', state: 'done', summary: text });
          break;
        }
        const row = contextRow(event.seq, source, text); if (row) rows.push(row);
        break;
      }
      case 'system/message': {
        const text = textContent((d.message as any)?.content);
        // The web chat omits the system prompt; we keep one quiet collapsible row when it changes.
        if (text && text !== lastSystem) { lastSystem = text; rows.push({ id, kind: 'system', text }); }
        break;
      }
      case 'developer/message': {
        const text = textContent((d.message as any)?.content);
        if (text) rows.push({ id, kind: 'context', label: 'Session update', text, icon: 'tools' });
        break;
      }
      case 'assistant/message':
      case 'attempt/settled': {
        const message = (d.message ?? d.assistantMessage) as any;
        const text = textContent(message?.content ?? d.content);
        const reasoning = reasoningText(message?.content);
        if (text || reasoning) rows.push({ id, kind: 'assistant', text, reasoning: reasoning || undefined, interrupted: d.interrupted === true });
        break;
      }
      case 'assistant/attempt': {
        const failure = (d.stream as any[] | undefined)?.map(r => r?.chunk?.reason?.failure).find(Boolean);
        if (failure) rows.push({ id, kind: 'failure', text: `Generation failed: ${failure.message ?? failure.code ?? 'Unknown model error'}` });
        break;
      }
      case 'tool/call': {
        const row = { id, kind: 'tool' as const, callId: String(d.callId ?? id), name: String(d.name ?? 'tool'), args: String(d.arguments ?? ''), pending: true };
        tools.set(row.callId, row); rows.push(row);
        break;
      }
      case 'tool/result': {
        const message = d.message as any;
        const callId = String(message?.toolCallId ?? message?.source?.callId ?? '');
        const result = textContent(message?.content);
        const err = d.error as any;
        const row = tools.get(callId);
        if (row) { row.result = result; row.isError = !!message?.isError; row.errorReason = err?.reason; row.pending = false; }
        else rows.push({ id, kind: 'tool', callId: callId || id, name: 'Tool result', args: '', result, isError: !!message?.isError, errorReason: err?.reason, pending: false });
        break;
      }
      case 'compaction/start': {
        const row = { id, kind: 'compaction' as const, state: 'running' as const };
        compactions.set(String(d.compactionId ?? id), row); rows.push(row);
        break;
      }
      case 'compaction/summary': {
        const row = compactions.get(String(d.compactionId ?? ''));
        const summary = textContent(d.summary);
        if (row) { row.summary = summary; row.tokens = Number(d.shadowedTokenCount) || undefined; }
        else rows.push({ id, kind: 'compaction', state: 'done', summary, tokens: Number(d.shadowedTokenCount) || undefined });
        break;
      }
      case 'compaction/end': {
        const row = compactions.get(String(d.compactionId ?? ''));
        if (row) { (row as any).state = d.error ? 'failed' : 'done'; if (d.error) row.error = String(d.error); }
        break;
      }
      case 'turn/end': {
        const text = failureText(d.reason);
        if (text) rows.push({ id, kind: 'failure', text, warning: (d.reason as any)?.kind !== 'error' });
        break;
      }
      case 'command/run':
      case 'command/done': {
        if (event.type === 'command/run') rows.push({ id, kind: 'notice', label: `/${String(d.name ?? d.command ?? 'command').replace(/^\//, '')}`, text: typeof d.line === 'string' ? d.line : undefined });
        break;
      }
      default:
        if (event.type.startsWith('tool/')) break;
        rows.push({ id, kind: 'event', label: event.type, text: JSON.stringify(d, null, 2) });
    }
  }
  return rows;
}

/** @deprecated kept for tests; prefer buildTranscript. */
export function projectEvent(event: WireEvent): TranscriptRow | null {
  return buildTranscript([event])[0] ?? null;
}

/** Short human title for a tool call, like the web chat's tool rows ("Ran npm test", "Read app.tsx"). */
export function toolTitle(name: string, args: string): { verb: string; target: string } {
  let a: Record<string, any> = {};
  try { a = JSON.parse(args || '{}'); } catch { /* raw args */ }
  const base = (p: unknown) => typeof p === 'string' ? p.split('/').filter(Boolean).pop() ?? p : '';
  const n = name.toLowerCase();
  if (/bash|shell|pwsh|exec|command|run_code/.test(n)) return { verb: n.includes('run_code') ? 'Ran code' : 'Ran', target: String(a.command ?? a.cmd ?? a.description ?? '').split('\n')[0] };
  if (/^read|read_file|view/.test(n)) return { verb: 'Read', target: base(a.file_path ?? a.path) };
  if (/write|create_file/.test(n)) return { verb: 'Wrote', target: base(a.file_path ?? a.path) };
  if (/edit|str_replace|patch/.test(n)) return { verb: 'Edited', target: base(a.file_path ?? a.path) };
  if (/grep|search_files|find/.test(n)) return { verb: 'Searched', target: String(a.pattern ?? a.query ?? '') };
  if (/glob|list|ls/.test(n)) return { verb: 'Listed', target: String(a.pattern ?? a.path ?? '') };
  if (/web_search|search/.test(n)) return { verb: 'Searched the web', target: Array.isArray(a.queries) ? a.queries.join(', ') : String(a.query ?? '') };
  if (/fetch/.test(n)) return { verb: 'Fetched', target: String(a.url ?? '') };
  if (/todo/.test(n)) return { verb: 'Updated todos', target: '' };
  if (/subagent|agent/.test(n)) return { verb: 'Delegated', target: String(a.description ?? '') };
  if (/ask_user|question/.test(n)) return { verb: 'Asked you', target: '' };
  if (/skill/.test(n)) return { verb: 'Used skill', target: String(a.name ?? '') };
  if (/goal/.test(n)) return { verb: 'Updated goal', target: '' };
  return { verb: name.replace(/^mcp__\w+__/, '').replace(/[_-]/g, ' '), target: '' };
}
