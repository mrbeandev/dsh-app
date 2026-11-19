import type { Session } from './protocol';

type Values = Record<string, unknown>;

/** Merge projection values into one session (newer keys win). */
export function withValues(s: Session, values: Values | undefined): Session {
  if (!values || !Object.keys(values).length) return s;
  return { ...s, projections: { ...s.projections, values: { ...s.projections?.values, ...values } } };
}

/** session/control baseline: `{ projections: { [sessionId]: { asOfSeq, values } } }`. */
export function applyBaseline(sessions: Session[], baseline: { projections?: Record<string, { values?: Values } | undefined> } | undefined): Session[] {
  const all = baseline?.projections ?? {};
  return sessions.map(s => withValues(s, all[s.sessionId]?.values));
}

/** session/list refresh: list items carry partial hints only, so keep live values we already have. */
export function mergeRefreshed(previous: Session[], items: Session[]): Session[] {
  const prev = new Map(previous.map(x => [x.sessionId, x] as const));
  return items.map(x => withValues(x, prev.get(x.sessionId)?.projections?.values as Values | undefined));
}

/**
 * A live `session/control` projection frame → the key/value pairs it changes.
 * Harness 0.2.2 sends `{ sessionId, seq, changes: [{ key, val }] }`; 0.2.0/0.2.1 sent `{ key, value }`.
 * Reading only the old shape dropped every live queue/steering update on 0.2.2, so the inbox (and the
 * Sending/Steering state) only caught up on the next full refresh, minutes later.
 */
export function projectionChanges(frame: { key?: string; value?: unknown; changes?: readonly { key: string; val?: unknown; value?: unknown }[] }): Values {
  const out: Values = {};
  if (Array.isArray(frame.changes)) for (const c of frame.changes) if (c && typeof c.key === 'string') out[c.key] = (c.val !== undefined ? c.val : c.value) as never;
  if (typeof frame.key === 'string') out[frame.key] = frame.value as never;
  return out;
}
