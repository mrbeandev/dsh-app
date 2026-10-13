import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { Button, Empty, ErrorNotice, GlassCluster, IconButton, ScrollEdge, SearchField, Screen, T, slop } from '../components/ui';
import { Glass, GlassTarget } from '../components/Glass';
import { sessionTitle } from '../lib/protocol';
import { errorMessage } from '../lib/harness';
import { groupWorkspaces } from '../lib/workspaces';
import { relativeTime } from '../lib/time';

type Filter = 'All' | 'Working';

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
  const statusText = !host ? 'Not connected' : live ? host : status === 'cached' || status === 'disconnected' || status === 'offline' ? `${host} · Offline` : `${host} · Connecting…`;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} progressViewOffset={56} />}
        contentContainerStyle={{ paddingTop: 56, paddingBottom: insets.bottom + 96, flexGrow: 1 }}
        ListHeaderComponent={<View style={{ paddingHorizontal: 16, gap: 10, paddingBottom: 6 }}>
          <View style={{ paddingTop: 2 }}><T style="largeTitle">Threads</T></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Harness: ${statusText}. Change connection`} onPress={() => router.push('/connect')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: -6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live ? colors.live : colors.tertiary }} />
            <T style="subhead" color="secondary" numberOfLines={1}>{statusText}</T>
            <Ionicons name="chevron-down" size={12} color={colors.muted} />
          </Pressable>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {(['All', 'Working'] as const).map(x => { const on = filter === x; return <Pressable key={x} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(x)} hitSlop={slop(30)} style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: on ? colors.text : colors.fill, opacity: pressed ? 0.7 : 1 })}><T style="subhead" weight="500" color={on ? colors.bg : 'primary'}>{x}</T>{x === 'Working' && workingCount ? <T style="footnote" weight="600" color={on ? colors.bg : 'secondary'}>{workingCount}</T> : null}</Pressable>; })}
            <View style={{ flex: 1 }} />
            <T style="footnote" color="secondary">Last updated</T>
          </View>
        </View>}
        renderSectionHeader={({ section }) => { const open = !(collapsed.has(section.id) && !query); const runningHere = section.sessions.some(x => live && x.running); return <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, marginTop: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${section.title}, ${section.sessions.length} threads`} accessibilityState={{ expanded: open }} onPress={() => toggle(section.id)} style={({ pressed }) => ({ flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.tertiary} style={{ width: 13 }} />
            <T style="headline" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{section.title}</T>
            <T style="subhead" color="tertiary">{section.sessions.length}</T>
            {!open && runningHere ? <View accessibilityLabel="Has a live thread" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.live }} /> : null}
          </Pressable>
          <IconButton icon="ellipsis-horizontal" size={18} tint={colors.muted} label={`Options for ${section.title}`} onPress={() => workspaceMenu(section.title, section.sessions.map(x => x.sessionId))} />
        </View>; }}
        renderItem={({ item, index, section }) => {
          const active = item.running && live; const attention = pending.some(p => p.agentId === item.sessionId);
          const last = index === section.data.length - 1;
          return <Pressable accessibilityRole="button" accessibilityLabel={`${sessionTitle(item)}${active ? ', working' : ''}${attention ? ', needs input' : ''}`} onPress={() => router.push({ pathname: '/thread/[id]', params: { id: item.sessionId, harness: client?.connection.url ?? savedUrl } })} style={({ pressed }) => ({ marginLeft: 22, paddingLeft: 14, paddingRight: 16, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? colors.fill : 'transparent' })}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: last ? '50%' : 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.separator }} />
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: attention ? '#ff9f0a' : active ? colors.live : 'transparent' }} />
            <T style="subhead" numberOfLines={1} styleOverride={{ flex: 1 }}>{sessionTitle(item)}</T>
            <T style="footnote" color="secondary">{relativeTime(item.updatedAt)}</T>
          </Pressable>;
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
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 }}>
        <View style={{ flex: 1 }} />
        <GlassCluster><IconButton icon="settings-outline" size={21} label="Settings" onPress={() => router.push('/settings')} /></GlassCluster>
      </View>
    </View>
    {client ? <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: insets.bottom + 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="New thread" onPress={() => router.push('/new')} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <Glass radius={28} interactive prominent style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="create-outline" size={24} color={colors.text} /></Glass>
      </Pressable>
    </View> : null}
  </Screen>;
}
