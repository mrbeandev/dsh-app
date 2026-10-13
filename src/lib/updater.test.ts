import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '12.0.0' } } }));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
vi.mock('expo-intent-launcher', () => ({}));
const { compareVersions, pickRelease, checkForUpdate } = await import('./updater');

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
