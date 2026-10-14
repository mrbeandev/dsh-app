// @ts-nocheck -- runs under Node in vitest (uses node: modules the app tsconfig does not type)
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-0000-0000-000000000000' }));
const { extractFenced, listScript, parseListing, shq } = await import('./shellBrowse');

// Runs the exact script the app sends, in a real POSIX shell, with nasty folder names.
describe('shell folder listing', () => {
  const root = mkdtempSync(join(tmpdir(), 'dshpick-'));
  for (const n of ['src', 'My Docs', "it's", '.hidden', 'tab\there', 'ünïcode', 'new\nline']) mkdirSync(join(root, n));
  writeFileSync(join(root, 'file.txt'), 'x');
  const run = (path: string) => execFileSync('sh', ['-c', listScript(path, 'DSHPKtest')], { encoding: 'utf8' });

  it('lists only folders, hidden included, with exact names', () => {
    const fenced = extractFenced(`noise\x1b[32m$ \x1b[0m\r\n${run(root)}`, 'DSHPKtest')!;
    expect(fenced.code).toBe(0);
    const l = parseListing(fenced.body, '/home/x');
    expect(l.entries.map(e => e.name).sort()).toEqual(['.hidden', 'My Docs', "it's", 'new\nline', 'src', 'tab\there', 'ünïcode'].sort());
    expect(l.entries.find(e => e.name === '.hidden')?.hidden).toBe(true);
    expect(l.entries.every(e => e.path.startsWith(l.path + '/'))).toBe(true);
  });
  it('reports a missing folder with code 3', () => {
    expect(extractFenced(run(join(root, 'nope')), 'DSHPKtest')!.code).toBe(3);
  });
  it('lists / from the root', () => {
    const l = parseListing(extractFenced(run('/'), 'DSHPKtest')!.body, '/');
    expect(l.path).toBe('/');
    expect(l.entries.some(e => e.path === '/tmp')).toBe(true);
  });
  it('single-quotes safely', () => {
    expect(execFileSync('sh', ['-c', `printf %s ${shq("a'b $HOME `x`")}`], { encoding: 'utf8' })).toBe("a'b $HOME `x`");
  });
});
