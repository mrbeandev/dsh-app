import { buildTranscript, type TranscriptRow, type WireEvent } from './protocol';
import { toolLabel, toolSummary } from './toolLabel';

/**
 * Plain-text exports of an assistant reply for the clipboard.
 *  - `replyText`: just the answer's Markdown.
 *  - `turnText`: the whole turn — reasoning, interim messages and every tool call with its
 *    arguments and result — rendered from the full events stored on the phone, in order.
 */
export function replyText(row: Extract<TranscriptRow, { kind: 'assistant' }>) {
  return row.text.trim();
}

const CAP = 20_000; // keep a single tool output from making the clipboard unusable
const clip = (s: string) => (s.length > CAP ? `${s.slice(0, CAP)}\n… (${s.length - CAP} more characters)` : s);
const pretty = (args: string) => { try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; } };

export function rowsToText(rows: TranscriptRow[]): string {
  const out: string[] = [];
  for (const r of rows) {
    switch (r.kind) {
      case 'user': if (r.text) out.push(`## You\n\n${r.text.trim()}`); break;
      case 'assistant':
        if (r.reasoning) out.push(`### Thought\n\n${r.reasoning.trim()}`);
        if (r.text) out.push(`## Assistant\n\n${r.text.trim()}`);
        break;
      case 'tool': {
        const summary = toolSummary(r.name, r.args);
        const head = `### Tool: ${toolLabel(r.name)}${summary ? ` · ${summary}` : ''}${r.isError ? ' (error)' : ''}`;
        const parts = [head];
        if (r.args) parts.push(`Input:\n\`\`\`\n${clip(pretty(r.args))}\n\`\`\``);
        if (r.result !== undefined) parts.push(`${r.isError ? 'Error' : 'Output'}:\n\`\`\`\n${clip([r.errorReason, r.result].filter(Boolean).join('\n\n') || '(no output)')}\n\`\`\``);
        out.push(parts.join('\n\n'));
        break;
      }
      case 'turn': out.push(rowsToText(r.rows)); break;
      default: {
        const label = (r as { label?: string }).label; const text = (r as { text?: string }).text;
        if (text) out.push(label ? `### ${label}\n\n${text}` : text);
      }
    }
  }
  return out.filter(Boolean).join('\n\n');
}

/** Full events for a turn → the readable transcript. Events must be in seq order. */
export function turnText(events: readonly WireEvent[]) {
  return rowsToText(buildTranscript([...events]));
}
