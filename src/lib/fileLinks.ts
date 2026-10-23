/**
 * Agents link workspace files in their replies, e.g. `[FEATURE-BACKLOG.md](docs/FEATURE-BACKLOG.md)`,
 * `[app.tsx](/home/me/project/src/app.tsx#L42)` or `file:///home/me/project/README.md`. These aren't web
 * URLs, so tapping them did nothing. This turns such a link into a path inside the session's workspace
 * that the Files screens understand (relative to the workspace root), or null for anything else.
 */
export type FileTarget = { path: string; line?: number };

const WEB = /^(https?:|mailto:|tel:|data:|javascript:)/i;

export function resolveFileLink(href: string, workspaceRoot?: string): FileTarget | null {
  let raw = href.trim();
  if (!raw || WEB.test(raw) || raw.startsWith('#')) return null;
  if (/^file:/i.test(raw)) raw = raw.replace(/^file:\/\/(localhost)?/i, '');
  else if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[a-z]:[\\/]/i.test(raw)) return null; // other schemes (vscode:, app links…)
  try { raw = decodeURIComponent(raw); } catch { /* keep as typed */ }
  // Line hints: "#L42", "#L42-L50", ":42", ":42:7"
  let line: number | undefined;
  const hash = raw.match(/#L?(\d+)(?:-L?\d+)?$/i);
  if (hash) { line = Number(hash[1]); raw = raw.slice(0, hash.index); }
  else {
    const colon = raw.match(/:(\d+)(?::\d+)?$/);
    if (colon && !/^[a-z]:$/i.test(raw.slice(0, colon.index))) { line = Number(colon[1]); raw = raw.slice(0, colon.index); }
  }
  raw = raw.replace(/[?#].*$/, '').replace(/\\/g, '/');
  if (!raw) return null;

  const root = (workspaceRoot ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  let rel: string;
  if (raw.startsWith('/')) {
    // Absolute path: only follow it if it's inside this workspace (the Files API is workspace-scoped).
    if (!root || !(raw === root || raw.startsWith(`${root}/`))) return null;
    rel = raw.slice(root.length);
  } else {
    rel = raw;
  }
  // Normalise ./, ../ and duplicate slashes; refuse to climb out of the workspace.
  const parts: string[] = [];
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(seg);
  }
  return { path: parts.join('/'), ...(line ? { line } : {}) };
}

/** Split "a/b/c.txt" into its folder "a/b" and name. */
export function parentOf(path: string) {
  const i = path.lastIndexOf('/');
  return { dir: i >= 0 ? path.slice(0, i) : '', name: i >= 0 ? path.slice(i + 1) : path };
}
