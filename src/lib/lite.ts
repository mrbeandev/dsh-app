import { toolTitle, type WireEvent } from './protocol';
import { classifyTool, toolSummary } from './toolLabel';

/**
 * Lightweight chat model.
 *
 * The chat screen never holds full event bodies for the steps it folds away. Each event is stored
 * in full in the phone's database (lib/eventStore), and the screen works from a *lite* copy:
 *  - user prompts, assistant replies (text kept, reasoning dropped), turn boundaries, failures,
 *    compaction markers and commands keep what they need to render;
 *  - tool calls keep only name + a short target (for "Ran npm test"); tool results only their
 *    error flag; system/context messages only their kind and a one-line label.
 * Full bodies are loaded from the DB (or the Harness, once) when a single step is expanded.
 */

/** Marks a lite event whose full body was dropped; `bytes` is roughly what was saved. */
export type LiteMark = { lite: true; bytes: number };

const BIG_TOOL_ARGS = 160;

export function liteEvent(e: WireEvent): WireEvent {
  const d: any = e.data ?? {};
  const size = () => JSON.stringify(d).length;
  switch (e.type) {
    case 'tool/call': {
      const args = String(d.arguments ?? '');
      if (args.length <= BIG_TOOL_ARGS) return e;
      // Keep only what the row title needs: the target derived from the full args.
      // Keep exactly what the row title needs: the Web UI summary (description / path / query).
      const name = String(d.name ?? 'tool');
      const summary = toolSummary(name, args).slice(0, 200); // one display line is all the title needs
      const { target } = toolTitle(name, args);
      return { ...e, data: { callId: d.callId, name: d.name, arguments: JSON.stringify({ ...titleArgs(name, target), ...summaryArgs(name, summary) }), __lite: { lite: true, bytes: size() } } };
    }
    case 'tool/result': {
      const m = d.message ?? {};
      // Keep image references (a few bytes each; the picture loads from session/attachment on expand).
      const images = Array.isArray(m.content) ? m.content.filter((b: any) => b?.type === 'image') : [];
      return { ...e, data: { message: { toolCallId: m.toolCallId, source: m.source ? { callId: m.source.callId } : undefined, isError: m.isError, content: images }, error: d.error ? { reason: d.error.reason } : undefined, __lite: { lite: true, bytes: size() } } };
    }
    case 'system/message':
      return { ...e, data: { message: { content: [{ type: 'text', text: '' }] }, __lite: { lite: true, bytes: size() } } };
    case 'developer/message':
      return { ...e, data: { message: { content: [{ type: 'text', text: '' }] }, __lite: { lite: true, bytes: size() } } };
    case 'user/message':
    case 'message/user': {
      const source = d.source ?? d.message?.source;
      if (!source?.kind || source.kind === 'user') return e; // real prompts stay whole
      return { ...e, data: { source, content: [{ type: 'text', text: '' }], __lite: { lite: true, bytes: size() } } };
    }
    case 'assistant/message':
    case 'attempt/settled': {
      const message = d.message ?? d.assistantMessage;
      const blocks: any[] = Array.isArray(message?.content) ? message.content : [];
      const hasReasoning = blocks.some(b => b?.type === 'reasoning' || b?.type === 'thinking');
      if (!hasReasoning) return e;
      // Keep the reply text; replace reasoning with an empty marker so the "Thought" row still shows.
      const kept = blocks.map(b => (b?.type === 'reasoning' || b?.type === 'thinking') ? { type: b.type, text: ' ' } : b);
      const key = d.message ? 'message' : 'assistantMessage';
      return { ...e, data: { ...d, [key]: { ...message, content: kept }, __lite: { lite: true, bytes: size() } } };
    }
    case 'assistant/attempt': {
      // Only the failure (if any) is shown; drop the streamed chunks.
      const failure = (d.stream as any[] | undefined)?.map(r => r?.chunk?.reason?.failure).find(Boolean);
      return { ...e, data: failure ? { stream: [{ chunk: { reason: { failure } } }] } : {} };
    }
    default:
      return e;
  }
}

/** Args that make toolSummary() return the same summary (bash/code keep `description`). */
function summaryArgs(name: string, summary: string): Record<string, string> {
  const v = classifyTool(name);
  if (!summary) return {};
  if (v === 'bash' || v === 'code') return { description: summary };
  if (v === 'search') return { query: summary };
  if (v === 'read' || v === 'write' || v === 'edit') return { path: summary };
  return { summary };
}

/** Minimal args that make toolTitle() produce the same target. */
function titleArgs(name: string, target: string): Record<string, string> {
  const n = name.toLowerCase();
  if (/bash|shell|pwsh|exec|command|run_code/.test(n)) return { command: target };
  if (/grep|search_files|find/.test(n)) return { pattern: target };
  if (/glob|list|ls/.test(n)) return { pattern: target };
  if (/web_search|search/.test(n)) return { query: target };
  if (/fetch/.test(n)) return { url: target };
  if (/subagent|agent/.test(n)) return { description: target };
  if (/skill/.test(n)) return { name: target };
  return { path: target };
}

export function isLite(e: WireEvent | undefined): boolean { return !!(e?.data as any)?.__lite; }
export function liteBytes(e: WireEvent | undefined): number { return Number((e?.data as any)?.__lite?.bytes) || 0; }
