import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { useApp } from '../state/app';
import { fileMediaUrl } from '../lib/fileMedia';
import { ImageViewer } from './ImageViewer';
import { Loading } from './Loader';
import { T } from './ui';

/** Downloaded copies per Harness + path, so scrolling back doesn't re-download. */
const memo = new Map<string, string>();

function cacheName(key: string) {
  let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const ext = key.match(/\.(png|jpe?g|gif|webp)$/i)?.[1] ?? 'img';
  return `md-${(h >>> 0).toString(36)}.${ext}`;
}

/**
 * An image the agent linked in its reply that lives on the Harness machine (e.g. `/tmp/shot.png`).
 * Loaded from the Harness's `/api/file` (same as the web UI) with the app's login, saved to the app cache.
 */
export function HarnessFileImage({ path, alt }: { path: string; alt?: string }) {
  const { client, colors } = useApp();
  const key = `${client?.connection.url ?? ''}|${path}`;
  const [uri, setUri] = useState(() => memo.get(key) ?? '');
  const [error, setError] = useState('');
  const [ratio, setRatio] = useState(16 / 10);
  const [viewing, setViewing] = useState(false);
  useEffect(() => {
    if (uri || !client) return;
    let live = true;
    const url = fileMediaUrl(client.connection.url, path);
    const done = (u: string) => { memo.set(key, u); if (memo.size > 40) memo.delete(memo.keys().next().value!); if (live) setUri(u); };
    const fail = (e: unknown) => { if (!live) return; const m = String((e as Error)?.message ?? e); setError(/404|not found/i.test(m) ? 'The image file is no longer on the Harness.' : /413/.test(m) ? 'The image is too large to show.' : `Couldn’t load image: ${m}`); };
    if (Platform.OS === 'web') { done(url); return () => { live = false; }; }
    (async () => {
      const dir = new Directory(Paths.cache, 'chat-images');
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const target = new File(dir, cacheName(key));
      if (target.exists && (target.size ?? 0) > 0) return target.uri;
      const file = await File.downloadFileAsync(url, target, { headers: client.transferHeaders, idempotent: true });
      return file.uri;
    })().then(done, fail);
    return () => { live = false; };
  }, [client, key, path, uri]);
  useEffect(() => { if (uri) Image.getSize(uri, (w, h) => { if (w && h) setRatio(w / h); }, () => {}); }, [uri]);
  const name = path.split('/').pop();
  return <View style={{ marginVertical: 6, gap: 4 }}>
    {uri ? <Pressable accessibilityRole="imagebutton" accessibilityLabel={alt ? `Image: ${alt}` : `Image ${name}`} accessibilityHint="Tap to view full screen" onPress={() => setViewing(true)}>
      <Image source={{ uri }} resizeMode="contain" onError={() => setError('Couldn’t show this image.')} style={{ width: '100%', aspectRatio: ratio, maxHeight: 420, borderRadius: 10, backgroundColor: colors.fill }} />
    </Pressable>
      : error ? <T style="caption1" color="secondary">{`${alt ? `${alt} · ` : ''}${error}`}</T>
      : <View style={{ width: '100%', aspectRatio: 16 / 10, maxHeight: 260, borderRadius: 10, backgroundColor: colors.fill, justifyContent: 'center' }}><Loading fill={false} size="sm" /></View>}
    {alt && uri ? <T style="caption2" color="tertiary">{alt}</T> : null}
    {uri ? <ImageViewer uri={uri} name={alt || name} detail={path} visible={viewing} onClose={() => setViewing(false)} /> : null}
  </View>;
}
