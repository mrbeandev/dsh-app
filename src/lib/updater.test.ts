import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '12.0.0' } } }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {}, DownloadTask: {} }));
vi.mock('expo-intent-launcher', () => ({}));
vi.mock('../../modules/dsh-installer', () => ({ sha256File: async () => null }));
const { compareVersions, pickRelease, checkForUpdate, digestOf } = await import('./updater');

const gh = (tag: string, apk = true) => ({ tag_name: tag, name: `DSH Mobile ${tag}`, body: 'Notes', published_at: '2026-10-13T15:00:00Z', html_url: `https://github.com/mrbeandev/dsh-app/releases/tag/${tag}`, assets: apk ? [{ name: `dsh-mobile-${tag}.apk`, browser_download_url: `https://github.com/mrbeandev/dsh-app/releases/download/${tag}/dsh-mobile-${tag}.apk`, size: 50_000_000 }] : [] });

describe('updater', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('12.0.1', '12.0.0')).toBe(1);
    expect(compareVersions('v12.10.0', '12.9.9')).toBe(1);
    expect(compareVersions('12.0.0', '12.0.0')).toBe(0);
    expect(compareVersions('11.9.0', '12.0.0')).toBe(-1);
  });
  it('reads the GitHub latest-release shape and its APK asset', () => {
    expect(pickRelease(gh('v12.1.0'))).toMatchObject({ version: '12.1.0', apkName: 'dsh-mobile-v12.1.0.apk', size: 50_000_000 });
    expect(pickRelease(gh('v12.1.0', false))).toBeNull();
  });
  it('reports an update only when the release is newer', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => gh('v12.1.0') }).mockResolvedValueOnce({ ok: true, status: 200, json: async () => gh('v12.0.0') }).mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    expect((await checkForUpdate())?.version).toBe('12.1.0');
    expect(await checkForUpdate()).toBeNull();
    expect(await checkForUpdate()).toBeNull();
  });
});

describe('release digest', () => {
  it('reads the sha256 GitHub publishes for the APK asset', () => {
    const r = pickRelease({ tag_name: 'v12.1.3', assets: [{ name: 'dsh-mobile-v12.1.3.apk', browser_download_url: 'https://x/a.apk', size: 5, digest: 'sha256:75E1117FD8E466E178A6675947E6B0B164FDB906848F80028BEA48E5109FB786' }] });
    expect(r?.sha256).toBe('75e1117fd8e466e178a6675947e6b0b164fdb906848f80028bea48e5109fb786');
  });
  it('ignores missing or malformed digests', () => {
    expect(digestOf({})).toBeUndefined();
    expect(digestOf({ digest: 'md5:abc' })).toBeUndefined();
    expect(digestOf({ digest: 'sha256:short' })).toBeUndefined();
  });
});
