import type { HarnessClient } from './harness';

/**
 * App-native rewind (independent of the dsh-rewind Harness plugin).
 *
 * Built only on public Harness APIs so it works on any Harness:
 *   1. stop the running turn (session/cancel) if any,
 *   2. session/fork at the event just before the chosen user message — the Harness
 *      copies that exact prefix into a new thread in the same working directory,
 *   3. keep the title, then archive the original thread (archived, not deleted — it
 *      can still be restored from the Harness), and open the fork with the rewound
 *      message back in the composer for editing and re-sending.
 *
 * Unlike the plugin, the history is never rewritten: rewinding produces a clean thread
 * whose log ends right before the target message. Workspace files are not restored.
 */
export type RewindResult = { sessionId: string; draft: string };

/** Turn-opening bookkeeping the Harness writes before a user message lands (inbox splice, turn/step start). */
const OPENERS = new Set(['turn/start', 'step/start', 'agent/inbox/spliced']);
/**
 * The last event to keep: walk back from the user message over the turn-opening bookkeeping, so the
 * fork ends on a closed turn instead of an empty, synthetically closed one.
 */
export function cutBefore(records: readonly { seq: number; type: string }[], targetSeq: number) {
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  let i = sorted.findIndex(r => r.seq === targetSeq);
  if (i < 0) return targetSeq - 1;
  while (i > 0 && OPENERS.has(sorted[i - 1].type)) i--;
  return i > 0 ? sorted[i - 1].seq : Math.max(0, sorted[0].seq - 1);
}

export async function rewindTo(client: HarnessClient, opts: { sessionId: string; targetSeq: number; text: string; title?: string; running?: boolean; keepOriginal?: boolean; records?: readonly { seq: number; type: string }[] }): Promise<RewindResult> {
  if (!Number.isInteger(opts.targetSeq) || opts.targetSeq < 1) throw new Error('This message can’t be rewound to.');
  if (opts.running) await client.request('session/cancel', { sessionId: opts.sessionId }).catch(() => {});
  const atSeq = opts.records?.length ? cutBefore(opts.records, opts.targetSeq) : opts.targetSeq - 1;
  const fork = await client.request<{ sessionId: string }>('session/fork', { sessionId: opts.sessionId, atSeq });
  const title = opts.title?.trim();
  if (title) await client.request('session/rename', { sessionId: fork.sessionId, title }).catch(() => {});
  if (!opts.keepOriginal) await client.call('workspace/archiveSession', { request: { sessionId: opts.sessionId, stopActivity: true } }).catch(() => {});
  return { sessionId: fork.sessionId, draft: opts.text };
}

/** Drafts handed to a thread screen on open (e.g. the rewound message), consumed once. */
const drafts = new Map<string, string>();
export const setPendingDraft = (sessionId: string, text: string) => drafts.set(sessionId, text);
export function takePendingDraft(sessionId: string) { const v = drafts.get(sessionId); drafts.delete(sessionId); return v; }
