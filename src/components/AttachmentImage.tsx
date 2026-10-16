import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useApp } from '../state/app';
import type { ImageRef } from '../lib/protocol';
import { T } from './ui';
import { Loading } from './Loader';

/** Session image bytes (session/attachment → base64), cached in memory per attachment id. */
const cache = new Map<string, string>();

/**
 * Inline preview of an image a tool returned (Web UI parity: Read image shows the picture).
 * Loads only when rendered, i.e. when the step is expanded. Tap to toggle full width.
 */
export function AttachmentImage({ sessionId, image }: { sessionId: string; image: ImageRef }) {
  const { client, colors } = useApp();
  const cacheKey = `${client?.connection.url ?? ''}:${sessionId}:${image.attachmentId}`;
  const [uri, setUri] = useState(() => cache.get(cacheKey) ?? '');
  const [error, setError] = useState('');
  const [big, setBig] = useState(false);
  useEffect(() => {
    if (uri || !client) return;
    let active = true;
    client.request<{ attachment: { mediaType: string }; data: string }>('session/attachment', { sessionId, attachmentId: image.attachmentId })
      .then(r => { const u = `data:${r.attachment?.mediaType ?? image.mediaType};base64,${r.data}`; cache.set(cacheKey, u); if (cache.size > 24) cache.delete(cache.keys().next().value!); if (active) setUri(u); })
      .catch(e => { if (active) setError(String(e?.message ?? e)); });
    return () => { active = false; };
  }, [client, sessionId, image.attachmentId, image.mediaType, cacheKey, uri]);
  const ratio = image.width && image.height ? image.width / image.height : 16 / 10;
  const width = big ? '100%' : '70%';
  return <View style={{ padding: 10, gap: 4 }}>
    {uri ? <Pressable accessibilityRole="imagebutton" accessibilityLabel={image.name ? `Image ${image.name}` : 'Image'} onPress={() => setBig(b => !b)}>
      <Image source={{ uri }} resizeMode="contain" style={{ width, aspectRatio: ratio, maxHeight: big ? undefined : 320, borderRadius: 10, backgroundColor: colors.fill }} />
    </Pressable>
      : error ? <T style="caption1" color="danger">{`Couldn’t load image: ${error}`}</T>
      : <View style={{ width: '70%', aspectRatio: ratio, maxHeight: 320, borderRadius: 10, backgroundColor: colors.fill, justifyContent: 'center' }}><Loading fill={false} size="sm" /></View>}
    <T style="caption2" color="tertiary">{[image.name, image.width && image.height ? `${image.width}×${image.height}` : ''].filter(Boolean).join(' · ')}</T>
  </View>;
}
