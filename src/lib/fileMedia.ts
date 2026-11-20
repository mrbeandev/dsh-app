/**
 * Images an agent links in its reply as Markdown (`![alt](/abs/path.png)` or a path relative to the
 * session folder) are files on the Harness machine. The Harness web UI loads them from
 * `GET /api/file?path=<absolute path>` (session-controller `SessionMediaReferences`; images only up to the
 * attachment byte limit, 302 → versioned URL). The app does the same, with its own login cookie.
 */

/** Absolute path for a Markdown image destination, or undefined for web URLs / unusable paths. */
export function markdownImagePath(destination: string, sessionDir?: string): string | undefined {
  const cut = destination.search(/[?#]/);
  let path: string;
  try { path = decodeURIComponent(cut === -1 ? destination : destination.slice(0, cut)); } catch { return undefined; }
  path = path.trim().replace(/^<|>$/g, '');
  if (!path) return undefined;
  if (/^file:\/\//i.test(path)) path = path.replace(/^file:\/\//i, '');
  else if (!/^[a-z]:[/\\]/i.test(path) && /^[a-z][a-z\d+.-]*:/i.test(path)) return undefined; // http(s), data:, …
  if (/[\u0000-\u001f\u007f]/.test(path) || /^[/\\]{2}/.test(path)) return undefined;
  if (path.startsWith('/') || /^[a-z]:[/\\]/i.test(path)) return path;
  if (!sessionDir) return undefined;
  const base = sessionDir.replace(/[/\\]+$/, '');
  const parts = `${base}/${path.replace(/^\.\//, '')}`.split('/');
  const out: string[] = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return '/' + out.join('/');
}

/** Whether a Markdown destination is a plain web image the app can load directly. */
export function isWebImage(destination: string) {
  return /^https?:\/\//i.test(destination.trim());
}

/** `api/file` URL for an absolute path on the Harness. */
export function fileMediaUrl(baseUrl: string, path: string) {
  return new URL(`api/file?path=${encodeURIComponent(path)}`, baseUrl.endsWith('/') ? baseUrl : baseUrl + '/').href;
}
