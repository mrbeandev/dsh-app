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
