import { describe, expect, it, vi } from 'vitest';
import { diagnostic, exportDiagnostics, eraseDiagnostics, safeDiagnosticData } from './diagnostics';
const storage = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock('./diagnosticStore', () => ({ appendDiagnostics: async (rows: any[]) => { storage.rows.push(...rows); }, readDiagnostics: async () => storage.rows, clearDiagnostics: async () => { storage.rows = []; } }));
describe('beta diagnostics', () => {
  it('drops arbitrary secrets content URLs and unsafe values', () => {
    expect(safeDiagnosticData({ token: 'secret', text: 'prompt', url: 'https://private?token=abc', height: 200, visible: false, method: 'session/prompt', code: 'oops?token=secret' }))
      .toEqual({ height: 200, visible: false, method: 'session/prompt' });
  });
  it('bounds pending bursts and ignores invalid event names', async () => {
    await eraseDiagnostics();
    diagnostic('contains secret?token=x', { height: 1 });
    for (let i = 0; i < 400; i++) diagnostic('layout', { height: i });
    const result = JSON.parse(await exportDiagnostics());
    expect(result.events).toHaveLength(300);
    expect(result.events[0].data.height).toBe(100);
  });
  it('flushes buffered events before exporting and clears all stored rows', async () => {
    await eraseDiagnostics(); diagnostic('keyboard.hide', { height: 0, token: 'never' });
    const result = JSON.parse(await exportDiagnostics());
    expect(result.events).toHaveLength(1); expect(result.events[0].data).toEqual({ height: 0 });
    await eraseDiagnostics(); expect(JSON.parse(await exportDiagnostics()).events).toEqual([]);
  });
});
