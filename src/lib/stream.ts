import type { Frame } from './protocol';
/** Expand the reconnect prefix. Never display a malformed partial prefix as if complete. */
export function expandStream(records: unknown): Frame[] {
  if (!Array.isArray(records)) return [];
  const chunks: Frame[] = [];
  for (const record of records) {
    if (!record || typeof record !== 'object') return [];
    if (record.type === 'chunk' && record.chunk && typeof record.chunk === 'object') { chunks.push(record.chunk); continue; }
    if (!['text-chunks', 'reasoning-chunks', 'tool-call-chunks'].includes(record.type)) return [];
    const members = record.type === 'tool-call-chunks' ? record.args : record.texts;
    if (!Array.isArray(members) || !members.every(x => typeof x === 'string') || !Number.isInteger(record.index) || record.index < 0 || !Array.isArray(record.dt ?? []) || (members.length && (record.dt ?? []).length !== members.length - 1)) return [];
    for (const member of members) chunks.push(record.type === 'tool-call-chunks' ? { type: 'tool-call-delta', index: record.index, id: record.id, argumentsDelta: member } : { type: record.type === 'text-chunks' ? 'text-delta' : 'reasoning-delta', index: record.index, text: member });
  }
  return chunks;
}
export function streamText(chunks: Frame[]) { return chunks.filter(c => c.type === 'text-delta').map(c => c.text ?? '').join(''); }
