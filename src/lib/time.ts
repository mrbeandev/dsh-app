/** Compact relative timestamp for list rows: "now", "5m", "3h", "Yesterday", "Mon", "12 Oct". */
export function relativeTime(value: number | string | undefined, now = Date.now()): string {
  if (value === undefined || value === null || value === '') return '';
  const t = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (t >= today.getTime()) return `${hours}h`;
  const yesterday = today.getTime() - 86400000;
  if (t >= yesterday) return 'Yesterday';
  if (t >= today.getTime() - 6 * 86400000) return new Date(t).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
