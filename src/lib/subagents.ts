import type { Session } from './protocol';

/**
 * Subagent threads, as the DSH Web UI models them:
 * - every child session has `origin: 'subagent'` and `parentSessionId`;
 * - its own `subagent` projection carries `mode` ('one-shot' | 'continuable') and `label`;
 * - the parent's `subagentCatalog` projection lists direct children (id, label, mode, createdAt).
 * Children are opened with a `{ kind: 'subagent', parentSessionId, childSessionId, mode }` address —
 * a plain `{ kind: 'session' }` address is refused for child sessions.
 */
export type SubagentNode = { session: Session; label: string; mode: 'one-shot' | 'continuable' | 'unknown'; depth: number; children: SubagentNode[] };
export const MAX_DEPTH = 3;

const proj = (s: Session | undefined, k: string) => (s?.projections?.values as Record<string, any> | undefined)?.[k];

export function subagentMode(child: Session, parent?: Session): SubagentNode['mode'] {
  const own = proj(child, 'subagent');
  if (own?.mode === 'one-shot' || own?.mode === 'continuable') return own.mode;
  const row = (proj(parent, 'subagentCatalog') as any[] | undefined)?.find(e => e?.id === child.sessionId);
  return row?.mode === 'one-shot' || row?.mode === 'continuable' ? row.mode : 'unknown';
}

export function subagentLabel(child: Session, parent?: Session) {
  const own = proj(child, 'subagent')?.label;
  const row = (proj(parent, 'subagentCatalog') as any[] | undefined)?.find(e => e?.id === child.sessionId);
  const title = proj(child, 'title');
  return String(own || row?.label || title || 'Subagent');
}

/** Children of every session, keyed by parent id, newest activity first. */
export function childIndex(sessions: readonly Session[]) {
  const map = new Map<string, Session[]>();
  for (const s of sessions) if (s.origin === 'subagent' && s.parentSessionId) {
    const list = map.get(s.parentSessionId) ?? []; list.push(s); map.set(s.parentSessionId, list);
  }
  for (const list of map.values()) list.sort((a, b) => b.updatedAt - a.updatedAt);
  return map;
}

/** Subagent tree under one top-level thread, up to MAX_DEPTH levels (cycles guarded). */
export function subagentTree(root: Session, index: Map<string, Session[]>, byId: Map<string, Session>, depth = 1, seen = new Set<string>()): SubagentNode[] {
  if (depth > MAX_DEPTH || seen.has(root.sessionId)) return [];
  seen.add(root.sessionId);
  return (index.get(root.sessionId) ?? []).map(child => ({
    session: child, depth,
    label: subagentLabel(child, byId.get(root.sessionId)),
    mode: subagentMode(child, byId.get(root.sessionId)),
    children: subagentTree(child, index, byId, depth + 1, seen),
  }));
}

export const countTree = (nodes: SubagentNode[]): number => nodes.reduce((n, x) => n + 1 + countTree(x.children), 0);
export const anyRunning = (nodes: SubagentNode[]): boolean => nodes.some(x => x.session.running || anyRunning(x.children));

/** History address for a thread: subagent children need the subagent address form. */
export function historyAddress(session: Session | undefined, sessionId: string, parent?: Session) {
  if (session?.origin === 'subagent' && session.parentSessionId) {
    return { kind: 'subagent' as const, parentSessionId: session.parentSessionId, childSessionId: sessionId, mode: subagentMode(session, parent) };
  }
  return { kind: 'session' as const, sessionId };
}
