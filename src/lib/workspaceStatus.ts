/**
 * The badge a workspace header shows, rolled up from all of its sessions (including collapsed and
 * not-yet-paged ones): the most urgent wins — needs your answer, then working, then finished-unseen.
 */
export type RollupKind = 'input' | 'working' | 'unseen' | 'none';

export function workspaceStatus<S>(sessions: S[], is: { input: (s: S) => boolean; working: (s: S) => boolean; unseen: (s: S) => boolean }): { kind: RollupKind; counts: Record<Exclude<RollupKind, 'none'>, number> } {
  const counts = { input: 0, working: 0, unseen: 0 };
  for (const s of sessions) {
    if (is.input(s)) counts.input++;
    else if (is.working(s)) counts.working++;
    else if (is.unseen(s)) counts.unseen++;
  }
  const kind: RollupKind = counts.input ? 'input' : counts.working ? 'working' : counts.unseen ? 'unseen' : 'none';
  return { kind, counts };
}

/** Spoken summary for the header, e.g. "1 needs your answer, 2 finished, not opened". */
export function workspaceStatusLabel(c: Record<Exclude<RollupKind, 'none'>, number>): string {
  return [c.input && `${c.input} need${c.input === 1 ? 's' : ''} your answer`, c.working && `${c.working} working`, c.unseen && `${c.unseen} finished, not opened`].filter(Boolean).join(', ');
}
