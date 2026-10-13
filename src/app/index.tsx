import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { Button, Empty, ErrorNotice, Header, IconButton, ScrollEdge, SearchField, Screen, T, slop } from '../components/ui';
import { Glass, GlassTarget, GlassTargetProvider } from '../components/Glass';
import { sessionTitle } from '../lib/protocol';
import { errorMessage } from '../lib/harness';
import { groupWorkspaces } from '../lib/workspaces';
import { relativeTime } from '../lib/time';

type Filter = 'All' | 'Working';

/** Workspace tree home — layout and palette follow the approved glass prototype (screen 01). */
export default function Home() {
  const { colors, sessions, workspaces, client, status, savedUrl, loading, refresh, refreshWorkspace, pending } = useApp();
  const insets = useSafeAreaInsets();
  const target = useRef<View>(null);
  const [query, setQuery] = useState(''); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('All'); const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const live = status === 'connected';
  const rows = useMemo(() => sessions.filter(x => (sessionTitle(x) + ' ' + (x.cwd ?? '')).toLowerCase().includes(query.toLowerCase()) && (filter !== 'Working' || (live && x.running))), [sessions, query, filter, live]);
  const sections = useMemo(() => groupWorkspaces(rows, workspaces).filter(g => g.sessions.length || (!query && filter === 'All')).map(g => ({ ...g, data: collapsed.has(g.id) && !query ? [] : g.sessions })), [rows, workspaces, query, filter, collapsed]);
  const workingCount = sessions.filter(x => live && x.running).length;
  const toggle = (id: string) => setCollapsed(p => { const next = new Set(p); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const reload = async () => { setRefreshing(true); try { await refresh(); setError(''); } catch (e) { setError(errorMessage(e)); } finally { setRefreshing(false); } };
  const host = client ? new URL(client.connection.url).host : savedUrl ? new URL(savedUrl).host : '';
  const statusText = !host ? 'Not connected' : live ? host : status === 'connecting' ? `${host} · Connecting…` : `${host} · Offline`;

  const workspaceMenu = (title: string, ids: string[]) => {
    const run = () => { void refreshWorkspace(ids).catch(e => setError(errorMessage(e))); };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title, message: 'Chats download again only when opened.', options: ['Refresh Workspace Cache', 'Cancel'], cancelButtonIndex: 1 }, i => { if (i === 0) run(); });
    else Alert.alert(title, 'Refresh this workspace and clear its saved chats on this device. Chats download again only when opened.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Refresh', onPress: run }]);
  };

  return <Screen edges={['top']}>
    <GlassTarget target={target}>
      {loading ? <ActivityIndicator style={{ marginTop: 160 }} color={colors.muted} /> : <SectionList
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={x => x.sessionId}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} progressViewOffset={60} />}
        contentContainerStyle={{ paddingTop: 60, paddingBottom: insets.bottom + 90, flexGrow: 1 }}
        ListHeaderComponent={<View style={{ paddingHorizontal: 12, gap: 10, paddingBottom: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Harness: ${statusText}. Change connection`} onPress={() => router.push('/connect')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? colors.live : colors.tertiary }} />
            <T style="footnote" color="secondary" numberOfLines={1}>{statusText}</T>
            <Ionicons name="chevron-down" size={11} color={colors.muted} />
          </Pressable>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search workspaces and threads" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {(['All', 'Working'] as const).map(x => { const on = filter === x; return <Pressable key={x} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(x)} hitSlop={slop(30)} style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: on ? colors.fill : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on ? colors.glassEdge : 'transparent', opacity: pressed ? 0.6 : 1 })}><T style="footnote" weight="500">{x}</T>{x === 'Working' && workingCount ? <T style="caption1" color="secondary">{workingCount}</T> : null}</Pressable>; })}
            <View style={{ flex: 1 }} />
            <T style="caption1" color="secondary">Last updated</T>
          </View>
        </View>}
        renderSectionHeader={({ section }) => { const open = !(collapsed.has(section.id) && !query); const runningHere = section.sessions.some(x => live && x.running); return <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, marginTop: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${section.title}, ${section.sessions.length} threads`} accessibilityState={{ expanded: open }} onPress={() => toggle(section.id)} style={({ pressed }) => ({ flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} style={{ width: 12 }} />
            <Ionicons name={open ? 'folder-open-outline' : 'folder-outline'} size={14} color={colors.muted} />
            <T style="subhead" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{section.title}</T>
            <T style="caption1" color="secondary">{section.sessions.length}</T>
            {!open && runningHere ? <View accessibilityLabel="Has a live thread" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live }} /> : null}
          </Pressable>
          <IconButton icon="ellipsis-horizontal" size={17} tint={colors.muted} label={`Options for ${section.title}`} onPress={() => workspaceMenu(section.title, section.sessions.map(x => x.sessionId))} />
        </View>; }}
        renderItem={({ item }) => {
          const active = item.running && live; const attention = pending.some(p => p.agentId === item.sessionId);
          return <View style={{ marginLeft: 19, paddingLeft: 10, paddingRight: 12, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${sessionTitle(item)}${active ? ', working' : ''}${attention ? ', needs input' : ''}`} onPress={() => router.push({ pathname: '/thread/[id]', params: { id: item.sessionId, harness: client?.connection.url ?? savedUrl } })} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: pressed ? colors.fill : 'transparent' })}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: attention ? '#ffb74d' : active ? colors.live : 'transparent' }} />
              <T style="footnote" numberOfLines={1} styleOverride={{ flex: 1 }}>{sessionTitle(item)}</T>
              <T style="caption2" color="secondary">{relativeTime(item.updatedAt)}</T>
            </Pressable>
          </View>;
        }}
        ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', paddingTop: 40, gap: 20 }}>
          <Empty icon={client ? 'search' : 'server-outline'} title={client ? 'No Threads' : 'Connect a Harness'} detail={client ? (query ? 'No threads match your search.' : 'Start a new task to see it here.') : 'Add your Harness URL and token to see your workspaces and threads.'} />
          {!client && !sessions.length ? <View style={{ paddingHorizontal: 48 }}><Button title="Connect" onPress={() => router.push('/connect')} /></View> : null}
        </View>}
      />}
      <ErrorNotice message={error} />
    </GlassTarget>

    {/* Floating control layer */}
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0 }}>
      <ScrollEdge height={64} />
      <GlassTargetProvider value={target}>
        <Header title="DSH" large leading={<View style={{ width: 8 }} />}>
          <IconButton icon="settings-outline" size={19} label="Settings" onPress={() => router.push('/settings')} />
        </Header>
      </GlassTargetProvider>
    </View>
    {client ? <View pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: insets.bottom + 14 }}>
      <GlassTargetProvider value={target}>
        <Pressable accessibilityRole="button" accessibilityLabel="New task" onPress={() => router.push('/new')} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Glass radius={22} interactive prominent style={{ height: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="add" size={20} color={colors.text} /><T style="footnote" weight="600">New task</T></Glass>
        </Pressable>
      </GlassTargetProvider>
    </View> : null}
  </Screen>;
}
