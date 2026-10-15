import { describe, expect, it } from 'vitest';
import { emptyUnseen, markSeen, observeRunning, prune } from './unseen';

describe('finished-unseen (Web UI completionUnread)', () => {
  it('marks a thread that stops while not on screen', () => {
    let s = observeRunning(emptyUnseen(), 'A', true);
    s = observeRunning(s, 'A', false);
    expect(s.unseen).toEqual(['A']);
  });
  it('does not mark the thread you are looking at, or one never seen running', () => {
    let s = observeRunning(emptyUnseen(), 'A', true);
    s = observeRunning(s, 'A', false, 'A');
    expect(s.unseen).toEqual([]);
    expect(observeRunning(emptyUnseen(), 'B', false).unseen).toEqual([]);
  });
  it('clears on open and when it runs again', () => {
    let s = observeRunning(observeRunning(emptyUnseen(), 'A', true), 'A', false);
    expect(markSeen(s, 'A').unseen).toEqual([]);
    s = observeRunning(s, 'A', true);
    expect(s.unseen).toEqual([]);
  });
  it('prunes threads that are gone', () => {
    const s = observeRunning(observeRunning(emptyUnseen(), 'A', true), 'A', false);
    expect(prune(s, new Set(['B'])).unseen).toEqual([]);
  });
});
