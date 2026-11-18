/**
 * "Run on this device": the DeepSeek Harness inside a Debian + Node environment on the phone
 * (proot, no root). Native side: modules/dsh-local. This file holds the steps and pure helpers.
 *
 * Setup:
 *   1. download + verify + extract the environment image (GitHub pre-release asset);
 *   2. `npm install -g @deepseek-ai/dsh@<version>` inside it (needs internet, ~1.2 GB);
 *   3. first start creates the web profile; the app adds the trusted host and reads the token
 *      from harness.log, then connects to http://127.0.0.1:<port>.
 */
export const LOCAL_PORT = 3080;
export const LOCAL_URL = `http://127.0.0.1:${LOCAL_PORT}`;

/** The environment image (Debian 12 arm64 + Node 24). Bump together when publishing a new one. */
export const ROOTFS = {
  version: 'rootfs-debian12-node24-v1',
  url: 'https://github.com/mrbeandev/dsh-app/releases/download/rootfs-debian12-node24-v1/dsh-rootfs-debian12-node24-arm64.tar.gz',
  sha256: 'cdab558e7f2ee64b691ccf090c5e62764495418539d3c17d0f84f6353377f4c3',
  sizeBytes: 156_651_618,
};

/** Space needed: image download + unpacked environment + Harness install, with headroom. */
export const REQUIRED_FREE_BYTES = 2.5 * 1024 ** 3;

/** Harness versions offered at setup (newest first). `latest` follows npm. */
export const HARNESS_VERSIONS = ['latest', '0.2.2-rc.3', '0.2.1-rc.5'] as const;

/** Shell (inside the container) that installs or updates the Harness. Prints a marker on success. */
export function harnessInstallScript(version: string) {
  const spec = /^[0-9A-Za-z.\-]+$/.test(version) ? version : 'latest';
  return [
    'set -e',
    'mkdir -p /root/projects',
    'node --version',
    // Native install scripts the Harness needs on Linux; the Windows-only ones (koffi…) are skipped.
    `npm install -g @deepseek-ai/dsh@${spec} --no-audit --no-fund --allow-scripts=@deepseek-ai/dsh-subprocess-local,node-pty,protobufjs`,
    'dsh --version',
    'echo DSH_INSTALL_OK',
  ].join(' && ');
}

/** Pull the launch token from `dsh web` output ("…/?token=abc…"); the last one wins. */
export function tokenFromLog(log: string): string | null {
  const all = [...log.matchAll(/[?&]token=([A-Za-z0-9_-]{16,})/g)];
  return all.length ? all[all.length - 1][1] : null;
}

/** Whether the latest run in the log is listening yet, failed, or still starting. */
export function startState(log: string): 'listening' | 'exited' | 'starting' {
  const runs = log.split('--- starting dsh web');
  const last = runs[runs.length - 1] ?? '';
  if (/--- dsh web exited/.test(last)) return 'exited';
  if (/listening on|[?&]token=/.test(last)) return 'listening';
  return 'starting';
}

export function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** One progress line for the setup screen. */
export function progressLabel(p: { phase: string; done: number; total: number }) {
  if (p.phase === 'download') return `Downloading Linux environment… ${formatBytes(p.done)} of ${formatBytes(p.total)}`;
  if (p.phase === 'extract') return `Unpacking… ${Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100))}%`;
  return 'Linux environment ready';
}

/** State of a setup task from its log (written by the native service). */
export function taskResult(log: string): { done: boolean; ok: boolean; tail: string[] } {
  const runs = log.split('--- task started ---'); const last = runs[runs.length - 1] ?? '';
  const exited = last.match(/--- task exited \((-?\d+)\) ---/);
  const tail = last.replace(/--- task exited[^\n]*\n?/, '').split('\n').map(x => x.trimEnd()).filter(Boolean);
  return { done: !!exited, ok: !!exited && exited[1] === '0' && last.includes('DSH_INSTALL_OK'), tail };
}
