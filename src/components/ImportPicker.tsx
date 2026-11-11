import { useState } from 'react';
import { FlatList, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Sheet } from './Sheet';
import { T } from './ui';
import { Loading } from './Loader';
import { IMPORT_CATEGORIES, type ImportCategory } from '../lib/imports';
import { durationLabel, resolveMedia, useRecentMedia, type RecentMedia } from '../lib/recentMedia';
import type * as DocumentPicker from 'expo-document-picker';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
/** Shortcut chips across the top: each opens the system picker for that kind of file. */
const SHORTCUTS: { id: ImportCategory['id']; label: string; icon: IconName }[] = [
  { id: 'images', label: 'Gallery', icon: 'images-outline' },
  { id: 'video', label: 'Videos', icon: 'videocam-outline' },
  { id: 'pdf', label: 'PDF', icon: 'document-text-outline' },
  { id: 'office', label: 'Docs', icon: 'documents-outline' },
  { id: 'audio', label: 'Audio', icon: 'musical-notes-outline' },
  { id: 'other', label: 'Files', icon: 'folder-open-outline' },
];
const MAX_PICK = 10;

/**
 * Attachment sheet: recent photos and videos straight from the phone in a grid (tap to select up to 10,
 * then Attach), with shortcuts at the top to the system file pickers for anything else — or for photos
 * not in the recent list. Videos, audio and documents attach as files; photos attach as images.
 */
export function ImportPicker({ visible, onClose, onSelect, onAttachMedia }: { visible: boolean; onClose: () => void; onSelect: (category: ImportCategory) => void; onAttachMedia?: (assets: DocumentPicker.DocumentPickerAsset[]) => void }) {
  const { colors } = useApp(); const { width } = useWindowDimensions();
  const media = useRecentMedia(visible && !!onAttachMedia);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const cols = 4; const gap = 3; const size = Math.floor((width - 24 - gap * (cols - 1)) / cols);
  const close = () => { setPicked([]); onClose(); };
  const openPicker = (id: ImportCategory['id']) => { const c = IMPORT_CATEGORIES.find(x => x.id === id); if (!c) return; close(); setTimeout(() => onSelect(c), 250); };
  const toggle = (m: RecentMedia) => setPicked(p => p.includes(m.id) ? p.filter(x => x !== m.id) : p.length >= MAX_PICK ? p : [...p, m.id]);
  const attach = async () => {
    if (!picked.length || !onAttachMedia) return;
    setBusy(true);
    try { const assets = await resolveMedia(picked); close(); if (assets.length) onAttachMedia(assets as DocumentPicker.DocumentPickerAsset[]); }
    finally { setBusy(false); }
  };

  const header = <View style={{ gap: 10, paddingBottom: 8 }}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
      {SHORTCUTS.map(sc => <Pressable key={sc.id} accessibilityRole="button" accessibilityLabel={`Choose ${sc.label.toLowerCase()} from the phone`} onPress={() => openPicker(sc.id)}
        style={({ pressed }) => ({ width: 72, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border })}>
        <Ionicons name={sc.icon} size={20} color={colors.text} /><T style="caption2" weight="600">{sc.label}</T>
      </Pressable>)}
    </ScrollView>
    {onAttachMedia ? <T style="caption2" color="secondary" weight="600" styleOverride={{ paddingHorizontal: 14, letterSpacing: 0.4 }}>RECENT PHOTOS AND VIDEOS</T> : null}
  </View>;

  const body = !onAttachMedia || Platform.OS === 'web' ? null
    : media.access === 'unknown' ? <Loading fill={false} size="md" />
    : media.access === 'denied' ? <View style={{ padding: 20, alignItems: 'center', gap: 10 }}>
        <Ionicons name="images-outline" size={34} color={colors.muted} />
        <T style="footnote" color="secondary" align="center">Allow access to show your recent photos and videos here. You can still use Gallery or Files above.</T>
        <Pressable accessibilityRole="button" onPress={() => void media.allow()} style={({ pressed }) => ({ height: 40, paddingHorizontal: 18, borderRadius: 11, justifyContent: 'center', backgroundColor: colors.text, opacity: pressed ? 0.75 : 1 })}><T style="footnote" weight="600" color={colors.bg}>Allow Access</T></Pressable>
        <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} hitSlop={8}><T style="caption1" color="tertiary">Open app settings</T></Pressable>
      </View>
    : null;

  return <Sheet visible={visible} onClose={close} title="Attach" height={0.82}>
    {body || !onAttachMedia ? <ScrollView>{header}{body}</ScrollView>
      : <FlatList data={media.items} keyExtractor={m => m.id} numColumns={cols} ListHeaderComponent={header}
          columnWrapperStyle={{ gap, paddingHorizontal: 12 }} contentContainerStyle={{ gap, paddingBottom: picked.length ? 80 : 20 }}
          onEndReached={media.more} onEndReachedThreshold={0.6} initialNumToRender={24} windowSize={7} removeClippedSubviews
          ListEmptyComponent={!media.loading ? <T style="footnote" color="secondary" align="center" styleOverride={{ padding: 20 }}>No photos or videos found.</T> : <Loading fill={false} size="md" />}
          ListFooterComponent={media.access === 'limited' ? <Pressable accessibilityRole="button" onPress={() => void media.chooseMore()} style={{ padding: 14, alignItems: 'center' }}><T style="caption1" color="secondary">You allowed some photos only. Choose more…</T></Pressable> : media.loading && media.items.length ? <Loading fill={false} size="sm" /> : null}
          renderItem={({ item }) => { const n = picked.indexOf(item.id); const on = n >= 0;
            return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${item.video ? 'Video' : 'Photo'}${item.filename ? ` ${item.filename}` : ''}${item.video && item.durationMs ? `, ${durationLabel(item.durationMs)}` : ''}`} onPress={() => toggle(item)}
              style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.fill }}>
              <Image source={{ uri: item.id }} resizeMode="cover" style={{ width: size, height: size, opacity: on ? 0.75 : 1 }} />
              {item.video ? <View style={{ position: 'absolute', left: 4, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4, borderRadius: 4, backgroundColor: '#00000088' }}>
                <Ionicons name="play" size={9} color="#fff" /><T style="caption2" color="#ffffff" styleOverride={{ fontSize: 10 }}>{durationLabel(item.durationMs)}</T></View> : null}
              <View style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: on ? colors.primary : '#00000040' }}>
                {on ? <T style="caption2" weight="700" color={colors.primaryForeground} styleOverride={{ fontSize: 11 }}>{String(n + 1)}</T> : null}
              </View>
            </Pressable>; }} />}
    {picked.length ? <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void attach()} style={({ pressed }) => ({ height: 48, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, opacity: busy ? 0.6 : pressed ? 0.8 : 1 })}>
        <Ionicons name="attach" size={18} color={colors.bg} /><T style="footnote" weight="700" color={colors.bg}>{busy ? 'Preparing…' : `Attach ${picked.length}${picked.length >= MAX_PICK ? ' (max)' : ''}`}</T>
      </Pressable>
    </View> : null}
  </Sheet>;
}
