import { describe, expect, it } from 'vitest';
import { workspaceStatus, workspaceStatusLabel } from './workspaceStatus';

type S = { id: string; input?: boolean; working?: boolean; unseen?: boolean };
const is = { input: (s: S) => !!s.input, working: (s: S) => !!s.working, unseen: (s: S) => !!s.unseen };
describe('workspace status roll-up', () => {
  it('shows finished-unseen on the workspace when nothing else is going on', () => {
    expect(workspaceStatus<S>([{ id: 'a' }, { id: 'b', unseen: true }], is).kind).toBe('unseen');
  });
  it('picks the most urgent: input > working > unseen', () => {
    expect(workspaceStatus<S>([{ id: 'a', unseen: true }, { id: 'b', working: true }], is).kind).toBe('working');
    expect(workspaceStatus<S>([{ id: 'a', working: true }, { id: 'b', input: true }, { id: 'c', unseen: true }], is).kind).toBe('input');
    expect(workspaceStatus<S>([{ id: 'a' }], is).kind).toBe('none');
  });
  it('counts each session once and describes the counts', () => {
    const r = workspaceStatus<S>([{ id: 'a', input: true, working: true }, { id: 'b', unseen: true }, { id: 'c', unseen: true }], is);
    expect(r.counts).toEqual({ input: 1, working: 0, unseen: 2 });
    expect(workspaceStatusLabel(r.counts)).toBe('1 needs your answer, 2 finished, not opened');
  });
});
