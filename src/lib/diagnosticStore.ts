import * as SQLite from 'expo-sqlite';
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  database ??= SQLite.openDatabaseAsync('dsh-diagnostics.db').then(async d => {
    await d.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,event TEXT NOT NULL,data TEXT NOT NULL);'); return d;
  }); return database;
}
export type DiagnosticRow = { time: number; event: string; data: Record<string, unknown> };
export async function appendDiagnostics(rows: DiagnosticRow[]) {
  const d = await db();
  await d.withExclusiveTransactionAsync(async tx => {
    for (const r of rows) await tx.runAsync('INSERT INTO logs(time,event,data) VALUES(?,?,?)', r.time, r.event, JSON.stringify(r.data));
    await tx.runAsync('DELETE FROM logs WHERE time < ? OR id <= (SELECT COALESCE(MAX(id),0)-10000 FROM logs)', Date.now() - 7 * 86400000);
  });
}
export async function readDiagnostics(): Promise<DiagnosticRow[]> {
  const d = await db();
  await d.runAsync('DELETE FROM logs WHERE time < ?', Date.now() - 7 * 86400000);
  const rows = await d.getAllAsync<{ time: number; event: string; data: string }>('SELECT time,event,data FROM logs ORDER BY id');
  return rows.map(r => ({ ...r, data: JSON.parse(r.data) }));
}
export async function clearDiagnostics() { await (await db()).execAsync('DELETE FROM logs; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); }
