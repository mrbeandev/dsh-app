import { appendDiagnostics, clearDiagnostics, readDiagnostics, type DiagnosticRow } from './diagnosticStore';
import { analyseKeyboardLayouts } from './diagnosticAnalysis';
// Strict allowlist: never persist arbitrary messages, request bodies, URLs, tokens or stack traces.
const safeKeys = new Set(['width','height','x','y','screenHeight','windowHeight','keyboardHeight','visible','focused','durationMs','status','code','count','bytes','fatal','platform','version','os','route','method','phase','pending','queued','lagMs']);
export function safeDiagnosticData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!safeKeys.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'string' && /^[a-zA-Z0-9_.:/[\] -]{0,100}$/.test(value)) out[key] = value;
  }
  return out;
}
let queue: DiagnosticRow[] = [], timer: ReturnType<typeof setTimeout> | undefined;
let writing = Promise.resolve();
export function diagnostic(event: string, data: Record<string, unknown> = {}) {
  if (!/^[a-z0-9_.-]{1,64}$/i.test(event)) return;
  queue.push({ time: Date.now(), event, data: safeDiagnosticData(data) });
  if (queue.length > 300) queue.shift();
  if (!timer) timer = setTimeout(() => { timer = undefined; void flushDiagnostics(); }, 1000);
}
export async function flushDiagnostics() {
  if (timer) { clearTimeout(timer); timer = undefined; }
  const batch = queue; queue = [];
  writing = writing.catch(() => {}).then(async () => { if (batch.length) await appendDiagnostics(batch); }).catch(() => {});
  await writing;
}
export async function exportDiagnostics() {
  await flushDiagnostics(); const events = await readDiagnostics();
  return JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), analysis: analyseKeyboardLayouts(events), events }, null, 2);
}
export async function eraseDiagnostics() {
  queue = []; if (timer) { clearTimeout(timer); timer = undefined; }
  // Serialize deletion with pending inserts; events recorded after this call remain valid new logs.
  writing = writing.catch(() => {}).then(() => clearDiagnostics());
  await writing;
}
