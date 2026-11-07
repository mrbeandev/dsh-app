import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { MAX_WINDOW, mimeOf, readByteWindow, statFile, type FileStat } from './workspaceFiles';
import type { HarnessClient } from './harness';

/**
 * Device-side downloads.
 * Android: the user picks a folder once (Storage Access Framework — pick Downloads), we remember it and save there,
 * so files show up in Files/Gallery. A private app copy is kept too, for Open/Share via a content:// URI.
 * iOS / fallback: saved in the app's Documents, then Open/Share via the share sheet.
 */
const KEY = 'dsh.downloadFolder';

export type SavedFile = { name: string; local: File; publicUri?: string; folderName?: string };

async function folder(forcePick = false): Promise<Directory | null> {
  if (Platform.OS !== 'android') return null;
  const saved = forcePick ? null : await SecureStore.getItemAsync(KEY);
  if (saved) {
    const dir = new Directory(saved);
    try { if (dir.exists) return dir; } catch { /* permission revoked: pick again */ }
  }
  try {
    const picked = await Directory.pickDirectoryAsync();
    await SecureStore.setItemAsync(KEY, picked.uri);
    return picked;
  } catch { return null; } // user cancelled the picker
}

export async function downloadFolderLabel(): Promise<string | null> {
  const uri = Platform.OS === 'android' ? await SecureStore.getItemAsync(KEY) : null;
  if (!uri) return null;
  try { return decodeURIComponent(uri).split(/[:/]/).filter(Boolean).pop() ?? 'Chosen folder'; } catch { return 'Chosen folder'; }
}
export async function changeDownloadFolder() { return (await folder(true)) !== null; }

function uniqueName(dir: Directory, name: string) {
  let existing: string[] = [];
  try { existing = dir.list().map(x => x.name); } catch { /* listing not allowed: rely on SAF auto-renaming */ }
  if (!existing.includes(name)) return name;
  const dot = name.lastIndexOf('.'); const base = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; ; i++) { const n = `${base} (${i})${ext}`; if (!existing.includes(n)) return n; }
}

export async function saveDownload(name: string, bytes: Uint8Array): Promise<SavedFile> {
  // Private copy (always): openable/shareable through a FileProvider content:// URI.
  const cache = new Directory(Paths.document, 'downloads');
  cache.create({ idempotent: true, intermediates: true });
  const local = new File(cache, uniqueName(cache, name));
  local.create({ overwrite: true });
  local.write(bytes);
  if (Platform.OS !== 'android') return { name: local.name, local };
  const dir = await folder();
  if (!dir) return { name: local.name, local };
  const target = dir.createFile(uniqueName(dir, name), mimeOf(name));
  target.write(bytes);
  return { name: target.name, local, publicUri: target.uri, folderName: (await downloadFolderLabel()) ?? undefined };
}

export async function openFile(saved: SavedFile) {
  if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: saved.local.contentUri, flags: 1, type: mimeOf(saved.name) });
    return;
  }
  await Sharing.shareAsync(saved.local.uri, { mimeType: mimeOf(saved.name), UTI: undefined });
}

export async function shareFile(saved: SavedFile) {
  await Sharing.shareAsync(saved.local.uri, { mimeType: mimeOf(saved.name), dialogTitle: saved.name });
}

/**
 * Stream a Harness file straight to disk in 2 MB windows (no whole-file buffer in JS), into the
 * app's downloads folder; then copy it to the user's chosen Downloads folder on Android. Used for
 * large files such as videos. Returns the saved file plus the stat it was read against.
 */
export async function streamDownload(client: HarnessClient, sessionId: string, path: string, name: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<{ saved: SavedFile; stat: FileStat }> {
  const stat = await statFile(client, sessionId, path);
  const total = stat.bytes ?? 0;
  const cache = new Directory(Paths.document, 'downloads');
  cache.create({ idempotent: true, intermediates: true });
  const local = new File(cache, uniqueName(cache, name));
  local.create({ overwrite: true });
  const handle = local.open();
  let offset = 0;
  try {
    onProgress?.(0, total);
    while (offset < total) {
      if (signal?.aborted) throw new Error('Download cancelled.');
      const win = await readByteWindow(client, sessionId, path, offset, Math.min(MAX_WINDOW, total - offset));
      if (!win.data.length) break;
      handle.writeBytes(win.data.subarray(0, Math.min(win.data.length, total - offset)));
      offset += win.data.length;
      onProgress?.(Math.min(offset, total), total);
      if (win.eof) break;
    }
  } catch (e) { handle.close(); try { local.delete(); } catch { /* ignore */ } throw e; }
  handle.close();
  if (offset < total) { try { local.delete(); } catch { /* ignore */ } throw new Error('The file changed while downloading. Try again.'); }
  if (Platform.OS !== 'android') return { saved: { name: local.name, local }, stat };
  const dir = await folder();
  if (!dir) return { saved: { name: local.name, local }, stat };
  const target = dir.createFile(uniqueName(dir, name), mimeOf(name));
  // Chunked copy through handles: works for Storage Access Framework targets, keeps memory flat.
  const src = local.open(); const dst = target.open();
  try { for (let chunk = src.readBytes(MAX_WINDOW); chunk.length; chunk = src.readBytes(MAX_WINDOW)) dst.writeBytes(chunk); }
  finally { src.close(); dst.close(); }
  return { saved: { name: target.name, local, publicUri: target.uri, folderName: (await downloadFolderLabel()) ?? undefined }, stat };
}

/** Rebuild a SavedFile from a stored download record (see downloadRecord.ts). */
export function savedFromRecord(rec: { name: string; localUri: string; publicUri?: string; folderName?: string }): SavedFile {
  return { name: rec.name, local: new File(rec.localUri), publicUri: rec.publicUri, folderName: rec.folderName };
}
