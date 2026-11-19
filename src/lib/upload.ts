import { File, UploadTask, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { endpoint } from './protocol';
import type { HarnessClient } from './harness';
import { imageMediaType, parseUploadReceipt, type PromptPart } from './imports';
import { diagnostic } from './diagnostics';

/** Same shape check the Harness applies: standard alphabet, length a multiple of 4, padding only at the end. */
export function isCanonicalBase64(s: string) {
  return s.length > 0 && s.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(s);
}

/** Images use the web UI's encoded image prompt path. Generic files stream to its staged-upload route. */
export async function prepareImport(client: HarnessClient, sessionId: string, asset: DocumentPickerAsset, signal: AbortSignal, progress: (value: number) => void): Promise<PromptPart> {
  const mediaType = imageMediaType(asset.name, asset.mimeType);
  diagnostic('import.start', { bytes: asset.size ?? 0, phase: mediaType ? 'image' : 'file' });
  if (mediaType) {
    // Encoded image prompts must live in JS memory. Generic uploads below do not have this limit.
    let file = Platform.OS === 'web' ? null : new File(asset.uri);
    if ((asset.size ?? file?.size ?? 0) > 20 * 1024 * 1024) throw new Error('This image is too large for mobile import (20 MB maximum).');
    // Phone photos are 2–6 MB; sent as base64 they make one huge request that crawls through tunnels.
    // Models downscale big images anyway, so shrink large JPEG/PNG/WebP photos to ≤2048 px JPEG first.
    let outType = mediaType;
    if (file && (file.size ?? 0) > SHRINK_ABOVE_BYTES && mediaType !== 'image/gif') {
      const shrunk = await shrinkImage(asset.uri).catch(() => null);
      if (shrunk && shrunk.size < (file.size ?? Infinity)) { file = new File(shrunk.uri); outType = 'image/jpeg'; }
    }
    if (signal.aborted) throw new Error('Import cancelled.');
    const data = file ? await file.base64() : await new Promise<string>((resolve, reject) => {
      if (!asset.file) { reject(new Error('Selected image is unavailable. Please choose it again.')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(asset.file);
    });
    if (signal.aborted) throw new Error('Import cancelled.');
    // The Harness only accepts canonical base64 (no line breaks, correct length/padding). A file that
    // was still being written when read gives a short, invalid string; re-read once before giving up.
    let clean = data.replace(/\s+/g, '');
    if (!isCanonicalBase64(clean) && file) { await new Promise(r => setTimeout(r, 300)); clean = (await file.base64()).replace(/\s+/g, ''); }
    if (!isCanonicalBase64(clean)) throw new Error('Couldn’t read this image completely. Remove it and attach it again.');
    progress(1);
    return { type: 'image', mediaType: outType, data: clean, name: outType === mediaType ? asset.name : asset.name.replace(/\.[^.]+$/, '') + '.jpg' };
  }
  const url = new URL(endpoint(client.connection.url, '/api/session/uploadFileBinary'));
  url.searchParams.set('sessionId', sessionId); url.searchParams.set('name', asset.name);
  if (Platform.OS === 'web') {
    const response = await fetch(url.toString(), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: asset.file, signal });
    if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
    const receiptId = parseUploadReceipt(await response.text()); progress(1); return { type: 'file', receiptId };
  }
  const task = new UploadTask(new File(asset.uri), url.toString(), {
    httpMethod: 'POST', uploadType: UploadType.BINARY_CONTENT, signal,
    headers: { 'Content-Type': 'application/octet-stream', ...client.transferHeaders },
    onProgress: p => progress(p.totalBytes > 0 ? Math.min(0.99, p.bytesSent / p.totalBytes) : 0),
  });
  try {
    const started = Date.now(); const result = await task.uploadAsync();
    diagnostic('import.response', { status: result.status, durationMs: Date.now() - started });
    if (result.status !== 200) throw new Error(`Upload failed (HTTP ${result.status}). Reconnect if your token expired.`);
    const receiptId = parseUploadReceipt(result.body); progress(1); return { type: 'file', receiptId };
  } finally { task.release(); }
}

/** Photos above this are re-encoded smaller before sending. */
export const SHRINK_ABOVE_BYTES = 700 * 1024;
/** Longest edge kept when shrinking (what vision models use at most). */
export const SHRINK_MAX_EDGE = 2048;

/** Re-encode a photo to JPEG with its longest edge at most SHRINK_MAX_EDGE. */
async function shrinkImage(uri: string): Promise<{ uri: string; size: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  const probe = await ctx.renderAsync();
  const long = Math.max(probe.width, probe.height);
  const target = long > SHRINK_MAX_EDGE ? ctx.resize(probe.width >= probe.height ? { width: SHRINK_MAX_EDGE, height: null } : { width: null, height: SHRINK_MAX_EDGE }) : ctx;
  const ref = target === ctx && long <= SHRINK_MAX_EDGE ? probe : await target.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  return { uri: saved.uri, size: new File(saved.uri).size ?? Infinity };
}
