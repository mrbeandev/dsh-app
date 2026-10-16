import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SkeletonRows } from '../components/Loader';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/app';
import { Empty, ErrorNotice, Header, IconButton, Screen, SearchField, T } from '../components/ui';
import { errorMessage } from '../lib/harness';
import { formatSize, listDirectory, sortEntries, statFile, type FileEntry, type SortDir, type SortKey } from '../lib/workspaceFiles';
import { useActionMenu } from '../components/ActionMenu';
import { relativeTime } from '../lib/time';
import { cacheEpoch, readDirectoryCache, writeDirectoryCache } from '../lib/cache';
import { mergeDirectory, refreshFileMetadata, type CachedDirectory, type CachedFileEntry } from '../lib/directoryCache';

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
  const [path, setPath] = useState(''); const [entries, setEntries] = useState<CachedFileEntry[] | null>(null); const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState(''); const [query, setQuery] = useState(''); const [showHidden, setShowHidden] = useState(false);
  const menu = useActionMenu();
  const [sortKey, setSortKey] = useState<SortKey>('updated'); const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scanning, setScanning] = useState(false);
  const join = (name: string) => (path ? `${path}/${name}` : name);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!client) return;
    let active = true; let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const url = client.connection.url, scope = sessionId, epoch = cacheEpoch(url);
    let current: CachedDirectory | null = null;
    const valid = () => active && epoch === cacheEpoch(url);
    const show = (value: CachedDirectory) => { if (valid()) { setEntries(value.entries); setTruncated(value.truncated); } };
    const persist = () => {
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => { if (valid() && current) void writeDirectoryCache(url, scope, path, current, epoch).catch(() => {}); }, 200);
    };
    void (async () => {
      // Cache first: no network/stat calls block showing the previous sizes and timestamps.
      current = await readDirectoryCache(url, scope, path).catch(() => null);
      if (!valid()) return;
      if (current) show(current);
      setScanning(true);
      try {
        current = mergeDirectory(await listDirectory(client, sessionId, path), current);
        if (!valid()) return;
        show(current); setError(''); persist();
        await refreshFileMetadata(current.entries,
          entry => statFile(client, sessionId, path ? `${path}/${entry.name}` : entry.name),
          entry => {
            if (!current || !valid()) return;
            current = { ...current, savedAt: Date.now(), entries: current.entries.map(e => e.name === entry.name ? entry : e) };
            show(current); persist();
          }, valid);
      } catch (e) { if (valid()) { setError(errorMessage(e)); if (!current) setEntries([]); } }
      finally { if (valid()) { setScanning(false); if (writeTimer) clearTimeout(writeTimer); if (current) void writeDirectoryCache(url, scope, path, current, epoch).catch(() => {}); } }
    })();
    return () => {
      active = false; if (writeTimer) clearTimeout(writeTimer);
      // Persist results already obtained even if the user leaves before the debounce fires.
      if (current && epoch === cacheEpoch(url)) void writeDirectoryCache(url, scope, path, current, epoch).catch(() => {});
    };
  }, [client, sessionId, path, reload]);
  const go = (p: string) => { setEntries(null); setError(''); setPath(p); };

  const crumbs = path ? path.split('/').filter(Boolean) : [];
  const shown = sortEntries((entries ?? []).filter(e => (showHidden || !e.name.startsWith('.')) && e.name.toLowerCase().includes(query.toLowerCase())), sortKey, sortDir);
  // Folders stay on top in name order: the Harness can stat files only, so folders have no time or size.
  const sortLabel = `${sortKey === 'updated' ? 'Last updated' : sortKey === 'name' ? 'Name' : 'Size'} · ${sortKey === 'name' ? (sortDir === 'asc' ? 'A–Z' : 'Z–A') : sortKey === 'updated' ? (sortDir === 'desc' ? 'newest first' : 'oldest first') : (sortDir === 'desc' ? 'largest first' : 'smallest first')}`;
  const openSort = () => menu({ title: 'Sort', subtitle: `${sortLabel}${sortKey === 'name' ? '' : ' · folders stay on top'}`, actions: [
    ...(['updated', 'name', 'size'] as SortKey[]).map(k => ({ label: k === 'updated' ? 'Last Updated' : k === 'name' ? 'Name' : 'Size', icon: (sortKey === k ? 'radio-button-on' : 'radio-button-off') as IconName, onPress: () => { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); } })),
    { label: sortDir === 'asc' ? 'Switch to Descending' : 'Switch to Ascending', icon: (sortDir === 'asc' ? 'arrow-down' : 'arrow-up') as IconName, onPress: () => setSortDir(d => (d === 'asc' ? 'desc' : 'asc')) },
  ] });

  return <Screen>
    <Header title="Files" subtitle={root ? root.split('/').filter(Boolean).pop() : undefined} back>
      <IconButton icon="swap-vertical" size={18} label={`Sort: ${sortLabel}`} onPress={openSort} />
      <IconButton icon={showHidden ? 'eye-outline' : 'eye-off-outline'} size={18} label={showHidden ? 'Hide hidden files' : 'Show hidden files'} onPress={() => setShowHidden(v => !v)} />
      <IconButton icon="refresh" size={18} label="Refresh" onPress={() => { setReload(r => r + 1); }} />
    </Header>
    <View style={{ paddingHorizontal: 12, gap: 8, paddingBottom: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 2 }}>
        <Pressable accessibilityRole="button" onPress={() => go('')} style={{ paddingVertical: 6, paddingHorizontal: 4 }}><T style="footnote" weight="600" color={crumbs.length ? 'secondary' : 'primary'}>Workspace</T></Pressable>
        {crumbs.map((c, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="chevron-forward" size={11} color={colors.tertiary} /><Pressable accessibilityRole="button" onPress={() => go(crumbs.slice(0, i + 1).join('/'))} style={{ paddingVertical: 6, paddingHorizontal: 4 }}><T style="footnote" weight={i === crumbs.length - 1 ? '600' : '400'} color={i === crumbs.length - 1 ? 'primary' : 'secondary'}>{c}</T></Pressable></View>)}
      </ScrollView>
      {scanning ? <T style="caption2" color="secondary">Updating file sizes and dates…</T> : null}
      <SearchField value={query} onChangeText={setQuery} placeholder="Filter this folder" />
      <Pressable accessibilityRole="button" onPress={openSort} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}><Ionicons name="swap-vertical" size={12} color={colors.muted} /><T style="caption1" color="secondary">{sortLabel}</T></Pressable>
    </View>
    <ErrorNotice message={error} />
    {entries === null ? <SkeletonRows rows={9} indent={false} /> : <FlatList
      data={shown} keyExtractor={e => e.name}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32 }}
      ListHeaderComponent={path ? <Pressable accessibilityRole="button" accessibilityLabel="Up one folder" onPress={() => go(crumbs.slice(0, -1).join('/'))} style={({ pressed }) => [s.row, { opacity: pressed ? 0.5 : 1 }]}><Ionicons name="arrow-up" size={17} color={colors.muted} /><T style="footnote" color="secondary">..</T></Pressable> : null}
      ListEmptyComponent={!error ? <Empty icon="folder-open-outline" title={query ? 'No Matches' : 'Empty Folder'} detail={query ? 'Nothing here matches your filter.' : showHidden ? 'This folder has no files.' : 'No visible files. Tap the eye to show hidden files.'} /> : null}
      ListFooterComponent={truncated ? <T style="caption1" color="secondary" align="center">Folder has more entries than the Harness lists at once.</T> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.type === 'directory' ? 'Folder' : 'File'} ${item.name}`} onPress={() => item.type === 'directory' ? go(join(item.name)) : router.push({ pathname: '/file', params: { sessionId, path: join(item.name), size: String(item.size ?? '') } })} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
        <Ionicons name={iconFor(item)} size={18} color={item.type === 'directory' ? colors.primary : colors.muted} />
        <T style="footnote" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 14 }}>{item.name}</T>
        <View style={{ alignItems: 'flex-end' }}>{item.type === 'file' ? <T style="caption2" color="secondary">{formatSize(item.size)}</T> : null}{item.mtime ? <T style="caption2" color="tertiary">{relativeTime(item.mtime)}</T> : null}</View>
        {item.type === 'directory' ? <Ionicons name="chevron-forward" size={13} color={colors.tertiary} /> : null}
      </Pressable>}
    />}
  </Screen>;
}

const s = StyleSheet.create({ row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 10 } });
