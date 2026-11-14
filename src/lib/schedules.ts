import type { HarnessClient } from './harness';

/**
 * Scheduled reminders (Harness `dsh-schedule`). Two API generations:
 * - 0.2.2+: one Host-wide catalog. `schedule/list {request:{limit,offset}}` → `{items,total}`, each item
 *   carrying `target` and `involvedSessionIds`; `schedule/edit {request:{id, action:'update', patch,
 *   expectedUpdatedAt}}` or `{id, action:'delete', expectedUpdatedAt}`.
 * - 0.2.1: per-session. `schedule/list {request:{sessionId}}` → array; `schedule/update
 *   {request:{sessionId,id,expected,title?,prompt?}}`; `schedule/delete {request:{sessionId,id}}`.
 * The record fields (id, title, prompt, scheduledAt, kind + rule fields) are the same in both.
 */
export type Schedule = {
  id: string; title: string; prompt: string; scheduledAt: string;
  /** 0.2.2+ only. */
  status?: 'active' | 'paused' | 'ended'; updatedAt?: string; involvedSessionIds?: string[]; target?: { kind: string; sessionId?: string };
  kind: 'after' | 'at' | 'every' | 'daily' | 'weekly' | 'cron';
  afterSeconds?: number; everySeconds?: number; time?: string; timeZone?: string; weekdays?: number[]; expression?: string;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function duration(sec: number) {
  if (sec % 86400 === 0) return `${sec / 86400} day${sec === 86400 ? '' : 's'}`;
  if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? '' : 's'}`;
  if (sec % 60 === 0) return `${sec / 60} minute${sec === 60 ? '' : 's'}`;
  return `${sec} seconds`;
}

/** "09:00:00" (0.2.2) or "09:00" (0.2.1) → "09:00". */
const hhmm = (t?: string) => (t ? t.replace(/^(\d{1,2}:\d{2}):\d{2}(?:\.\d+)?$/, '$1') : '?');

/** Human description of how often a reminder fires ("Every day at 09:00", "Once"). */
export function scheduleRule(s: Schedule): string {
  switch (s.kind) {
    case 'after': case 'at': return 'Once';
    case 'every': return `Every ${duration(s.everySeconds ?? 0)}`;
    case 'daily': return `Every day at ${hhmm(s.time)}`;
    case 'weekly': {
      const days = (s.weekdays ?? []).map(d => DAYS[((d % 7) + 7) % 7]).join(', ');
      return `Every ${days || 'week'} at ${hhmm(s.time)}`;
    }
    case 'cron': return `Cron: ${s.expression ?? ''}`;
    default: return '';
  }
}

/** Soonest first. */
export function sortSchedules(list: Schedule[]) {
  return [...list].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

type ListResult = { items?: Schedule[]; total?: number } | Schedule[];
const legacy = new WeakSet<HarnessClient>();
const isMissingMethod = (e: unknown) => /no active Remote method|not found|unknown method|input-invalid|unexpected|additional/i.test(String((e as Error)?.message ?? e));

/** Reminders that belong to (or deliver into) this session, soonest first. */
export async function listSchedules(client: HarnessClient, sessionId: string): Promise<Schedule[]> {
  if (!legacy.has(client)) {
    try {
      const all: Schedule[] = []; let offset = 0;
      for (let page = 0; page < 10; page++) {
        const r = await client.request<ListResult>('schedule/list', { active: true, limit: 100, offset });
        const items = Array.isArray(r) ? r : r.items ?? [];
        all.push(...items); offset += items.length;
        if (Array.isArray(r) || !items.length || offset >= (r.total ?? 0)) break;
      }
      return sortSchedules(forSession(all, sessionId));
    } catch (e) { if (!isMissingMethod(e)) throw e; legacy.add(client); }
  }
  const r = await client.request<Schedule[]>('schedule/list', { sessionId });
  return sortSchedules(Array.isArray(r) ? r : []);
}

export function forSession(all: Schedule[], sessionId: string) {
  return all.filter(s => s.status !== 'ended' && (s.involvedSessionIds?.includes(sessionId) || s.target?.sessionId === sessionId));
}

export async function updateSchedule(client: HarnessClient, sessionId: string, s: Schedule, patch: { title?: string; prompt?: string }) {
  if (legacy.has(client)) return client.request('schedule/update', { sessionId, id: s.id, expected: s, ...patch });
  return checkEdit(await client.request('schedule/edit', { id: s.id, action: 'update', patch, expectedUpdatedAt: s.updatedAt ?? null }));
}

export async function deleteSchedule(client: HarnessClient, sessionId: string, s: Schedule) {
  if (legacy.has(client)) return client.request('schedule/delete', { sessionId, id: s.id });
  return checkEdit(await client.request('schedule/edit', { id: s.id, action: 'delete', expectedUpdatedAt: s.updatedAt ?? null }));
}

/** `schedule/edit` reports misses and conflicts as values, not errors. */
export function checkEdit(r: unknown) {
  const code = (r as { code?: string } | null)?.code;
  if (code === 'schedule_conflict') throw new Error('This reminder was changed elsewhere. It has been reloaded; try again.');
  if (code === 'schedule_not_found') throw new Error('This reminder no longer exists.');
  return r;
}
