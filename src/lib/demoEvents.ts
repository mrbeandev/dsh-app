import type { WireEvent } from './protocol';

/** Sample event log covering every chat row kind. Used only by the dev preview route. */
const t = (s: string) => [{ type: 'text', text: s }];
let seq = 0;
const ev = (type: string, data: Record<string, unknown> = {}): WireEvent => ({ type, seq: seq++, time: 0, data });

export const demoEvents: WireEvent[] = [
  ev('system/message', { message: { content: t('You are DSH, a coding agent. Follow the workspace AGENTS.md…'.repeat(20)) } }),
  ev('user/message', { source: { kind: 'runtime-context' }, content: t('hidden runtime context') }),
  ev('user/message', { source: { kind: 'user' }, content: t('Add a `formatBytes` helper and test it.') }),
  ev('assistant/message', { message: { content: [{ type: 'reasoning', text: 'I should check the existing utils first.\nThen add a test.' }, ...t('I’ll look at the existing helpers first.')] } }),
  ev('tool/call', { callId: 'a', name: 'read', arguments: '{"file_path":"src/lib/cache.ts"}' }),
  ev('tool/result', { message: { toolCallId: 'a', content: t('export function readCatalog() {…}') } }),
  ev('tool/call', { callId: 'b', name: 'bash', arguments: '{"command":"npm test -- cache"}' }),
  ev('tool/result', { message: { toolCallId: 'b', isError: true, content: t('FAIL src/lib/cache.test.ts\n  ✕ formats bytes') }, error: { name: 'Exit', code: '1', reason: 'Command exited with code 1' } }),
  ev('tool/call', { callId: 'c', name: 'str_replace_editor', arguments: '{"path":"src/lib/cache.ts"}' }),
  ev('tool/result', { message: { toolCallId: 'c', content: t('Edited 1 occurrence') } }),
  ev('assistant/message', { message: { content: t('## Done\n\nAdded **`formatBytes`** in `src/lib/cache.ts`:\n\n```ts\nexport function formatBytes(n: number) {\n  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;\n}\n```\n\n> Note: sizes use base 1024, matching the cache screen.\n\n- Handles bytes and kilobytes\n- Covered by `cache.test.ts`\n\n1. Run `npm test`\n2. Ship it') } }),
  ev('user/message', { source: { kind: 'goal', round: 2 }, content: t('<goal_round> Continue the objective.') }),
  ev('user/message', { source: { kind: 'skill-invocation' }, content: t('# baoyu-design\nSkill instructions…') }),
  ev('compaction/start', { compactionId: 'k' }),
  ev('compaction/summary', { compactionId: 'k', summary: t('Summary: built cache helper, tests pass.'), shadowedTokenCount: 48200 }),
  ev('user/message', { source: { kind: 'compact-checkpoint' }, content: t('Summary: built cache helper, tests pass.') }),
  ev('compaction/end', { compactionId: 'k' }),
  ev('user/message', { source: { kind: 'webhook', form: 'notice', summary: 'Push to main by mrbeandev' }, content: t('{"ref":"main"}') }),
  ev('command/run', { name: 'compact' }),
  ev('assistant/attempt', { stream: [{ chunk: { type: 'finish', reason: { kind: 'error', failure: { message: 'Provider timed out' } } } }] }),
  ev('tool/call', { callId: 'd', name: 'web_search', arguments: '{"queries":["expo blur android"]}' }),
  ev('turn/end', { reason: { kind: 'aborted', reason: { kind: 'user' } } }),
];
