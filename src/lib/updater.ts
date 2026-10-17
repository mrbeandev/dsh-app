import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DownloadTask, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { sha256File } from '../../modules/dsh-installer';

/**
 * In-app updater (Android). Releases are published on GitHub; each release carries one APK asset.
 *   check()    → GET the latest release from the public GitHub API, compare versions (semver).
 *   download() → stream the APK into app storage with progress (runs off the UI, cancellable).
 *   install()  → hand the APK to Android's package installer; the user confirms the install.
 * No background service: checks run when the app starts (at most every 6 h) or on demand.
 */
export const REPO = 'mrbeandev/dsh-app';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export type Release = { version: string; tag: string; name: string; notes: string; publishedAt: string; url: string; apkUrl: string; apkName: string; size: number; sha256?: string };
export type UpdateState =
  | { kind: 'idle' } | { kind: 'checking' } | { kind: 'current'; checkedAt: number }
  | { kind: 'available'; release: Release } | { kind: 'needs-permission'; release: Release } | { kind: 'downloading'; release: Release; progress: number }
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
  return { version: String(json.tag_name).replace(/^v/i, ''), tag: String(json.tag_name), name: String(json.name || json.tag_name), notes: String(json.body ?? ''), publishedAt: String(json.published_at ?? ''), url: String(json.html_url ?? `https://github.com/${REPO}/releases`), apkUrl: String(asset.browser_download_url), apkName: String(asset.name), size: Number(asset.size) || 0, sha256: digestOf(asset) };
}

/** GitHub publishes `digest: "sha256:<hex>"` for each release asset. */
export function digestOf(asset: any): string | undefined {
  const m = /^sha256:([0-9a-f]{64})$/i.exec(String(asset?.digest ?? ''));
  return m ? m[1].toLowerCase() : undefined;
}

export async function checkForUpdate(signal?: AbortSignal): Promise<Release | null> {
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, signal });
  if (res.status === 404) return null; // no releases yet
  if (!res.ok) throw new Error(`Update check failed (${res.status}).`);
  const release = pickRelease(await res.json());
  return release && compareVersions(release.version, currentVersion()) > 0 ? release : null;
}

export class UpdateCorrupt extends Error { constructor(message: string) { super(`${message} Tap Download to try again.`); this.name = 'UpdateCorrupt'; } }
/** The connection dropped mid-download; the partial file is kept so the next tap resumes it. */
export class UpdateInterrupted extends Error { constructor() { super('Download interrupted by a network problem. Tap Download to resume where it stopped.'); this.name = 'UpdateInterrupted'; } }
export type Download = { promise: Promise<string>; cancel: () => void };

const RETRIES = 4;
const isAbort = (e: unknown) => /abort|cancel/i.test(String((e as Error)?.name ?? '')) || /cancel/i.test(String((e as Error)?.message ?? ''));
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })); }, { once: true });
});

export function downloadUpdate(release: Release, onProgress: (fraction: number) => void): Download {
  const target = new File(Paths.cache, `dsh-update-${release.version}.apk`);
  // A partial file from an interrupted attempt is resumed; anything larger than the asset is stale.
  if (target.exists && release.size && target.size > release.size) target.delete();
  const abort = new AbortController();
  const options = {
    signal: abort.signal,
    // GitHub serves release assets through a redirect; the final response may not send Content-Length,
    // so fall back to the size the release API reported.
    onProgress: ({ bytesWritten, totalBytes }: { bytesWritten: number; totalBytes: number }) => {
      const total = release.size || totalBytes;
      onProgress(total > 0 ? Math.min(1, bytesWritten / total) : 0);
    },
  };
  // Start fresh, or continue from the bytes already on disk via an HTTP Range request
  // (GitHub's asset CDN answers 206; a server ignoring Range just sends the whole file again).
  const attempt = (): Promise<File | null> => {
    const have = target.exists ? target.size : 0;
    if (have > 0 && (!release.size || have < release.size)) {
      return DownloadTask.fromSavable({ url: release.apkUrl, fileUri: target.uri, isDirectory: false, resumeData: String(have) }, options).resumeAsync();
    }
    if (have > 0) return Promise.resolve(target); // already complete; verified below
    return File.createDownloadTask(release.apkUrl, target, options).downloadAsync();
  };
  const run = async (): Promise<File> => {
    for (let i = 0; ; i++) {
      try {
        return (await attempt()) ?? target;
      } catch (e) {
        if (abort.signal.aborted || isAbort(e)) throw e;
        // Transient network failure (connection reset/abort, Wi-Fi↔mobile switch): back off and resume.
        if (i >= RETRIES) throw new UpdateInterrupted();
        await sleep(1500 * 2 ** i, abort.signal);
      }
    }
  };
  const promise = run().then(async f => {
    if (release.size && f.size !== release.size) { if (f.size > release.size) f.delete(); throw new UpdateInterrupted(); }
    // Verify the exact bytes GitHub published, so a damaged download never reaches the installer
    // (Android would only say "package appears to be invalid").
    if (release.sha256) {
      const actual = await sha256File(f.uri);
      if (actual && actual !== release.sha256) { f.delete(); throw new UpdateCorrupt('The download was corrupted (checksum mismatch).'); }
    }
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
