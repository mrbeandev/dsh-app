/**
 * Decide which agent events deserve a notification. Pure, so it is unit-tested; delivery lives in
 * state/notifications.tsx.
 *
 * Inputs the app already receives live:
 *  - `api-session/status` running→idle transitions (agent stopped),
 *  - `$events` waterfall requests (questions, approvals, plan reviews),
 *  - the thread's latest `turn/end` reason (completed / aborted / error / max-tokens / blocked / interrupted).
 */
export type Kind = 'input' | 'finished' | 'failed' | 'stopped';
export type Alert = { kind: Kind; sessionId: string; title: string; body: string };
export const CHANNELS: Record<Kind, { id: string; name: string; description: string; high: boolean }> = {
  input: { id: 'dsh-input', name: 'Needs your input', description: 'The agent asked a question, needs an approval, or wants you to review a plan.', high: true },
  failed: { id: 'dsh-failed', name: 'Failed', description: 'A turn ended with an error or the agent crashed.', high: true },
  finished: { id: 'dsh-finished', name: 'Finished', description: 'The agent finished working on a session.', high: false },
  stopped: { id: 'dsh-stopped', name: 'Stopped', description: 'A turn was cancelled or interrupted (not by you).', high: false },
};

export type TurnEnd = { kind?: string; reason?: { kind?: string }; error?: { message?: string; code?: string } } | undefined;

/** What a finished turn means for notifications (null = nothing to say). */
export function endAlert(end: TurnEnd, sessionId: string, title: string, lastReply: string, stoppedByMe: boolean): Alert | null {
  const k = end?.kind ?? 'completed';
  if (k === 'completed') return { kind: 'finished', sessionId, title, body: preview(lastReply) || 'Finished.' };
  if (k === 'error') {
    const e = end?.error ?? {};
    const msg = e.code === 'QUOTA' || e.code === 'ACCOUNT_QUOTA' ? 'Usage quota reached.' : String(e.message ?? e.code ?? 'The turn failed.');
    return { kind: 'failed', sessionId, title, body: firstLine(msg) };
  }
  if (k === 'aborted') return stoppedByMe || end?.reason?.kind === 'user' ? null : { kind: 'stopped', sessionId, title, body: 'The turn was cancelled.' };
  if (k === 'max-tokens') return { kind: 'failed', sessionId, title, body: 'Stopped: reached the output-token limit.' };
  if (k === 'blocked') return { kind: 'failed', sessionId, title, body: 'The turn was blocked.' };
  if (k === 'interrupted') return { kind: 'stopped', sessionId, title, body: 'The turn was interrupted.' };
  return { kind: 'finished', sessionId, title, body: preview(lastReply) || 'Finished.' };
}

/**
 * A pending request → "needs input" alert. Wire shape (as the app already renders them):
 * `{ event, agentId, eventId, request }` — approvals have `event === 'approval/request'`;
 * questions carry `request.questions[]`, and a plan review is a question with `intent.kind === 'plan-review'`.
 */
export function requestAlert(frame: any, title: string): Alert | null {
  const sessionId = String(frame?.agentId ?? '');
  if (!sessionId) return null;
  const req = frame?.request ?? {};
  const questions: any[] = Array.isArray(req.questions) ? req.questions : [];
  if (questions.some(q => q?.intent?.kind === 'plan-review')) return { kind: 'input', sessionId, title, body: 'Plan ready for your review.' };
  if (frame?.event === 'approval/request') {
    const tool = req.toolName ?? req.tool?.name ?? req.tool ?? req.name;
    return { kind: 'input', sessionId, title, body: `Approval needed${typeof tool === 'string' && tool ? `: ${tool}` : ''}.` };
  }
  const q = questions[0];
  return { kind: 'input', sessionId, title, body: firstLine(String(q?.question ?? q?.header ?? req.question ?? '')) || 'The agent is waiting for your answer.' };
}

/**
 * Reply preview: the reply's opening, several lines joined, so short answers show whole
 * ("1 · 2 · 3 · BG_DONE") and long ones start with their first sentence. Android shows ~2 lines
 * collapsed and the full text expanded.
 */
export function preview(text: string, max = 240) {
  const lines = String(text ?? '').split('\n').map(l => firstLine(l, max)).filter(Boolean);
  const joined = lines.join(' · ');
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

export function firstLine(text: string, max = 140) {
  // Strip Markdown syntax only where it is syntax: heading/quote markers at line start, emphasis
  // markers around words, code ticks. Underscores and asterisks inside words (NOTIFY_OK) stay.
  const line = String(text ?? '').split('\n').map(l => l.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, '')
    .replace(/`+/g, '').replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2').replace(/(^|[^\w])[*_](?=\S)(.+?)(?<=\S)[*_](?=[^\w]|$)/g, '$1$2').trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Suppress alerts for the thread on screen while the app is in the foreground. */
export function shouldDeliver(alert: Alert, ctx: { foreground: boolean; viewing?: string; enabled: Record<Kind, boolean> }) {
  if (!ctx.enabled[alert.kind]) return false;
  if (ctx.foreground && ctx.viewing === alert.sessionId) return false;
  return true;
}
