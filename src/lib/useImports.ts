import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import type { HarnessClient } from './harness';
import { errorMessage } from './harness';
import { imageMediaType, type ImportCategory, type ImportItem } from './imports';
import { prepareImport } from './upload';
import { readDraftFiles, saveDraftFiles, type SavedImport } from './draftStore';

/**
 * Picked files survive leaving the chat or closing the app, like the draft text. The picker copies
 * into the cache (which Android may clear), so each file is copied into the app's document folder;
 * that copy is deleted once the message is sent or the attachment removed.
 */
const draftDir = () => new Directory(Paths.document, 'draft-attachments');
function keepCopy(asset: DocumentPicker.DocumentPickerAsset, id: string): string {
  if (Platform.OS === 'web') return asset.uri;
  try {
    const dir = draftDir(); if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${id}-${asset.name.replace(/[^\w.-]+/g, '_')}`);
    new File(asset.uri).copy(dest);
    return dest.uri;
  } catch { return asset.uri; }
}
function dropCopy(uri: string) {
  if (Platform.OS === 'web' || !uri.includes('/draft-attachments/')) return;
  try { const f = new File(uri); if (f.exists) f.delete(); } catch { /* already gone */ }
}

export function useImports(client: HarnessClient | null, sessionId: string, report: (message: string) => void, harnessUrl?: string) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const tasks = useRef(new Map<string, AbortController>());
  const sources = useRef(new Map<string, DocumentPicker.DocumentPickerAsset>());
  const restored = useRef(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const running = tasks.current, assets = sources.current;
    return () => { running.forEach(c => c.abort()); running.clear(); assets.clear(); };
  }, [client, sessionId]);

  const start = useCallback((id: string, asset: DocumentPicker.DocumentPickerAsset) => {
    if (!client) return;
    const controller = new AbortController(); tasks.current.set(id, controller);
    setItems(old => old.map(i => i.id === id ? { ...i, state: 'uploading', error: undefined, progress: 0 } : i));
    void prepareImport(client, sessionId, asset, controller.signal, progress => {
      if (!controller.signal.aborted) setItems(old => old.map(i => i.id === id ? { ...i, progress } : i));
    }).then(part => {
      if (!controller.signal.aborted) setItems(old => old.map(i => i.id === id ? { ...i, part, state: 'ready', progress: 1 } : i));
    }).catch(e => {
      if (!controller.signal.aborted) { const error = errorMessage(e); setItems(old => old.map(i => i.id === id ? { ...i, state: 'error', error } : i)); report(error); }
    }).finally(() => { if (tasks.current.get(id) === controller) tasks.current.delete(id); });
  }, [client, sessionId, report]);

  // Restore saved attachments once per chat. Uploaded files keep their receipt (no re-upload);
  // images are re-read from the kept copy; anything unfinished is prepared again.
  useEffect(() => {
    if (!harnessUrl || !sessionId || !client || restored.current) return;
    restored.current = true; let live = true;
    void readDraftFiles(harnessUrl, sessionId).then(saved => {
      if (!live) return;
      const usable = saved.filter(s => Platform.OS === 'web' || s.receiptId || (() => { try { return new File(s.uri).exists; } catch { return false; } })());
      const back: ImportItem[] = usable.map(s => ({
        id: s.id, uri: s.uri, name: s.name, mimeType: s.mimeType, size: s.size, image: s.image, progress: s.receiptId ? 1 : 0,
        state: s.receiptId ? 'ready' : 'uploading', part: s.receiptId ? { type: 'file', receiptId: s.receiptId } : undefined,
      }));
      if (back.length) setItems(old => [...back.filter(b => !old.some(o => o.id === b.id)), ...old]);
      for (const s of usable) {
        const asset = { uri: s.uri, name: s.name, mimeType: s.mimeType, size: s.size, lastModified: 0 } as DocumentPicker.DocumentPickerAsset;
        sources.current.set(s.id, asset);
        if (!s.receiptId) start(s.id, asset);
      }
      setReady(true);
    });
    return () => { live = false; };
  }, [harnessUrl, sessionId, client, start]);

  // Persist the current list (metadata only) once restore has run, whenever its shape changes.
  const lastSaved = useRef('');
  useEffect(() => {
    if (!harnessUrl || !sessionId || !ready) return;
    const list: SavedImport[] = items.map(i => ({ id: i.id, uri: i.uri, name: i.name, mimeType: i.mimeType, size: i.size, image: i.image, receiptId: i.part?.type === 'file' ? i.part.receiptId : undefined }));
    const sig = JSON.stringify(list);
    if (sig === lastSaved.current) return;
    lastSaved.current = sig;
    void saveDraftFiles(harnessUrl, sessionId, list).catch(() => {});
  }, [items, harnessUrl, sessionId, ready]);

  const pick = async (category: ImportCategory) => {
    if (!client) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: [...category.types], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const fresh = result.assets.map(picked => {
        const id = randomUUID();
        const asset = { ...picked, uri: keepCopy(picked, id) };
        sources.current.set(id, asset);
        return { id, uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, image: !!imageMediaType(asset.name, asset.mimeType), progress: 0, state: 'uploading' as const };
      });
      setItems(old => [...old, ...fresh]);
      for (const item of fresh) start(item.id, sources.current.get(item.id)!);
    } catch (e) { report(errorMessage(e)); }
  };
  const remove = (id: string) => { tasks.current.get(id)?.abort(); const src = sources.current.get(id); sources.current.delete(id); if (src) dropCopy(src.uri); setItems(old => old.filter(i => i.id !== id)); };
  const retry = (id: string) => { const source = sources.current.get(id); if (source) start(id, source); };
  /** After the Harness accepted a message: delete the kept copies of the attachments it carried. */
  const sent = (sentItems: ImportItem[]) => { for (const i of sentItems) { sources.current.delete(i.id); dropCopy(i.uri); } };
  return { items, setItems, pick, remove, retry, sent };
}
