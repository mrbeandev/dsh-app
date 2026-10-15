import { describe, expect, it } from 'vitest';
import { buildTranscript, foldTurns, toolTitle, type WireEvent } from './protocol';
import { isLite, liteEvent } from './lite';

const ev = (seq: number, type: string, data: Record<string, unknown>, time = seq * 1000): WireEvent => ({ seq, type, time, data });
const bigArgs = JSON.stringify({ command: 'npm test -- --coverage', description: 'x'.repeat(2000) });
const bigResult = 'line\n'.repeat(5000);
const turn: WireEvent[] = [
  ev(1, 'turn/start', {}),
  ev(2, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'run the tests' }] }),
  ev(3, 'system/message', { message: { content: [{ type: 'text', text: 'SYSTEM '.repeat(3000) }] } }),
  ev(4, 'step/start', {}),
  ev(5, 'assistant/message', { message: { content: [{ type: 'reasoning', text: 'thinking '.repeat(500) }, { type: 'tool-call', id: 'c1' }] } }),
  ev(6, 'tool/call', { callId: 'c1', name: 'bash', arguments: bigArgs }),
  ev(7, 'tool/result', { message: { toolCallId: 'c1', content: [{ type: 'text', text: bigResult }], isError: false } }),
  ev(8, 'step/start', {}),
  ev(9, 'assistant/message', { message: { content: [{ type: 'text', text: 'All 42 tests pass.' }] } }),
  ev(10, 'turn/end', { reason: { kind: 'completed' } }, 12_000),
];

describe('lite events', () => {
  it('drops heavy bodies but keeps titles, prompts and replies', () => {
    const lite = turn.map(liteEvent);
    expect(JSON.stringify(lite).length).toBeLessThan(JSON.stringify(turn).length / 20);
    const call = lite.find(e => e.type === 'tool/call')!;
    expect(isLite(call)).toBe(true);
    expect(toolTitle('bash', String(call.data.arguments))).toEqual(toolTitle('bash', bigArgs));
    expect(isLite(lite.find(e => e.seq === 2))).toBe(false);
    expect(isLite(lite.find(e => e.seq === 9))).toBe(false);
  });
  it('folds into the same rows: prompt, Completed in 11s with the same step titles, final reply', () => {
    const full = foldTurns(turn, buildTranscript(turn));
    const lite = turn.map(liteEvent); const fromLite = foldTurns(lite, buildTranscript(lite));
    expect(fromLite.map(r => r.kind)).toEqual(full.map(r => r.kind));
    const fold = (rows: typeof full) => rows.find(r => r.kind === 'turn') as any;
    expect(fold(fromLite).durationMs).toBe(11_000);
    expect(fold(fromLite).tools).toBe(fold(full).tools);
    expect(fold(fromLite).rows.map((r: any) => r.kind + ':' + (r.name ?? ''))).toEqual(fold(full).rows.map((r: any) => r.kind + ':' + (r.name ?? '')));
    expect((fromLite.at(-1) as any).text).toBe('All 42 tests pass.');
  });
});

describe('expanding a lite step', () => {
  it('lite rows carry no body; the full events rebuild the same row with args and result', () => {
    const lite = turn.map(liteEvent);
    const liteTool = buildTranscript(lite).find(r => r.kind === 'tool') as any;
    expect(liteTool.lite).toBe(true);
    expect(liteTool.result).toBe('');
    expect(liteTool.resultSeq).toBe(7);
    // what ChatRow does on expand: load seq..resultSeq from the DB (full events) and rebuild
    const range = turn.filter(e => e.seq >= Number(liteTool.id) && e.seq <= liteTool.resultSeq);
    const full = buildTranscript(range).find(r => r.id === liteTool.id) as any;
    expect(full.args).toBe(bigArgs);
    expect(full.result.length).toBeGreaterThan(20_000);
    expect(full.lite).toBe(false);
  });
});

describe('lite tool calls keep the Web UI title', () => {
  it('summary is the same before and after expanding', async () => {
    const { toolSummary } = await import('./toolLabel');
    const args = JSON.stringify({ command: 'x'.repeat(500) + '\nmore', description: 'Rebuild the release APK' });
    const lite = liteEvent(ev(1, 'tool/call', { callId: 'c', name: 'bash_ide', arguments: args }));
    expect(toolSummary('bash_ide', String(lite.data.arguments))).toBe('Rebuild the release APK');
    const p = JSON.stringify({ file_path: '/very/long/path/' + 'd/'.repeat(80) + 'index.tsx', content: 'y'.repeat(500) });
    const lw = liteEvent(ev(2, 'tool/call', { callId: 'w', name: 'write', arguments: p }));
    expect(toolSummary('write', String(lw.data.arguments))).toBe(toolSummary('write', p));
  });
});

describe('image results', () => {
  it('Read image results keep their image reference in lite form', () => {
    const img = { type: 'image', attachment: { attachmentId: 'att-1', mediaType: 'image/png', bytes: 50000, width: 1080, height: 2400, name: 'shot.png' } };
    const events = [
      ev(1, 'tool/call', { callId: 'r', name: 'read_image', arguments: JSON.stringify({ path: '/tmp/shot.png' }) }),
      ev(2, 'tool/result', { message: { toolCallId: 'r', content: [{ type: 'text', text: 'x'.repeat(5000) }, img] } }),
    ];
    const tool = buildTranscript(events.map(liteEvent)).find(r => r.kind === 'tool') as any;
    expect(tool.images).toEqual([{ attachmentId: 'att-1', mediaType: 'image/png', width: 1080, height: 2400, name: 'shot.png' }]);
    expect(tool.result).toBe('[Image]'); // the 5 KB text was dropped; only the image marker remains
  });
});
