import { describe, expect, it, vi } from 'vitest';
vi.mock('./harness', () => ({}));
const { mtimeOf, sortEntries } = await import('./workspaceFiles');

describe('file sorting', () => {
  it('reads mtime from the live dsh-fs-local version string', () => {
    expect(mtimeOf('65098:543347:25:1791549896376078408:1791549896376078408')).toBe(1791549896376);
    expect(mtimeOf('opaque')).toBeUndefined();
  });
  const e = [
    { name: 'b.txt', type: 'file' as const, size: 10, mtime: 300 },
    { name: 'src', type: 'directory' as const, mtime: 100 },
    { name: 'a.txt', type: 'file' as const, size: 50, mtime: 200 },
    { name: 'c.bin', type: 'file' as const, size: 5 },
  ];
  it('latest first by default, folders on top, unknown last', () => {
    expect(sortEntries(e, 'updated', 'desc').map(x => x.name)).toEqual(['src', 'b.txt', 'a.txt', 'c.bin']);
  });
  it('by name and size in both directions', () => {
    expect(sortEntries(e, 'name', 'asc').map(x => x.name)).toEqual(['src', 'a.txt', 'b.txt', 'c.bin']);
    expect(sortEntries(e, 'size', 'desc').map(x => x.name)).toEqual(['src', 'a.txt', 'b.txt', 'c.bin']);
    expect(sortEntries(e, 'size', 'asc').map(x => x.name)).toEqual(['src', 'c.bin', 'b.txt', 'a.txt']);
  });
});
