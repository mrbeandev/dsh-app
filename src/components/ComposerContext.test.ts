import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 }, LayoutAnimation: {} }));
vi.mock('@expo/vector-icons', () => ({}));
vi.mock('../state/app', () => ({}));
vi.mock('./Dialog', () => ({}));
vi.mock('./ui', () => ({}));
vi.mock('../lib/harness', () => ({ errorMessage: String }));
const { toQueueItem } = await import('./ComposerContext');

describe('inbox queue items (Harness UserMessage wire JSON)', () => {
  it('reads id and text', () => {
    expect(toQueueItem({ id: 'm1', role: 'user', content: [{ type: 'text', text: 'also add tests' }], source: { kind: 'human' } }))
      .toEqual({ id: 'm1', text: 'also add tests', editable: true });
  });
  it('joins multiple text blocks; images make it non-editable', () => {
    expect(toQueueItem({ id: 'm2', content: [{ type: 'text', text: 'look' }, { type: 'image', attachmentId: 'a' }] }))
      .toEqual({ id: 'm2', text: 'look', editable: false });
    expect(toQueueItem({ id: 'm3', content: [{ type: 'image' }, { type: 'image' }] })?.text).toBe('2 attachments');
  });
  it('skips malformed entries', () => {
    expect(toQueueItem(null)).toBeNull();
    expect(toQueueItem({ content: [] })).toBeNull();
  });
});
