import { describe, expect, it } from 'vitest';
import { expandStream, streamText } from './stream';
describe('assistant stream baseline', () => {
  it('expands compact text while keeping reasoning out of visible response', () => {
    const chunks = expandStream([{ type: 'text-chunks', index: 0, texts: ['Hello', ' world'], dt: [1] }, { type: 'reasoning-chunks', index: 1, texts: ['private thought'], dt: [] }]);
    expect(chunks).toHaveLength(3); expect(streamText(chunks)).toBe('Hello world');
  });
  it('drops an entire malformed prefix', () => expect(expandStream([{ type: 'text-chunks', index: 0, texts: ['a', 'b'], dt: [] }])).toEqual([]));
});
