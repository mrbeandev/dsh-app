import { describe, expect, it } from 'vitest';
import { appendOutput, jobStatusText, OUTPUT_LIMIT, sortJobs, stripAnsi, type JobView } from './jobs';
import { scheduleRule, sortSchedules, type Schedule } from './schedules';
import { untilTime } from './time';
import { snippetLine } from './useContentSearch';

const job = (id: string, status: JobView['status'], startedAt: number, finishedAt?: number, extra: Partial<JobView> = {}): JobView => ({ id, kind: 'bash', label: id, status, startedAt, finishedAt, ...extra });

describe('background jobs', () => {
  it('lists running jobs first, newest first, then finished ones by finish time', () => {
    const out = sortJobs([job('old-done', 'completed', 1, 5), job('run-old', 'running', 2), job('new-done', 'failed', 3, 9), job('run-new', 'stopping', 4)]);
    expect(out.map(j => j.id)).toEqual(['run-new', 'run-old', 'new-done', 'old-done']);
  });
  it('describes status with progress while running and detail once finished', () => {
    expect(jobStatusText(job('a', 'running', 1, undefined, { progress: 'compiling' }))).toBe('Running · compiling');
    expect(jobStatusText(job('a', 'failed', 1, 2, { detail: 'exit code: 3' }))).toBe('Failed · exit code: 3');
    expect(jobStatusText(job('a', 'killed', 1, 2))).toBe('Stopped');
  });
  it('keeps a bounded tail of output and marks lost output', () => {
    const big = 'x'.repeat(OUTPUT_LIMIT);
    const out = appendOutput(big, [{ at: 0, text: 'TAIL' }]);
    expect(out.length).toBe(OUTPUT_LIMIT); expect(out.endsWith('TAIL')).toBe(true);
    expect(appendOutput('', [{ at: 10, text: 'b', gapBefore: true }])).toContain('earlier output not kept');
  });
  it('strips colour codes and lone carriage returns', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m 50%\r100%\n')).toBe('ok 50%100%\n');
  });
});

describe('scheduled reminders', () => {
  const base = { id: 'r', title: 't', prompt: 'p', scheduledAt: '2026-11-08T09:00:00Z' };
  it('describes each rule kind', () => {
    expect(scheduleRule({ ...base, kind: 'at' })).toBe('Once');
    expect(scheduleRule({ ...base, kind: 'every', everySeconds: 3600 })).toBe('Every 1 hour');
    expect(scheduleRule({ ...base, kind: 'every', everySeconds: 1800 })).toBe('Every 30 minutes');
    expect(scheduleRule({ ...base, kind: 'daily', time: '09:00' })).toBe('Every day at 09:00');
    expect(scheduleRule({ ...base, kind: 'weekly', time: '18:30', weekdays: [1, 5] })).toBe('Every Mon, Fri at 18:30');
    expect(scheduleRule({ ...base, kind: 'cron', expression: '0 9 * * 1' })).toBe('Cron: 0 9 * * 1');
  });
  it('sorts soonest first and formats time until the next run', () => {
    const a: Schedule = { ...base, id: 'a', kind: 'at', scheduledAt: '2026-11-09T00:00:00Z' };
    const b: Schedule = { ...base, id: 'b', kind: 'at', scheduledAt: '2026-11-08T00:00:00Z' };
    expect(sortSchedules([a, b]).map(s => s.id)).toEqual(['b', 'a']);
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(untilTime('2026-11-08T00:30:00Z', now)).toBe('in 30m');
    expect(untilTime('2026-11-08T05:00:00Z', now)).toBe('in 5h');
    expect(untilTime('2026-11-11T00:00:00Z', now)).toBe('in 3d');
    expect(untilTime('2026-11-07T00:00:00Z', now)).toBe('due now');
  });
});

describe('content search snippets', () => {
  it('collapses whitespace and shortens long snippets', () => {
    expect(snippetLine('  fix the\n\n login   bug  ')).toBe('fix the login bug');
    expect(snippetLine('a'.repeat(200), 20)).toBe(`${'a'.repeat(19)}…`);
  });
});
