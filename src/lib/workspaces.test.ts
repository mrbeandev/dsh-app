import { expect, it } from 'vitest';
import { groupWorkspaces } from './workspaces';
it('sorts workspaces by latest session then sessions newest first', () => {
 const sessions = [{ sessionId: 'old', updatedAt: 10, cwd: '/a', running: false, blank: false }, { sessionId: 'new', updatedAt: 30, cwd: '/a', running: true, blank: false }, { sessionId: 'b', updatedAt: 20, cwd: '/b', running: false, blank: false }];
 const groups = groupWorkspaces(sessions, []);
 expect(groups.map(g => g.path)).toEqual(['/a', '/b']); expect(groups[0].sessions.map(s => s.sessionId)).toEqual(['new', 'old']);
});
it('keeps registered empty workspaces and assigns sessions only once', () => {
 const groups = groupWorkspaces([{ sessionId: 'x', updatedAt: 5, cwd: '/a', running: false, blank: true }], [{ workspaceId: 'a', title: 'Project A', path: '/a', sessionIds: ['x'], updatedAt: '2026-01-01' }, { workspaceId: 'b', title: 'Project B', path: '/b', sessionIds: [], updatedAt: '2025-01-01' }]);
 expect(groups).toHaveLength(2); expect(groups.flatMap(g => g.sessions)).toHaveLength(1);
});
