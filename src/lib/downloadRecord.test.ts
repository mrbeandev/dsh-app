import { beforeEach, describe, expect, it, vi } from 'vitest';
const store = vi.hoisted(() => new Map<string, string>());
const files = vi.hoisted(() => new Set<string>());
vi.mock('expo-secure-store', () => ({ getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ File: class { exists: boolean; constructor(uri: string) { this.exists = files.has(uri); } } }));
const { findDownload, recordDownload, forgetDownload, _resetDownloadRecords } = await import('./downloadRecord');

const H = 'https://dsh.example.com/';
const rec = { version: '1:2:17900000:100:100', bytes: 17900000, localUri: 'file:///docs/downloads/clip.mp4', name: 'clip.mp4' };

describe('remembered downloads', () => {
  beforeEach(() => { store.clear(); files.clear(); _resetDownloadRecords(); });
  it('finds a downloaded file again after the app restarts', async () => {
    files.add(rec.localUri);
    await recordDownload(H, '/w/clip.mp4', rec);
    _resetDownloadRecords();
    expect(await findDownload('https://dsh.example.com', '/w/clip.mp4', rec.version)).toMatchObject({ name: 'clip.mp4', localUri: rec.localUri });
  });
  it('ignores the record when the file changed on the Harness', async () => {
    files.add(rec.localUri);
    await recordDownload(H, '/w/clip.mp4', rec);
    expect(await findDownload(H, '/w/clip.mp4', '1:2:18000000:200:200')).toBeNull();
  });
  it('drops the record when the saved copy was deleted from the phone', async () => {
    await recordDownload(H, '/w/clip.mp4', rec);
    expect(await findDownload(H, '/w/clip.mp4', rec.version)).toBeNull();
    files.add(rec.localUri);
    expect(await findDownload(H, '/w/clip.mp4', rec.version)).toBeNull();
  });
  it('keeps records per Harness and can forget one', async () => {
    files.add(rec.localUri);
    await recordDownload(H, '/w/clip.mp4', rec);
    expect(await findDownload('http://127.0.0.1:3080', '/w/clip.mp4', rec.version)).toBeNull();
    await forgetDownload(H, '/w/clip.mp4');
    expect(await findDownload(H, '/w/clip.mp4', rec.version)).toBeNull();
  });
});
