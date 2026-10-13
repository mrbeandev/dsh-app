import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/app';
import { Empty, ErrorNotice, Header, IconButton, Screen, SearchField, T } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { errorMessage } from '../lib/harness';
import { downloadBytes, formatSize, isTextLike, listDirectory, readText, type FileEntry } from '../lib/workspaceFiles';
import { openFile, saveDownload, shareFile, type SavedFile } from '../lib/downloads';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
function iconFor(e: FileEntry): IconName {
  if (e.type === 'directory') return 'folder';
  const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image-outline';
  if (['md', 'txt', 'log'].includes(ext)) return 'document-text-outline';
  if (['pdf'].includes(ext)) return 'document-outline';
  if (['zip', 'tgz', 'gz', 'apk'].includes(ext)) return 'archive-outline';
  if (['mp4', 'mov', 'mp3', 'wav'].includes(ext)) return 'film-outline';
  return 'code-slash-outline';
}

/** Workspace file browser over the official read-only workspaceFiles API, with download to device. */
export default function Files() {
  const { sessionId, root } = useLocalSearchParams<{ sessionId: string; root?: string }>();
  const { client, colors } = useApp();
  const [path, setPath] = useState(''); const [entries, setEntries] = useState<FileEntry[] | null>(null); const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [showHidden, setShowHidden] = useState(false);
  const [open, setOpen] = useState<FileEntry | null>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!client) return; let active = true;
    listDirectory(client, sessionId, path).then(l => { if (!active) return; setError(''); setEntries([...l.entries].sort((x, y) => (x.type === 'directory' ? 0 : 1) - (y.type === 'directory' ? 0 : 1) || x.name.localeCompare(y.name))); setTruncated(l.truncated); })
      .catch(e => { if (active) { setError(errorMessage(e)); setEntries([]); } });
    return () => { active = false; };
  }, [client, sessionId, path, reload]);
  const go = (p: string) => { setEntries(null); setError(''); setPath(p); };

  const crumbs = path ? path.split('/').filter(Boolean) : [];
  const shown = (entries ?? []).filter(e => (showHidden || !e.name.startsWith('.')) && e.name.toLowerCase().includes(query.toLowerCase()));
  const join = (name: string) => (path ? `${path}/${name}` : name);

  return <Screen>
    <Header title="Files" subtitle={root ? root.split('/').filter(Boolean).pop() : undefined} back>
      <IconButton icon={showHidden ? 'eye-outline' : 'eye-off-outline'} size={18} label={showHidden ? 'Hide hidden files' : 'Show hidden files'} onPress={() => setShowHidden(v => !v)} />
      <IconButton icon="refresh" size={18} label="Refresh" onPress={() => { setEntries(null); setReload(r => r + 1); }} />
    </Header>
    <View style={{ paddingHorizontal: 12, gap: 8, paddingBottom: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2 }}>
        <Pressable accessibilityRole="button" onPress={() => go('')} style={{ paddingVertical: 6, paddingHorizontal: 4 }}><T style="footnote" weight="600" color={crumbs.length ? 'secondary' : 'primary'}>Workspace</T></Pressable>
        {crumbs.map((c, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="chevron-forward" size={11} color={colors.tertiary} /><Pressable accessibilityRole="button" onPress={() => go(crumbs.slice(0, i + 1).join('/'))} style={{ paddingVertical: 6, paddingHorizontal: 4 }}><T style="footnote" weight={i === crumbs.length - 1 ? '600' : '400'} color={i === crumbs.length - 1 ? 'primary' : 'secondary'}>{c}</T></Pressable></View>)}
      </ScrollView>
      <SearchField value={query} onChangeText={setQuery} placeholder="Filter this folder" />
    </View>
    <ErrorNotice message={error} />
    {entries === null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.muted} /> : <FlatList
      data={shown} keyExtractor={e => e.name}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
      ListHeaderComponent={path ? <Pressable accessibilityRole="button" accessibilityLabel="Up one folder" onPress={() => go(crumbs.slice(0, -1).join('/'))} style={({ pressed }) => [s.row, { opacity: pressed ? 0.5 : 1 }]}><Ionicons name="arrow-up" size={17} color={colors.muted} /><T style="footnote" color="secondary">..</T></Pressable> : null}
      ListEmptyComponent={!error ? <Empty icon="folder-open-outline" title={query ? 'No Matches' : 'Empty Folder'} detail={query ? 'Nothing here matches your filter.' : showHidden ? 'This folder has no files.' : 'No visible files. Tap the eye to show hidden files.'} /> : null}
      ListFooterComponent={truncated ? <T style="caption1" color="secondary" align="center">Folder has more entries than the Harness lists at once.</T> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.type === 'directory' ? 'Folder' : 'File'} ${item.name}`} onPress={() => item.type === 'directory' ? go(join(item.name)) : setOpen(item)} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
        <Ionicons name={iconFor(item)} size={18} color={item.type === 'directory' ? colors.primary : colors.muted} />
        <T style="footnote" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 14 }}>{item.name}</T>
        {item.type === 'file' ? <T style="caption2" color="secondary">{formatSize(item.size)}</T> : <Ionicons name="chevron-forward" size={13} color={colors.tertiary} />}
      </Pressable>}
    />}
    {open ? <FileSheet sessionId={sessionId} path={join(open.name)} entry={open} onClose={() => setOpen(null)} /> : null}
  </Screen>;
}

function FileSheet({ sessionId, path, entry, onClose }: { sessionId: string; path: string; entry: FileEntry; onClose: () => void }) {
  const { client, colors } = useApp();
  const [preview, setPreview] = useState<string | null>(null); const [previewNote, setPreviewNote] = useState('');
  const [progress, setProgress] = useState<number | null>(null); const [saved, setSaved] = useState<SavedFile | null>(null); const [error, setError] = useState('');
  const textual = isTextLike(entry.name) && (entry.size ?? 0) <= 2 * 1024 * 1024;

  useEffect(() => {
    if (!client || !textual) return; let active = true;
    void readText(client, sessionId, path, 1, 400).then(p => { if (active) { setPreview(p.text); if (!p.eof) setPreviewNote('Showing the first 400 lines. Download for the full file.'); } })
      .catch(e => { if (active) setPreviewNote(/not-text/.test(String((e as any)?.code ?? errorMessage(e))) ? 'Binary file — no text preview.' : errorMessage(e)); });
    return () => { active = false; };
  }, [client, sessionId, path, textual]);

  const download = async () => {
    if (!client) return; setError(''); setProgress(0);
    try {
      const { bytes } = await downloadBytes(client, sessionId, path, (done, total) => setProgress(total ? done / total : 1));
      const result = await saveDownload(entry.name, bytes); setSaved(result);
    } catch (e) { setError(errorMessage(e)); } finally { setProgress(null); }
  };

  return <Sheet visible onClose={onClose} title={entry.name} height={0.78}>
    <View style={{ paddingHorizontal: 14, gap: 10, flex: 1 }}>
      <T style="caption1" color="secondary" numberOfLines={1}>{path} · {formatSize(entry.size)}</T>
      {saved ? <View style={{ borderRadius: 14, padding: 12, gap: 10, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="checkmark-circle" size={18} color={colors.primary} /><View style={{ flex: 1 }}><T style="footnote" weight="600">Downloaded</T><T style="caption1" color="secondary" numberOfLines={2}>{saved.publicUri ? `Saved to ${saved.folderName ?? 'your chosen folder'} as ${saved.name}` : `Saved in the app as ${saved.name}`}</T></View></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pill icon="open-outline" label="Open" onPress={() => void openFile(saved).catch(e => Alert.alert('No app to open this file', errorMessage(e)))} />
          <Pill icon="share-outline" label="Share" onPress={() => void shareFile(saved).catch(e => Alert.alert('Couldn’t share', errorMessage(e)))} />
        </View>
      </View> : <Pressable accessibilityRole="button" accessibilityLabel={`Download ${entry.name} to this device`} disabled={progress !== null} onPress={() => void download()} style={({ pressed }) => ({ height: 44, borderRadius: 22, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, opacity: pressed || progress !== null ? 0.7 : 1 })}>
        {progress !== null ? <><ActivityIndicator color={colors.bg} /><T style="footnote" weight="600" color={colors.bg}>{Math.round(progress * 100)}%</T></> : <><Ionicons name="download-outline" size={18} color={colors.bg} /><T style="footnote" weight="600" color={colors.bg}>Download to Device</T></>}
      </Pressable>}
      <ErrorNotice message={error} />
      {textual ? <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.dark ? '#18181b' : '#f6f8fa', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
        {preview === null && !previewNote ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.muted} /> : <ScrollView contentContainerStyle={{ padding: 10 }}><ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={{ color: colors.text, fontFamily: MONO, fontSize: 11, lineHeight: 16 }}>{preview ?? ''}</Text></ScrollView></ScrollView>}
      </View> : <View style={{ alignItems: 'center', paddingTop: 20, gap: 6 }}><Ionicons name={iconFor(entry)} size={40} color={colors.tertiary} /><T style="footnote" color="secondary" align="center">No preview for this file type. Download it to open in another app.</T></View>}
      {previewNote ? <T style="caption1" color="secondary">{previewNote}</T> : null}
    </View>
  </Sheet>;
}

function Pill({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bubble, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.6 : 1 })}><Ionicons name={icon} size={16} color={colors.text} /><T style="footnote" weight="600">{label}</T></Pressable>;
}

const s = StyleSheet.create({ row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 10 } });
