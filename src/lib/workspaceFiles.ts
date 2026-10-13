import type { HarnessClient } from './harness';

/**
 * Official DSH Web UI file API (@deepseek-ai/dsh-api-workspace-files), scoped by session id.
 * Read-only by design: list / stat / read text pages / read raw bytes. Verified against a live Harness.
 */
export type FileEntry = { name: string; type: 'file' | 'directory' | 'other'; size?: number };
export type DirectoryListing = { path: string; entries: FileEntry[]; truncated: boolean };
export type FileStat = { absolutePath: string; version: string; bytes?: number };
export type TextPage = FileStat & { offset: number; text: string; lines: number; eof: boolean };
export type ByteWindow = FileStat & { offset: number; data: Uint8Array; eof: boolean };

/** Server caps (defaults documented by the package): one byte window ≤ 2 MiB, whole-file read ≤ 32 MiB. */
export const MAX_WINDOW = 2 * 1024 * 1024;

export const listDirectory = (client: HarnessClient, sessionId: string, path: string) =>
  client.call<DirectoryListing>('workspaceFiles/list', { workspaceFileScopeId: sessionId, path: path || '.' });
export const statFile = (client: HarnessClient, sessionId: string, path: string) =>
  client.call<FileStat>('workspaceFiles/stat', { workspaceFileScopeId: sessionId, path });
/** `offset` is a 1-based line number (the API rejects 0). */
export const readText = (client: HarnessClient, sessionId: string, path: string, offset = 1, limit = 400) =>
  client.call<TextPage>('workspaceFiles/read', { workspaceFileScopeId: sessionId, path, range: { offset, limit } });

/** One byte window via the binary Remote (multipart response: raw bytes + JSON metadata). */
export async function readByteWindow(client: HarnessClient, sessionId: string, path: string, offset: number, length: number): Promise<ByteWindow> {
  return client.callBinary<ByteWindow>('workspaceFiles/readBytes', { workspaceFileScopeId: sessionId, path, options: { range: { offset, length } } });
}

/** Download a whole file as bytes, paging in ≤2 MiB windows so any size works. */
export async function downloadBytes(client: HarnessClient, sessionId: string, path: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ bytes: Uint8Array; stat: FileStat }> {
  const stat = await statFile(client, sessionId, path);
  const total = stat.bytes ?? 0;
  const out = new Uint8Array(total);
  let offset = 0;
  onProgress?.(0, total);
  while (offset < total) {
    if (signal?.aborted) throw new Error('Download cancelled.');
    const win = await readByteWindow(client, sessionId, path, offset, Math.min(MAX_WINDOW, total - offset));
    if (!win.data.length) break;
    out.set(win.data.subarray(0, Math.min(win.data.length, total - offset)), offset);
    offset += win.data.length;
    onProgress?.(offset, total);
    if (win.eof) break;
  }
  if (offset !== total) throw new Error('The file changed while downloading. Try again.');
  return { bytes: out, stat };
}

export function formatSize(n?: number) {
  if (n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const MIME: Record<string, string> = { txt: 'text/plain', md: 'text/markdown', json: 'application/json', js: 'text/javascript', ts: 'text/plain', tsx: 'text/plain', py: 'text/x-python', html: 'text/html', css: 'text/css', csv: 'text/csv', xml: 'text/xml', yml: 'text/plain', yaml: 'text/plain', log: 'text/plain', sh: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf', zip: 'application/zip', apk: 'application/vnd.android.package-archive', mp3: 'audio/mpeg', mp4: 'video/mp4', mov: 'video/quicktime', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
export function mimeOf(name: string) { return MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'; }
export function isTextLike(name: string) { return /^(text\/|application\/(json|javascript|xml))/.test(mimeOf(name)) || !name.includes('.') || /^\./.test(name); }
export function isImage(name: string) { return mimeOf(name).startsWith('image/') && !name.endsWith('.svg'); }
