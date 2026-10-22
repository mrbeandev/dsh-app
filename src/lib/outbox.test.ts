import { beforeEach, describe, expect, it, vi } from 'vitest';

const table = vi.hoisted(() => new Map<string, { url: string; session_id: string; data: string; created_at: number }>());
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => ({
    execAsync: async () => {},
    getAllAsync: async (sql: string, ...a: string[]) => [...table.values()]
      .filter(r => (!a[0] || r.url === a[0]) && (!a[1] || r.session_id === a[1]))
      .sort((x, y) => x.created_at - y.created_at).map(r => ({ data: r.data })),
    runAsync: async (sql: string, ...a: any[]) => {
      if (sql.startsWith('INSERT')) table.set(a[0], { url: a[1], session_id: a[2], data: a[3], created_at: a[4] });
      else if (sql.startsWith('UPDATE')) { const r = table.get(a[1]); if (r) r.data = a[0]; }
      else if (sql.includes('WHERE id=?')) table.delete(a[0]);
      else for (const [k, r] of [...table]) if (r.url === a[0]) table.delete(k);
    },
  }),
}));
const ob = await import('./outbox');

const net = new Error('Network request failed');
const transport = (e: unknown) => e === net;
const msg = (e: unknown) => (e as Error).message;
let clock = 1000;
beforeEach(() => { table.clear(); clock = 1000; vi.spyOn(Date, 'now').mockImplementation(() => clock++); });

const add = (id: string, text: string, sessionId = 's1', url = 'h') => ob.enqueue({ id, url, sessionId, text, parts: [{ type: 'text', text }], mode: 'queue' });

describe('offline outbox', () => {
  it('keeps as many messages as you send, per session, in the order typed', async () => {
    await add('a', 'first'); await add('b', 'second'); await add('c', 'third'); await add('x', 'other chat', 's2');
    expect((await ob.listOutbox('h', 's1')).map(i => i.text)).toEqual(['first', 'second', 'third']);
    expect((await ob.listOutbox('h', 's2')).map(i => i.text)).toEqual(['other chat']);
  });

  it('delivers one by one in order once connected and clears each as it goes', async () => {
    await add('a', 'first'); await add('b', 'second'); await add('c', 'third');
    const delivered: string[] = [];
    const r = await ob.drainOutbox('h', async i => { delivered.push(i.id); }, transport, msg);
    expect(delivered).toEqual(['a', 'b', 'c']);
    expect(r).toEqual({ sent: 3, failed: 0 });
    expect(await ob.listOutbox('h')).toEqual([]);
  });

  it('stops at the first network failure and keeps the rest queued in order', async () => {
    await add('a', 'first'); await add('b', 'second'); await add('c', 'third');
    const r = await ob.drainOutbox('h', async i => { if (i.id === 'b') throw net; }, transport, msg);
    expect(r.sent).toBe(1);
    expect((await ob.listOutbox('h')).map(i => i.id)).toEqual(['b', 'c']);
    expect((await ob.listOutbox('h'))[0].error).toBeUndefined(); // will retry automatically
  });

  it('marks a message the Harness rejects, keeps it for the user, and continues with the rest', async () => {
    await add('a', 'bad'); await add('b', 'good');
    const r = await ob.drainOutbox('h', async i => { if (i.id === 'a') throw new Error('Session not found'); }, transport, msg);
    expect(r).toEqual({ sent: 1, failed: 1 });
    const left = await ob.listOutbox('h');
    expect(left.map(i => [i.id, i.error])).toEqual([['a', 'Session not found']]);
  });

  it('notifies listeners on change and clears per Harness', async () => {
    const seen = vi.fn(); const off = ob.onOutboxChange(seen);
    await add('a', 'one'); await add('b', 'two', 's1', 'other');
    await ob.clearOutboxFor('h');
    expect((await ob.listOutbox()).map(i => i.id)).toEqual(['b']);
    expect(seen).toHaveBeenCalled(); off();
  });
});
