import { File, UploadTask, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { endpoint } from './protocol';
import type { HarnessClient } from './harness';
import { imageMediaType, parseUploadReceipt, type PromptPart } from './imports';
import { diagnostic } from './diagnostics';

/** Images use the web UI's encoded image prompt path. Generic files stream to its staged-upload route. */
export async function prepareImport(client: HarnessClient, sessionId: string, asset: DocumentPickerAsset, signal: AbortSignal, progress: (value: number) => void): Promise<PromptPart> {
  const mediaType = imageMediaType(asset.name, asset.mimeType);
  diagnostic('import.start', { bytes: asset.size ?? 0, phase: mediaType ? 'image' : 'file' });
  if (mediaType) {
    // Encoded image prompts must live in JS memory. Generic uploads below do not have this limit.
    const file = Platform.OS === 'web' ? null : new File(asset.uri);
    if ((asset.size ?? file?.size ?? 0) > 20 * 1024 * 1024) throw new Error('This image is too large for mobile import (20 MB maximum).');
    if (signal.aborted) throw new Error('Import cancelled.');
    const data = file ? await file.base64() : await new Promise<string>((resolve, reject) => {
      if (!asset.file) { reject(new Error('Selected image is unavailable. Please choose it again.')); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(asset.file);
    });
    if (signal.aborted) throw new Error('Import cancelled.');
    progress(1);
    return { type: 'image', mediaType, data, name: asset.name };
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
