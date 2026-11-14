import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Asset, AssetField, getPermissionsAsync, MediaType, presentPermissionsPicker, Query, requestPermissionsAsync } from 'expo-media-library';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Recent photos and videos for the in-app attachment gallery (newest first, paged). Sorted by the file's
 * modification date: Android's "date taken" comes from camera EXIF, so screenshots and saved images have
 * none and would sink to the end of the list. Uses the media
 * store's lightweight metadata (no file decoding) so the grid opens fast; a tile's file URI is
 * resolved only when it's picked. Only photo + video access is requested.
 */
export type RecentMedia = { id: string; video: boolean; durationMs: number | null; filename: string | null };
export type MediaAccess = 'unknown' | 'granted' | 'limited' | 'denied';

const PAGE = 60;

export function accessOf(p: { granted: boolean; accessPrivileges?: string; canAskAgain?: boolean }): MediaAccess {
  if (!p.granted) return 'denied';
  return p.accessPrivileges === 'limited' ? 'limited' : 'granted';
}

export function useRecentMedia(active: boolean) {
  const [items, setItems] = useState<RecentMedia[]>([]);
  const [access, setAccess] = useState<MediaAccess>('unknown');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const rows = await new Query().within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
        .orderBy({ key: AssetField.MODIFICATION_TIME, ascending: false }).offset(offset).limit(PAGE).exeForMetadata();
      const page = rows.map(r => ({ id: r.id, video: r.mediaType === MediaType.VIDEO, durationMs: r.duration ?? null, filename: r.filename ?? null }));
      setItems(prev => offset === 0 ? page : [...prev, ...page.filter(p => !prev.some(q => q.id === p.id))]);
      setDone(page.length < PAGE);
    } catch { setDone(true); } finally { setLoading(false); }
  }, []);

  // Check (don't prompt) when the sheet opens; prompt only when the user taps "Allow access".
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    let live = true;
    void getPermissionsAsync(false, ['photo', 'video']).then(p => {
      if (!live) return;
      const a = accessOf(p); setAccess(a);
      if (a !== 'denied') void load(0);
    }).catch(() => { if (live) setAccess('denied'); });
    return () => { live = false; };
  }, [active, load]);

  const allow = useCallback(async () => {
    const p = await requestPermissionsAsync(false, ['photo', 'video']).catch(() => null);
    if (!p) return;
    const a = accessOf(p); setAccess(a);
    if (a !== 'denied') await load(0);
  }, [load]);
  /** With "limited" access, let the user choose more photos to share with the app. */
  const chooseMore = useCallback(async () => { await presentPermissionsPicker(['photo', 'video']).catch(() => {}); await load(0); }, [load]);
  const more = useCallback(() => { if (!loading && !done) void load(items.length); }, [loading, done, items.length, load]);
  return { items, access, loading, done, allow, chooseMore, more };
}

/** Resolve picked tiles into the same shape the document picker returns, so uploads are shared. */
export async function resolveMedia(ids: string[]): Promise<{ uri: string; name: string; mimeType?: string; size?: number; lastModified: number }[]> {
  const out: { uri: string; name: string; mimeType?: string; size?: number; lastModified: number }[] = [];
  for (const id of ids) {
    try {
      const asset = new Asset(id);
      const info = await asset.getInfo();
      const video = info.mediaType === MediaType.VIDEO;
      let name = info.filename || `${video ? 'video' : 'photo'}-${Date.now()}`;
      let uri = info.uri;
      // Models only accept PNG/JPEG/WebP/GIF. Phones often save HEIC; convert those to JPEG here so the
      // picture still reaches a vision model instead of going up as a plain file.
      if (!video && needsJpeg(name)) {
        const ref = await ImageManipulator.manipulate(uri).renderAsync();
        const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
        uri = saved.uri; name = name.replace(/\.[^.]+$/, '') + '.jpg';
      }
      out.push({ uri, name, mimeType: mimeFromName(name, video), lastModified: info.modificationTime ?? 0 });
    } catch { /* skip an item that can't be read (e.g. deleted meanwhile) */ }
  }
  return out;
}

export function mimeFromName(name: string, video: boolean) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', '3gp': 'video/3gpp', m4v: 'video/x-m4v' };
  return map[ext] ?? (video ? 'video/mp4' : 'image/jpeg');
}

/** 0:07, 1:23, 1:02:03 */
export function durationLabel(ms: number | null) {
  if (!ms || ms < 0) return '';
  const s = Math.round(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Photos the Harness can't take as images (HEIC/HEIF and other non-web formats) are converted to JPEG. */
export function needsJpeg(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
}
