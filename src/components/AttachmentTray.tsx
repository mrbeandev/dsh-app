import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import type { ImportItem } from '../lib/imports';
import { formatSize } from '../lib/workspaceFiles';
import { ImageViewer } from './ImageViewer';
import { T } from './ui';

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  pdf: 'document-text-outline', doc: 'document-text-outline', docx: 'document-text-outline', txt: 'document-text-outline', md: 'document-text-outline',
  xls: 'grid-outline', xlsx: 'grid-outline', csv: 'grid-outline', ppt: 'easel-outline', pptx: 'easel-outline',
  zip: 'archive-outline', tar: 'archive-outline', gz: 'archive-outline', mp4: 'film-outline', mov: 'film-outline', mkv: 'film-outline', webm: 'film-outline',
  mp3: 'musical-notes-outline', wav: 'musical-notes-outline', m4a: 'musical-notes-outline', ogg: 'musical-notes-outline',
};
const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Attachments waiting to be sent, as a single horizontal row of square tiles above the message box.
 * Images show just the picture (no file name); tap to open it full screen with its name, size and a
 * Remove button. Other files show a type icon, the extension and a short name. Upload progress is a
 * thin bar on the tile; a failed upload turns the tile red with a Retry tap.
 */
export function AttachmentTray({ items, onRemove, onRetry }: { items: ImportItem[]; onRemove?: (id: string) => void; onRetry?: (id: string) => void }) {
  const { colors } = useApp(); const [open, setOpen] = useState<ImportItem | null>(null);
  if (!items.length) return null;
  const TILE = 64;
  return <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8, paddingTop: 2, paddingRight: 4 }} keyboardShouldPersistTaps="handled">
      {items.map(i => {
        const failed = i.state === 'error'; const uploading = i.state === 'uploading';
        const label = `${i.image ? 'Image' : 'File'} ${i.name}${uploading ? `, uploading ${Math.round(i.progress * 100)}%` : failed ? `, upload failed: ${i.error ?? ''}` : ''}`;
        const press = () => { if (failed) onRetry?.(i.id); else if (i.image) setOpen(i); };
        return <View key={i.id} style={{ width: i.image ? TILE : 132, height: TILE }}>
          <Pressable accessibilityRole={i.image ? 'imagebutton' : 'button'} accessibilityLabel={label} accessibilityHint={failed ? 'Tap to retry the upload' : i.image ? 'Tap to view full screen' : undefined} onPress={press}
            style={({ pressed }) => ({ flex: 1, borderRadius: 10, overflow: 'hidden', borderWidth: failed ? 1.5 : StyleSheet.hairlineWidth, borderColor: failed ? colors.danger : colors.border, backgroundColor: colors.panel, opacity: pressed ? 0.75 : 1 })}>
            {i.image
              ? <Image source={{ uri: i.uri }} resizeMode="cover" style={{ width: '100%', height: '100%', opacity: uploading ? 0.6 : 1 }} />
              : <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 }}>
                  <Ionicons name={ICONS[ext(i.name)] ?? 'document-outline'} size={22} color={colors.muted} />
                  <View style={{ flex: 1 }}>
                    <T style="caption1" weight="600" numberOfLines={1}>{ext(i.name).toUpperCase() || 'FILE'}</T>
                    <T style="caption2" color="secondary" numberOfLines={2}>{i.name}</T>
                  </View>
                </View>}
            {failed ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00000066' }}><Ionicons name="refresh" size={20} color="#ffffff" /><T style="caption2" weight="600" color="#ffffff">Retry</T></View> : null}
            {uploading ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: '#00000040' }}><View style={{ width: `${Math.max(4, Math.round(i.progress * 100))}%`, height: 3, backgroundColor: colors.text }} /></View> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`} onPress={() => onRemove?.(i.id)} hitSlop={8}
            style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, borderWidth: 1.5, borderColor: colors.bg }}>
            <Ionicons name="close" size={12} color={colors.bg} />
          </Pressable>
        </View>;
      })}
    </ScrollView>
    <ImageViewer uri={open?.uri ?? ''} name={open?.name} detail={open?.size ? formatSize(open.size) : undefined} visible={!!open} onClose={() => setOpen(null)} onRemove={open ? () => onRemove?.(open.id) : undefined} />
  </>;
}
