/**
 * Scheduled reminders an agent set in a session (Harness 0.2.1 `dsh-schedule`).
 * - `schedule/list {request:{sessionId}}` → active tasks (after/at/every/daily/weekly/cron rules).
 * - `schedule/update {request:{sessionId,id,expected,title?,prompt?}}` — optimistic: `expected` is the
 *   task as last seen; supplied fields replace stored ones, omitted ones are kept.
 * - `schedule/delete {request:{sessionId,id}}`.
 */
export type Schedule = {
  id: string; title: string; prompt: string; scheduledAt: string;
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

/** Human description of how often a reminder fires ("Every day at 09:00", "Once"). */
export function scheduleRule(s: Schedule): string {
  switch (s.kind) {
    case 'after': case 'at': return 'Once';
    case 'every': return `Every ${duration(s.everySeconds ?? 0)}`;
    case 'daily': return `Every day at ${s.time ?? '?'}`;
    case 'weekly': {
      const days = (s.weekdays ?? []).map(d => DAYS[((d % 7) + 7) % 7]).join(', ');
      return `Every ${days || 'week'} at ${s.time ?? '?'}`;
    }
    case 'cron': return `Cron: ${s.expression ?? ''}`;
    default: return '';
  }
}

/** Soonest first. */
export function sortSchedules(list: Schedule[]) {
  return [...list].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}
