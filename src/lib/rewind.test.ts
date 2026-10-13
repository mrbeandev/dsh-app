import { expect, it } from 'vitest';
import { cutBefore } from './rewind';

it('cuts before the whole turn that carries the target message (live Harness event shape)', () => {
  const log = [
    [103, 'assistant/message'], [104, 'step/end'], [105, 'turn/end'],
    [106, 'agent/inbox/spliced'], [107, 'turn/start'], [108, 'agent/inbox/spliced'], [109, 'step/start'], [110, 'user/message'],
    [111, 'assistant/message'],
  ].map(([seq, type]) => ({ seq: seq as number, type: type as string }));
  expect(cutBefore(log, 110)).toBe(105);
});
it('falls back to the event before the message when it is not in the loaded page', () => {
  expect(cutBefore([{ seq: 5, type: 'turn/end' }], 42)).toBe(41);
});
it('handles the very first message', () => {
  expect(cutBefore([{ seq: 1, type: 'session/start' }, { seq: 2, type: 'turn/start' }, { seq: 3, type: 'user/message' }], 3)).toBe(1);
});
