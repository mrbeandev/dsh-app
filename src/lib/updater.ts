import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';

/**
 * In-app updater (Android). Releases are published on GitHub; each release carries one APK asset.
 *   check()    → GET the latest release from the public GitHub API, compare versions (semver).
 *   download() → stream the APK into app storage with progress (runs off the UI, cancellable).
 *   install()  → hand the APK to Android's package installer; the user confirms the install.
 * No background service: checks run when the app starts (at most every 6 h) or on demand.
 */
export const REPO = 'mrbeandev/dsh-app';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export type Release = { version: string; tag: string; name: string; notes: string; publishedAt: string; url: string; apkUrl: string; apkName: string; size: number };
export type UpdateState =
  | { kind: 'idle' } | { kind: 'checking' } | { kind: 'current'; checkedAt: number }
  | { kind: 'available'; release: Release } | { kind: 'downloading'; release: Release; progress: number }
  | { kind: 'ready'; release: Release; file: string } | { kind: 'error'; message: string; release?: Release };

export const currentVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

/** Compare dotted versions (ignores a leading v and pre-release suffix). */
export function compareVersions(a: string, b: string) {
  const parse = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

export function pickRelease(json: any): Release | null {
  const asset = (json?.assets ?? []).find((a: any) => /\.apk$/i.test(String(a?.name ?? '')));
  if (!json?.tag_name || !asset?.browser_download_url) return null;
  return { version: String(json.tag_name).replace(/^v/i, ''), tag: String(json.tag_name), name: String(json.name || json.tag_name), notes: String(json.body ?? ''), publishedAt: String(json.published_at ?? ''), url: String(json.html_url ?? `https://github.com/${REPO}/releases`), apkUrl: String(asset.browser_download_url), apkName: String(asset.name), size: Number(asset.size) || 0 };
}

export async function checkForUpdate(signal?: AbortSignal): Promise<Release | null> {
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal });
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`Update check failed (${res.status}).`);
  const release = pickRelease(await res.json());
  return release && compareVersions(release.version, currentVersion()) > 0 ? release : null;
}

export type Download = { promise: Promise<string>; cancel: () => void };
export function downloadUpdate(release: Release, onProgress: (fraction: number) => void): Download {
  const target = new File(Paths.cache, `dsh-update-${release.version}.apk`);
  if (target.exists) target.delete();
  const abort = new AbortController();
  const task = File.createDownloadTask(release.apkUrl, target, {
    signal: abort.signal,
    onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => onProgress(totalBytes > 0 ? bytesWritten / totalBytes : release.size ? bytesWritten / release.size : 0),
  });
  const promise = task.downloadAsync().then((file: File | null) => {
    const f = file ?? target;
    if (release.size && f.size !== release.size) throw new Error('The download is incomplete. Try again.');
    return f.uri;
  });
  return { promise, cancel: () => abort.abort() };
}

/** Open the system installer. Android asks the user to allow installs from this app the first time. */
export async function installUpdate(fileUri: string) {
  if (Platform.OS !== 'android') throw new Error('In-app updates are available on Android only.');
  const file = new File(fileUri);
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', { data: file.contentUri, flags: 1, type: 'application/vnd.android.package-archive' });
}
