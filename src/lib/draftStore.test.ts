import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the SQLite table.
const table = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    getAllAsync: async () => [...table.entries()].map(([k, text]) => { const [url, session_id] = k.split('\u0000'); return { url, session_id, text }; }),
    runAsync: async (sql: string, ...a: string[]) => {
      if (sql.startsWith('INSERT')) table.set(`${a[0]}\u0000${a[1]}`, a[2]);
      else if (sql.includes('session_id=?')) table.delete(`${a[0]}\u0000${a[1]}`);
      else for (const k of [...table.keys()]) if (k.startsWith(`${a[0]}\u0000`)) table.delete(k);
    },
  }),
}));
const store = await import('./draftStore');

beforeEach(() => { vi.useRealTimers(); });

describe('draft cache', () => {
  it('keeps unsent text per session and returns it immediately on reopen', async () => {
    store.saveDraft('h1', 'a', 'half-typed prompt');
    store.saveDraft('h1', 'b', 'other chat');
    expect(store.peekDraft('h1', 'a')).toBe('half-typed prompt');
    expect(store.peekDraft('h1', 'b')).toBe('other chat');
    expect(store.peekDraft('h2', 'a')).toBe(''); // separate per Harness
  });

  it('writes to disk after typing pauses, or immediately on flush', async () => {
    vi.useFakeTimers();
    store.saveDraft('h1', 'c', 'typing…');
    expect(table.get('h1\u0000c')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);
    expect(table.get('h1\u0000c')).toBe('typing…');
    store.saveDraft('h1', 'c', 'typing… more');
    await store.flushDraft('h1', 'c');
    expect(table.get('h1\u0000c')).toBe('typing… more');
  });

  it('is only removed once the message is sent', async () => {
    store.saveDraft('h1', 'd', 'send me');
    await store.flushDraft('h1', 'd');
    await store.clearDraft('h1', 'd');
    expect(store.peekDraft('h1', 'd')).toBe('');
    expect(table.has('h1\u0000d')).toBe(false);
  });

  it('clearing a draft to empty text deletes the saved row', async () => {
    store.saveDraft('h1', 'e', 'x'); await store.flushDraft('h1', 'e');
    store.saveDraft('h1', 'e', ''); await store.flushDraft('h1', 'e');
    expect(table.has('h1\u0000e')).toBe(false);
  });

  it('clearing a Harness cache drops its drafts', async () => {
    store.saveDraft('h3', 'f', 'x'); await store.flushDraft('h3', 'f');
    await store.clearDraftsFor('h3');
    expect(store.peekDraft('h3', 'f')).toBe('');
    expect(table.has('h3\u0000f')).toBe(false);
  });
});
