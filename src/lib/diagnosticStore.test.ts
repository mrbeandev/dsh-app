import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ exec: vi.fn(), run: vi.fn(), get: vi.fn(), opens: 0 }));
vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => {
  state.opens++;
  const db = { execAsync: state.exec, runAsync: state.run, getAllAsync: state.get, withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => fn(db) };
  return db;
} }));

describe('persistent diagnostic database', () => {
  it('creates a separate WAL database and prunes age and count on writes', async () => {
    const { appendDiagnostics } = await import('./diagnosticStore');
    await appendDiagnostics([{ time: 100, event: 'keyboard.hide', data: { visible: false } }]);
    expect(state.exec).toHaveBeenCalledWith(expect.stringContaining('journal_mode=WAL'));
    expect(state.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'), 100, 'keyboard.hide', '{"visible":false}');
    expect(state.run).toHaveBeenCalledWith(expect.stringContaining('MAX(id),0)-10000'), expect.any(Number));
  });
  it('reads persisted records after module restart and enforces retention on export', async () => {
    state.get.mockResolvedValue([{ time: 100, event: 'keyboard.hide', data: '{"visible":false}' }]);
    vi.resetModules();
    const { readDiagnostics } = await import('./diagnosticStore');
    expect(await readDiagnostics()).toEqual([{ time: 100, event: 'keyboard.hide', data: { visible: false } }]);
    expect(state.opens).toBe(2);
    expect(state.run).toHaveBeenCalledWith('DELETE FROM logs WHERE time < ?', expect.any(Number));
  });
  it('clears data and compacts persistent storage', async () => {
    const { clearDiagnostics } = await import('./diagnosticStore');
    await clearDiagnostics();
    expect(state.exec).toHaveBeenCalledWith('DELETE FROM logs; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  });
});
