import { describe, expect, it, vi } from 'vitest';
import { checkEdit, deleteSchedule, forSession, listSchedules, updateSchedule, type Schedule } from './schedules';
import type { HarnessClient } from './harness';

const task = (id: string, extra: Partial<Schedule> = {}): Schedule => ({ id, title: id, prompt: 'p', scheduledAt: '2030-01-01T00:00:00Z', kind: 'daily', time: '09:00', ...extra });
const fake = (impl: (method: string, args: Record<string, unknown>) => unknown) => ({ request: vi.fn(async (m: string, a: Record<string, unknown>) => impl(m, a)) }) as unknown as HarnessClient & { request: ReturnType<typeof vi.fn> };

describe('reminders on Harness 0.2.2 (host-wide catalog)', () => {
  it('lists only active reminders that involve this session', async () => {
    const c = fake(() => ({ items: [task('a', { involvedSessionIds: ['s1'], status: 'active' }), task('b', { involvedSessionIds: ['s2'], status: 'active' }), task('c', { target: { kind: 'session', sessionId: 's1' }, status: 'active' })], total: 3 }));
    expect((await listSchedules(c, 's1')).map(s => s.id)).toEqual(['a', 'c']);
    expect(c.request).toHaveBeenCalledWith('schedule/list', { active: true, limit: 100, offset: 0 });
  });
  it('edits and deletes through schedule/edit with the last-seen updatedAt', async () => {
    const c = fake(() => ({ items: [], total: 0 }));
    await listSchedules(c, 's1');
    const s = task('a', { updatedAt: '2030-01-01T00:00:00Z' });
    await updateSchedule(c, 's1', s, { title: 'New' });
    expect(c.request).toHaveBeenLastCalledWith('schedule/edit', { id: 'a', action: 'update', patch: { title: 'New' }, expectedUpdatedAt: '2030-01-01T00:00:00Z' });
    await deleteSchedule(c, 's1', s);
    expect(c.request).toHaveBeenLastCalledWith('schedule/edit', { id: 'a', action: 'delete', expectedUpdatedAt: '2030-01-01T00:00:00Z' });
  });
  it('turns conflict and not-found results into readable errors', () => {
    expect(() => checkEdit({ id: 'a', code: 'schedule_conflict' })).toThrow(/changed elsewhere/);
    expect(() => checkEdit({ id: 'a', code: 'schedule_not_found' })).toThrow(/no longer exists/);
    expect(checkEdit({ id: 'a', deleted: true })).toEqual({ id: 'a', deleted: true });
  });
  it('drops ended reminders', () => {
    expect(forSession([task('x', { involvedSessionIds: ['s1'], status: 'ended' })], 's1')).toEqual([]);
  });
});

describe('reminders on Harness 0.2.1 (per-session)', () => {
  it('falls back to the per-session calls when the new list shape is refused', async () => {
    const c = fake((m, a) => { if (m === 'schedule/list' && !('sessionId' in a)) throw new Error('schedule/input-invalid: unexpected property active'); return m === 'schedule/list' ? [task('old')] : undefined; });
    expect((await listSchedules(c, 's1')).map(s => s.id)).toEqual(['old']);
    await deleteSchedule(c, 's1', task('old'));
    expect(c.request).toHaveBeenLastCalledWith('schedule/delete', { sessionId: 's1', id: 'old' });
  });
});

describe('reminder times', () => {
  it('shows HH:mm for both 0.2.1 and 0.2.2 time formats', async () => {
    const { scheduleRule } = await import('./schedules');
    expect(scheduleRule(task('a', { kind: 'daily', time: '09:00:00' }))).toBe('Every day at 09:00');
    expect(scheduleRule(task('b', { kind: 'daily', time: '18:30' }))).toBe('Every day at 18:30');
  });
});
