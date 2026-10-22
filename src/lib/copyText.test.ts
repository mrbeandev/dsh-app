import { describe, expect, it } from 'vitest';
import { replyText, rowsToText } from './copyText';
import type { TranscriptRow } from './protocol';

describe('copy reply text', () => {
  it('copies just the answer', () => {
    expect(replyText({ id: '9', kind: 'assistant', text: '  **Done.** See https://x.dev  ' })).toBe('**Done.** See https://x.dev');
  });
  it('renders a whole turn with thinking, tool inputs/outputs and the reply, in order', () => {
    const rows: TranscriptRow[] = [
      { id: '1', kind: 'assistant', text: '', reasoning: 'Check the logs first.' },
      { id: '2', kind: 'tool', callId: 'c', name: 'bash', args: '{"command":"ls","description":"List files"}', result: 'a.txt\nb.txt', pending: false },
      { id: '3', kind: 'tool', callId: 'd', name: 'read', args: '{"path":"a.txt"}', result: 'boom', isError: true, errorReason: 'Not found', pending: false },
      { id: '4', kind: 'assistant', text: 'All good.' },
    ];
    const out = rowsToText(rows);
    expect(out.indexOf('### Thought')).toBeLessThan(out.indexOf('### Tool'));
    expect(out).toContain('Input:\n```\n{\n  "command": "ls"');
    expect(out).toContain('Output:\n```\na.txt\nb.txt\n```');
    expect(out).toContain('(error)');
    expect(out).toContain('Error:\n```\nNot found\n\nboom\n```');
    expect(out.trim().endsWith('## Assistant\n\nAll good.')).toBe(true);
  });
  it('flattens folded turn groups and truncates huge tool output', () => {
    const big = 'x'.repeat(25_000);
    const out = rowsToText([{ id: 'turn:1', kind: 'turn', durationMs: 1, steps: 1, tools: 1, outcome: 'completed', rows: [{ id: '1', kind: 'tool', callId: 'c', name: 'bash', args: '', result: big, pending: false }] }]);
    expect(out).toContain('more characters');
    expect(out.length).toBeLessThan(21_000);
  });
});
