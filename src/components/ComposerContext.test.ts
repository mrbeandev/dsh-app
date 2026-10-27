import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
vi.mock('react-native', () => ({ StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 }, LayoutAnimation: {} }));
vi.mock('@expo/vector-icons', () => ({}));
vi.mock('../state/app', () => ({}));
vi.mock('./Dialog', () => ({}));
vi.mock('./ui', () => ({}));
vi.mock('../lib/harness', () => ({ errorMessage: String }));
const { toQueueItem, runQueuedNow } = await import('./ComposerContext');

describe('inbox queue items (Harness UserMessage wire JSON)', () => {
  it('reads id and text', () => {
    expect(toQueueItem({ id: 'm1', role: 'user', content: [{ type: 'text', text: 'also add tests' }], source: { kind: 'human' } }))
      .toMatchObject({ id: 'm1', text: 'also add tests', editable: true });
  });
  it('joins multiple text blocks; images make it non-editable', () => {
    expect(toQueueItem({ id: 'm2', content: [{ type: 'text', text: 'look' }, { type: 'image', attachmentId: 'a' }] }))
      .toMatchObject({ id: 'm2', text: 'look', editable: false });
    expect(toQueueItem({ id: 'm3', content: [{ type: 'image' }, { type: 'image' }] })?.text).toBe('2 attachments');
  });
  it('skips malformed entries', () => {
    expect(toQueueItem(null)).toBeNull();
    expect(toQueueItem({ content: [] })).toBeNull();
  });
});

describe('runQueuedNow (send a queued message while the agent is idle)', () => {
  it('removes the queue row, then prompts the same content', async () => {
    const calls: [string, any][] = [];
    const client = { request: async (m: string, p: any) => { calls.push([m, p]); return {}; } };
    const content = [{ type: 'text', text: 'next please' }];
    await runQueuedNow(client, 's1', { id: 'q1', content });
    expect(calls.map(c => c[0])).toEqual(['session/updateQueue', 'session/prompt']);
    expect(calls[0][1]).toEqual({ sessionId: 's1', itemId: 'q1', action: { kind: 'remove' } });
    expect(calls[1][1]).toMatchObject({ sessionId: 's1', mode: 'queue', content });
  });
  it('does not prompt if the item could not be removed (already ran)', async () => {
    const calls: string[] = [];
    const client = { request: async (m: string) => { calls.push(m); if (m === 'session/updateQueue') throw new Error('queued item is no longer pending'); return {}; } };
    await expect(runQueuedNow(client, 's1', { id: 'q1', content: [] })).rejects.toThrow();
    expect(calls).toEqual(['session/updateQueue']);
  });
});

describe('take a steering message back', () => {
  it('removes the steering item and re-queues the same content (delivered after the turn)', async () => {
    const { unsteerToQueue } = await import('./ComposerContext');
    const calls: [string, any][] = [];
    const client = { request: async (m: string, p: any) => { calls.push([m, p]); return {}; } };
    const content = [{ type: 'text', text: 'use the staging DB instead' }];
    await unsteerToQueue(client, 's1', { id: 'm7', content });
    expect(calls[0]).toEqual(['session/updateQueue', { sessionId: 's1', itemId: 'm7', action: { kind: 'remove' } }]);
    expect(calls[1][0]).toBe('session/prompt');
    expect(calls[1][1]).toMatchObject({ sessionId: 's1', mode: 'queue', content });
  });
  it('changes nothing when the agent already took it (remove fails)', async () => {
    const { unsteerToQueue } = await import('./ComposerContext');
    const calls: string[] = [];
    const client = { request: async (m: string) => { calls.push(m); if (m === 'session/updateQueue') throw Object.assign(new Error('queued item is no longer pending'), { code: 'session/queue-item-not-found' }); return {}; } };
    await expect(unsteerToQueue(client, 's1', { id: 'm7', content: [] })).rejects.toThrow(/no longer pending/);
    expect(calls).toEqual(['session/updateQueue']);
  });
});
