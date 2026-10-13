import type { HarnessClient } from './harness';
import { HarnessError } from './harness';

/**
 * Folder browsing that works on every Harness.
 *
 * The Harness exposes one of two directory-picker capabilities (dsh-host-directory-picker-auto):
 *   - `browse` — `directoryPicker/list` + `createDirectory` (remote/headless hosts, e.g. Termux);
 *   - `native` — an OS chooser on the host's own display (local desktop hosts). Remote clients
 *     can't use it, and `directoryPicker/list` is refused ("needs the browse capability").
 * On a `native` host we fall back to `workspaceFiles/list` scoped to an existing session: it can
 * list any directory inside that session's workspace root, which is enough to pick a project
 * folder or a sub-folder. Creating folders is only possible with `browse`.
 */
export type DirEntry = { name: string; path: string; hidden: boolean };
export type DirListing = { path: string; home: string; crumbs: { name: string; path: string }[]; entries: DirEntry[]; truncated?: boolean };
export type DirMode = { kind: 'browse' } | { kind: 'scoped'; sessionId: string; root: string };

const join = (base: string, name: string) => `${base.replace(/\/+$/, '')}/${name}`;
const crumbsOf = (path: string, root = '/') => {
  const out: { name: string; path: string }[] = [];
  const rootTrim = root.replace(/\/+$/, '') || '/';
  const rel = path.startsWith(rootTrim) ? path.slice(rootTrim.length) : path;
  out.push({ name: rootTrim === '/' ? '/' : rootTrim.split('/').filter(Boolean).pop() ?? rootTrim, path: rootTrim });
  let acc = rootTrim === '/' ? '' : rootTrim;
  for (const seg of rel.split('/').filter(Boolean)) { acc = `${acc}/${seg}`; out.push({ name: seg, path: acc }); }
  return out;
};

export function isNativeOnly(e: unknown) {
  return /browse capability|serves "native"/i.test(e instanceof Error ? e.message : String(e)) || (e instanceof HarnessError && /capability/i.test(e.code));
}

export async function listDir(client: HarnessClient, mode: DirMode, path?: string): Promise<DirListing> {
  if (mode.kind === 'browse') return client.call<DirListing>('directoryPicker/list', path ? { path } : {});
  const target = path ?? mode.root;
  const rel = target === mode.root ? '.' : target.startsWith(`${mode.root}/`) ? target.slice(mode.root.length + 1) : target;
  const l = await client.call<{ path: string; entries: { name: string; type: string }[]; truncated: boolean }>('workspaceFiles/list', { workspaceFileScopeId: mode.sessionId, path: rel });
  const entries = l.entries.filter(e => e.type === 'directory').map(e => ({ name: e.name, path: join(target, e.name), hidden: e.name.startsWith('.') })).sort((a, b) => a.name.localeCompare(b.name));
  return { path: target, home: mode.root, crumbs: crumbsOf(target, mode.root), entries, truncated: l.truncated };
}
