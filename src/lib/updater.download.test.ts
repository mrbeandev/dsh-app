import { describe, expect, it, vi, beforeEach } from 'vitest';

// A fake on-disk file whose size changes as the simulated network writes to it.
const disk = vi.hoisted(() => ({ size: 0, exists: false, calls: [] as string[], plan: [] as { write: number; fail?: string }[] }));

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '12.0.0' } } }));
vi.mock('expo-intent-launcher', () => ({}));
vi.mock('../../modules/dsh-installer', () => ({ sha256File: async () => null }));
vi.mock('expo-file-system', () => {
  class File {
    uri = 'file:///cache/update.apk';
    get exists() { return disk.exists; }
    get size() { return disk.size; }
    delete() { disk.exists = false; disk.size = 0; }
    static createDownloadTask() { return { downloadAsync: () => step('start', 0) }; }
  }
  const step = async (kind: string, from: number) => {
    disk.calls.push(`${kind}@${from}`);
    const next = disk.plan.shift() ?? { write: 0 };
    disk.exists = true; disk.size = (kind === 'start' ? 0 : from) + next.write;
    if (next.fail) throw new Error(next.fail);
    return new File();
  };
  const DownloadTask = { fromSavable: (s: { resumeData: string }) => ({ resumeAsync: () => step('resume', Number(s.resumeData)) }) };
  return { File, Paths: { cache: {} }, DownloadTask };
});

const { downloadUpdate } = await import('./updater');
const release = { version: '9.9.9', tag: 'v9.9.9', name: 'x', notes: '', publishedAt: '', url: '', apkUrl: 'https://example/x.apk', apkName: 'x.apk', size: 100 };

beforeEach(() => { disk.size = 0; disk.exists = false; disk.calls = []; disk.plan = []; vi.useRealTimers(); });

describe('update download recovery', () => {
  it('resumes from the bytes already written after a connection abort', async () => {
    vi.useFakeTimers();
    disk.plan = [{ write: 40, fail: 'Unable to download a file: Software caused connection abort' }, { write: 60 }];
    const d = downloadUpdate(release, () => {});
    await vi.runAllTimersAsync();
    await expect(d.promise).resolves.toBe('file:///cache/update.apk');
    expect(disk.calls).toEqual(['start@0', 'resume@40']);
  });

  it('gives up with a friendly resumable error after repeated failures, keeping the partial file', async () => {
    vi.useFakeTimers();
    disk.plan = Array.from({ length: 6 }, () => ({ write: 5, fail: 'Software caused connection abort' }));
    const d = downloadUpdate(release, () => {});
    const settled = d.promise.catch(e => e);
    await vi.runAllTimersAsync();
    const e = await settled;
    expect(e.name).toBe('UpdateInterrupted');
    expect(e.message).toMatch(/resume/i);
    expect(e.message).not.toMatch(/FileSystemDownloadTask|Caused by/);
    expect(disk.exists).toBe(true); // next tap continues instead of restarting
  });

  it('continues a partial file left by an earlier interrupted attempt', async () => {
    disk.exists = true; disk.size = 70; disk.plan = [{ write: 30 }];
    await expect(downloadUpdate(release, () => {}).promise).resolves.toBeTruthy();
    expect(disk.calls).toEqual(['resume@70']);
  });

  it('does not retry when the user cancels', async () => {
    disk.plan = [{ write: 10, fail: 'Download was cancelled' }];
    const d = downloadUpdate(release, () => {});
    await expect(d.promise).rejects.toThrow(/cancel/i);
    expect(disk.calls).toEqual(['start@0']);
  });
});
