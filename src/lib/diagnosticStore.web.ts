export type DiagnosticRow = { time: number; event: string; data: Record<string, unknown> };
const key = 'dsh.beta-diagnostics';
export async function readDiagnostics(): Promise<DiagnosticRow[]> { try { return JSON.parse(localStorage.getItem(key) ?? '[]').filter((r: DiagnosticRow) => r.time >= Date.now() - 7 * 86400000).slice(-10000); } catch { return []; } }
export async function appendDiagnostics(rows: DiagnosticRow[]) { const cutoff = Date.now() - 7 * 86400000; localStorage.setItem(key, JSON.stringify([...(await readDiagnostics()), ...rows].filter(r => r.time >= cutoff).slice(-10000))); }
export async function clearDiagnostics() { localStorage.removeItem(key); }
