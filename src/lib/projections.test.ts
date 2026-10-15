import { describe, expect, it } from 'vitest';
import { applyBaseline, mergeRefreshed } from './projections';
import type { Session } from './protocol';

const inbox = { 'next-turn': [{ id: 'm1', role: 'user', content: [{ type: 'text', text: 'queued one' }] }, { id: 'm2', role: 'user', content: [{ type: 'text', text: 'queued two' }] }], 'next-step': [] };
const s = (id: string, extra: Partial<Session> = {}): Session => ({ sessionId: id, updatedAt: 1, running: true, blank: false, ...extra });

describe('live projections (queue survives navigation)', () => {
  it('session/control baseline puts values (not the wrapper) on the session', () => {
    const [a] = applyBaseline([s('A')], { projections: { A: { values: { inbox } } } });
    expect((a.projections?.values as any).inbox['next-turn']).toHaveLength(2);
    expect((a.projections?.values as any).values).toBeUndefined();
  });
  it('a thread-list refresh keeps the queue that arrived live', () => {
    const live = applyBaseline([s('A')], { projections: { A: { values: { inbox } } } });
    // session/list items only carry partial hints (here: no inbox at all)
    const [a] = mergeRefreshed(live, [s('A', { projections: { values: { title: 'T' } } as any })]);
    expect((a.projections?.values as any).inbox['next-turn'].map((m: any) => m.id)).toEqual(['m1', 'm2']);
    expect((a.projections?.values as any).title).toBe('T');
  });
  it('an emptied queue (projection update) replaces the old one', () => {
    const live = applyBaseline([s('A')], { projections: { A: { values: { inbox } } } });
    const [a] = applyBaseline(live, { projections: { A: { values: { inbox: { 'next-turn': [], 'next-step': [] } } } } });
    expect((a.projections?.values as any).inbox['next-turn']).toHaveLength(0);
  });
});
