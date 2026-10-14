import { randomUUID } from 'expo-crypto';
import type { HarnessClient } from './harness';

/**
 * Folder browsing through the Harness's official terminal API, for Harnesses whose directory picker
 * is the desktop-only "native" chooser (it refuses remote listing). Works on every Harness with a POSIX
 * shell, with no Harness configuration.
 *
 * Safety: only `cd`/`printf`/`test` (and `mkdir` for New Folder) run; paths are passed single-quoted
 * with embedded quotes escaped, and each command is fenced by random markers so prompt noise, echo
 * and colours can't be mistaken for results. Folder names are hex-encoded by the shell (od), so
 * spaces, quotes, newlines or non-UTF-8 bytes in names can't break parsing.
 */
export type ShellListing = { path: string; home: string; entries: { name: string; path: string; hidden: boolean }[] };

/** POSIX single-quote a string: 'it'\''s'. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** Hex → UTF-8 (invalid bytes become U+FFFD; the raw path stays exact via the hex form). */
export function fromHex(hex: string) {
  const bytes = new Uint8Array((hex.match(/../g) ?? []).map(h => parseInt(h, 16)));
  return new TextDecoder().decode(bytes);
}

/** Pull the text between `${tag}_B` and `${tag}_E:<code>` markers from raw terminal output. */
export function extractFenced(raw: string, tag: string): { body: string; code: number } | null {
  const clean = raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)/g, '').replace(/\r/g, '');
  const begin = clean.lastIndexOf(`${tag}_B\n`);
  if (begin < 0) return null;
  const rest = clean.slice(begin + tag.length + 3);
  const end = rest.match(new RegExp(`${tag}_E:(\\d+)`));
  if (!end || end.index === undefined) return null;
  return { body: rest.slice(0, end.index), code: Number(end[1]) };
}

/**
 * Shell snippet that prints, for one directory: its absolute path, then one hex-encoded name per
 * child directory (including hidden ones, excluding . and ..). Uses only POSIX sh + od.
 */
export function listScript(path: string, tag: string) {
  // The inner program always runs under POSIX `sh`, whatever the user's login shell is (zsh aborts on
  // unmatched globs, fish has different syntax). It is passed as one single-quoted argument.
  const inner = [
    `cd -- "$1" 2>/dev/null || exit 3`,
    `pwd -P`,
    `for d in * .[!.]* ..?*; do if [ -d "$d" ]; then printf 'D:'; printf '%s' "$d" | od -An -v -tx1 | tr -d ' \\n'; printf '\\n'; fi; done`,
    `exit 0`,
  ].join('; ');
  return `printf '%s_B\\n' ${tag}; sh -c ${shq(inner)} sh ${shq(path)}; printf '%s_E:%s\\n' ${tag} $?`;
}

export function parseListing(body: string, home: string): ShellListing {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const path = lines.find(l => l.startsWith('/')) ?? '/';
  const entries = lines.filter(l => l.startsWith('D:')).map(l => fromHex(l.slice(2)))
    .filter(n => n && n !== '.' && n !== '..')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
    .map(name => ({ name, path: `${path === '/' ? '' : path}/${name}`, hidden: name.startsWith('.') }));
  return { path, home, entries };
}

export class ShellBrowser {
  private id = `dsh-picker-${randomUUID().slice(0, 8)}`;
  private attachment = `att-${randomUUID().slice(0, 12)}`;
  private out = '';
  private stop: (() => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  home = '/';

  constructor(private client: HarnessClient, private sessionId: string) {}

  async open() {
    await this.client.call('terminal/create', { agentId: this.sessionId, request: { id: this.id, cols: 200, rows: 50 } });
    // The Harness gives input control to the latest *attached* viewer. The attachment exists once the
    // follow stream delivers its opening snapshot, so wait for that before writing anything.
    let attached!: () => void; let failed!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => { attached = res; failed = rej; });
    this.stop = this.client.follow('terminal/follow', { agentId: this.sessionId, id: this.id, attachmentId: this.attachment }, f => {
      if (f.type === 'snapshot') { this.out += f.screen ?? ''; attached(); }
      else if (f.type === 'output') this.out += f.data ?? '';
      else if (f.type === 'stream-error') failed(new Error(f.error?.message ?? 'Terminal stream failed.'));
      if (this.out.length > 400_000) this.out = this.out.slice(-200_000);
    });
    const timer = setTimeout(() => failed(new Error('The Harness terminal did not attach in time.')), 10000);
    try { await ready; } finally { clearTimeout(timer); }
    // Quiet, predictable shell: no echo, no history, plain prompt; works in bash/zsh/sh.
    await this.write(" stty -echo 2>/dev/null; unset HISTFILE; PS1=''; PROMPT_COMMAND=''; export LC_ALL=C\n");
    const r = await this.run(tag => `printf '%s_B\\n' ${tag}; printf '%s\\n' "$HOME"; printf '%s_E:0\\n' ${tag}`);
    this.home = r.body.trim().split('\n').pop()?.trim() || '/';
  }

  private async write(data: string) {
    const call = () => this.client.call('terminal/write', { agentId: this.sessionId, id: this.id, attachmentId: this.attachment, data });
    try { return await call(); }
    catch (e) {
      if (!/controlled by another attachment/i.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise(r => setTimeout(r, 400)); return call();
    }
  }

  /** Run one fenced command; serialised so outputs never interleave. */
  private run(script: (tag: string) => string, timeoutMs = 15000) {
    const task = this.queue.then(async () => {
      const tag = `DSHPK${randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await this.write(` ${script(tag)}\n`);
      const started = Date.now();
      for (;;) {
        const hit = extractFenced(this.out, tag);
        if (hit) return hit;
        if (Date.now() - started > timeoutMs) throw new Error('The Harness shell did not answer in time.');
        await new Promise(r => setTimeout(r, 80));
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async list(path?: string): Promise<ShellListing> {
    const target = path || this.home;
    const r = await this.run(tag => listScript(target, tag));
    if (r.code === 3) throw new Error(`Can’t open ${target} (missing or no permission).`);
    return parseListing(r.body, this.home);
  }

  async mkdir(parent: string, name: string) {
    if (!name.trim() || /[/\0]/.test(name) || name === '.' || name === '..') throw new Error('Use a single folder name without slashes.');
    const target = `${parent === '/' ? '' : parent}/${name}`;
    const r = await this.run(tag => `printf '%s_B\\n' ${tag}; sh -c 'mkdir -- "$1" 2>&1' sh ${shq(target)}; printf '%s_E:%s\\n' ${tag} $?`);
    if (r.code !== 0) throw new Error(r.body.trim() || `Couldn’t create ${name}.`);
    return target;
  }

  async close() {
    this.stop?.(); this.stop = null;
    await this.client.call('terminal/close', { agentId: this.sessionId, id: this.id }).catch(() => {});
  }
}
