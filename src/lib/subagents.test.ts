import { describe, expect, it } from 'vitest';
import { childIndex, countTree, historyAddress, subagentTree } from './subagents';
import { isListedSession, type Session } from './protocol';

const s = (id: string, extra: Partial<Session> = {}): Session => ({ sessionId: id, updatedAt: 1, running: false, blank: false, ...extra });
const root = s('root', { projections: { values: { subagentCatalog: [{ id: 'c1', label: 'reviewer', mode: 'continuable', createdAt: 1 }] } } });
const c1 = s('c1', { origin: 'subagent', parentSessionId: 'root', updatedAt: 5 });
const c2 = s('c2', { origin: 'subagent', parentSessionId: 'root', updatedAt: 9, projections: { values: { subagent: { mode: 'one-shot', label: 'search', seq: 3 } } } });
const g1 = s('g1', { origin: 'subagent', parentSessionId: 'c1' });
const gg = s('gg', { origin: 'subagent', parentSessionId: 'g1' });
const ggg = s('ggg', { origin: 'subagent', parentSessionId: 'gg' });
const all = [root, c1, c2, g1, gg, ggg, s('blank', { blank: true })];

describe('subagent threads (Web UI parity)', () => {
  it('lists only top-level, non-blank threads like the Web UI sidebar', () => {
    expect(all.filter(x => isListedSession(x)).map(x => x.sessionId)).toEqual(['root']);
    expect(isListedSession(s('blank', { blank: true }), 'blank')).toBe(true);
  });
  it('builds a tree up to 3 levels, newest child first, with labels and modes', () => {
    const tree = subagentTree(root, childIndex(all), new Map(all.map(x => [x.sessionId, x])));
    expect(tree.map(n => [n.session.sessionId, n.label, n.mode])).toEqual([['c2', 'search', 'one-shot'], ['c1', 'reviewer', 'continuable']]);
    expect(tree[1].children[0].session.sessionId).toBe('g1');
    expect(tree[1].children[0].children[0].session.sessionId).toBe('gg');
    expect(tree[1].children[0].children[0].children).toEqual([]); // depth 4 is cut off
    expect(countTree(tree)).toBe(4);
  });
  it('opens children with the subagent address form', () => {
    expect(historyAddress(c1, 'c1', root)).toEqual({ kind: 'subagent', parentSessionId: 'root', childSessionId: 'c1', mode: 'continuable' });
    expect(historyAddress(root, 'root')).toEqual({ kind: 'session', sessionId: 'root' });
  });
});
