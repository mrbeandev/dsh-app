import { useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import type { HarnessClient } from './harness';
import { errorMessage } from './harness';
import { imageMediaType, type ImportCategory, type ImportItem } from './imports';
import { prepareImport } from './upload';

export function useImports(client: HarnessClient | null, sessionId: string, report: (message: string) => void) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const tasks = useRef(new Map<string, AbortController>());
  const sources = useRef(new Map<string, DocumentPicker.DocumentPickerAsset>());
  useEffect(() => {
    const running = tasks.current, assets = sources.current;
    return () => { running.forEach(c => c.abort()); running.clear(); assets.clear(); };
  }, [client, sessionId]);
  const start = (id: string, asset: DocumentPicker.DocumentPickerAsset) => {
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
  };
  const pick = async (category: ImportCategory) => {
    if (!client) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: [...category.types], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      const fresh = result.assets.map(asset => {
        const id = randomUUID(); sources.current.set(id, asset);
        return { id, uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, image: !!imageMediaType(asset.name, asset.mimeType), progress: 0, state: 'uploading' as const };
      });
      setItems(old => [...old, ...fresh]);
      for (const item of fresh) start(item.id, sources.current.get(item.id)!);
    } catch (e) { report(errorMessage(e)); }
  };
  const remove = (id: string) => { tasks.current.get(id)?.abort(); sources.current.delete(id); setItems(old => old.filter(i => i.id !== id)); };
  const retry = (id: string) => { const source = sources.current.get(id); if (source) start(id, source); };
  return { items, setItems, pick, remove, retry };
}
