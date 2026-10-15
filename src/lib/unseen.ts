/**
 * "Finished, not seen yet" — the Web UI's completionUnread rule:
 *  - a thread that goes running → stopped while it is not the one on screen is marked;
 *  - opening it, or it starting to run again, clears the mark.
 * Pure state machine (unit-tested); persisted by state/unseen.tsx.
 */
export type UnseenState = { running: Record<string, boolean>; unseen: string[] };

export const emptyUnseen = (): UnseenState => ({ running: {}, unseen: [] });

export function observeRunning(s: UnseenState, id: string, running: boolean, viewing?: string): UnseenState {
  const was = s.running[id];
  const runningMap = { ...s.running, [id]: running };
  let unseen = s.unseen;
  if (running) unseen = unseen.filter(x => x !== id);
  else if (was === true && id !== viewing && !unseen.includes(id)) unseen = [...unseen, id];
  return { running: runningMap, unseen };
}

export function markSeen(s: UnseenState, id: string): UnseenState {
  return s.unseen.includes(id) ? { ...s, unseen: s.unseen.filter(x => x !== id) } : s;
}

/** Drop marks for threads that no longer exist (deleted/archived elsewhere). */
export function prune(s: UnseenState, present: ReadonlySet<string>): UnseenState {
  const unseen = s.unseen.filter(id => present.has(id));
  return unseen.length === s.unseen.length ? s : { ...s, unseen };
}
