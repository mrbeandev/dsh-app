/**
 * Background jobs (Harness 0.2.1+): commands an agent left running, e.g. a dev server or a long build.
 *
 * - `job/list {request:{sessionId}}` streams whole-set `{type:'rows', jobs}` frames: one on open, then
 *   one after each burst of lifecycle changes.
 * - `job/follow {request:{sessionId,jobId,from?}}` streams `opened` → `output {chunks,next,lossy}` →
 *   `status {job}` frames; `from` resumes at a byte offset.
 * - `job/kill {request:{sessionId,jobId}}` → `{outcome:'requested'|'already-finished'}`.
 *
 * Older Harnesses don't have these endpoints; callers treat that as "no jobs".
 */
export type JobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed';
export type JobView = {
  id: string; kind: string; label: string; owner?: string; status: JobStatus;
  progress?: string; detail?: string; startedAt: number; finishedAt?: number;
  output?: { total: number; earliest: number };
};
export type JobChunk = { at: number; text: string; channel?: 'stdout' | 'stderr' | 'log'; gapBefore?: true };

export const isLive = (j: Pick<JobView, 'status'>) => j.status === 'running' || j.status === 'stopping';

/** Running jobs first (newest first), then finished ones (most recently finished first). */
export function sortJobs(jobs: JobView[]) {
  return [...jobs].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || (isLive(a) ? b.startedAt - a.startedAt : (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt)));
}

const STATUS_TEXT: Record<JobStatus, string> = { running: 'Running', stopping: 'Stopping…', completed: 'Finished', killed: 'Stopped', failed: 'Failed' };
export function jobStatusText(j: JobView) {
  const base = STATUS_TEXT[j.status] ?? j.status;
  return j.detail && !isLive(j) ? `${base} · ${j.detail}` : j.progress && isLive(j) ? `${base} · ${j.progress}` : base;
}

/** Keep a bounded tail of output so a chatty dev server can't grow memory without limit. */
export const OUTPUT_LIMIT = 200_000;
export function appendOutput(prev: string, chunks: JobChunk[]) {
  let out = prev;
  for (const c of chunks) out += (c.gapBefore ? '\n… (earlier output not kept) …\n' : '') + c.text;
  return out.length > OUTPUT_LIMIT ? out.slice(out.length - OUTPUT_LIMIT) : out;
}

/** Remove ANSI colour/cursor codes for plain display. */
export function stripAnsi(s: string) {
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\r(?!\n)/g, '');
}

/**
 * A job's label is often the agent's whole command (multi-line scripts, heredocs). For titles and rows
 * use one short line: the first non-empty line, trimmed, with an ellipsis when cut.
 */
export function shortLabel(label: string | undefined, fallback = 'Job', max = 80) {
  const first = String(label ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
  if (!first) return fallback;
  const more = first.length > max || String(label).trim().includes('\n');
  return first.length > max ? `${first.slice(0, max - 1)}…` : more ? `${first} …` : first;
}
