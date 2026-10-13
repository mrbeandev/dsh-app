import type { Frame, Session } from './protocol';
export type WorkspaceGroup = { id: string; title: string; path: string; updatedAt: number; sessions: Session[] };
export function groupWorkspaces(sessions: Session[], workspaces: Frame[]): WorkspaceGroup[] {
  const assigned = new Set<string>();
  const groups: WorkspaceGroup[] = workspaces.map(w => {
    const rows = sessions.filter(s => !assigned.has(s.sessionId) && (w.sessionIds?.includes(s.sessionId) || s.cwd === w.path));
    rows.forEach(s => assigned.add(s.sessionId));
    return { id: w.workspaceId, title: w.title, path: w.path, updatedAt: Math.max(Date.parse(w.updatedAt) || 0, ...rows.map(s => s.updatedAt)), sessions: rows.sort((a, b) => b.updatedAt - a.updatedAt) };
  });
  for (const session of sessions) {
    if (assigned.has(session.sessionId)) continue;
    const path = session.cwd ?? ''; const id = `path:${path}`;
    let group = groups.find(g => g.id === id);
    if (!group) { group = { id, title: path.split('/').filter(Boolean).pop() ?? 'Other threads', path, updatedAt: 0, sessions: [] }; groups.push(group); }
    group.sessions.push(session); group.updatedAt = Math.max(group.updatedAt, session.updatedAt);
  }
  return groups.map(g => ({ ...g, sessions: g.sessions.sort((a, b) => b.updatedAt - a.updatedAt) })).sort((a, b) => b.updatedAt - a.updatedAt);
}
