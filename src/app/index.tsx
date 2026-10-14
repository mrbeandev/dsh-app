import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SkeletonRows } from '../components/Loader';
import { UpdateBanner } from '../components/UpdateCard';
import { SubagentBranches, SubagentToggle } from '../components/SubagentTree';
import { childIndex, subagentTree } from '../lib/subagents';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/app';
import { Button, Empty, ErrorNotice, Header, IconButton, ScrollEdge, SearchField, Screen, T, slop } from '../components/ui';
import { Glass, GlassTarget, GlassTargetProvider } from '../components/Glass';
import { sessionTitle, isListedSession } from '../lib/protocol';
import { errorMessage } from '../lib/harness';
import { groupWorkspaces } from '../lib/workspaces';
import { relativeTime } from '../lib/time';
import { useActionMenu } from '../components/ActionMenu';
import { useDialog } from '../components/Dialog';

type Filter = 'All' | 'Working';

/** Workspace tree home — layout and palette follow the approved glass prototype (screen 01). */
export default function Home() {
  const { colors, sessions, workspaces, archived, pinned, client, status, savedUrl, loading, refresh, refreshWorkspace, pending } = useApp();
  const insets = useSafeAreaInsets();
  const target = useRef<View>(null);
  const [query, setQuery] = useState(''); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('All'); // Workspace expansion: explicit user choice wins; otherwise all start collapsed when there are more than 5.
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  // Per-workspace page size for long thread lists (shown 10 at a time when a workspace has more than 8).
  const [shown, setShown] = useState<Record<string, number>>({});
  // Subagent trees under each thread: collapsed by default.
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const subIndex = useMemo(() => childIndex(sessions), [sessions]);
  const byId = useMemo(() => new Map(sessions.map(x => [x.sessionId, x])), [sessions]);
  const live = status === 'connected';
  const rows = useMemo(() => sessions.filter(x => isListedSession(x) && !archived.includes(x.sessionId)).filter(x => (sessionTitle(x) + ' ' + (x.cwd ?? '')).toLowerCase().includes(query.toLowerCase()) && (filter !== 'Working' || (live && x.running))), [sessions, archived, query, filter, live]);
  const groups = useMemo(() => groupWorkspaces(rows, workspaces).filter(g => g.sessions.length || (!query && filter === 'All')).map(g => ({ ...g, sessions: [...g.sessions].sort((a, b) => Number(pinned.includes(b.sessionId)) - Number(pinned.includes(a.sessionId))) })), [rows, workspaces, query, filter, pinned]);
  const collapseByDefault = groups.length > 5;
  const isOpen = useCallback((id: string) => !!query || (openState[id] ?? !collapseByDefault), [query, openState, collapseByDefault]);
  const sections = useMemo(() => groups.map(g => {
    if (!isOpen(g.id)) return { ...g, data: [] as typeof g.sessions, more: 0 };
    if (query || g.sessions.length <= 8) return { ...g, data: g.sessions, more: 0 };
    const limit = shown[g.id] ?? 10;
    return { ...g, data: g.sessions.slice(0, limit), more: Math.max(0, g.sessions.length - limit) };
  }), [groups, isOpen, query, shown]);
  const workingCount = sessions.filter(x => isListedSession(x) && live && x.running).length;
  const toggle = (id: string) => setOpenState(p => ({ ...p, [id]: !isOpen(id) }));
  const showMore = (id: string) => setShown(p => ({ ...p, [id]: (p[id] ?? 10) + 10 }));
  const reload = async () => { setRefreshing(true); try { await refresh(); setError(''); } catch (e) { setError(errorMessage(e)); } finally { setRefreshing(false); } };
  const host = client ? new URL(client.connection.url).host : savedUrl ? new URL(savedUrl).host : '';
  const statusText = !host ? 'Not connected' : live ? host : status === 'connecting' ? `${host} · Connecting…` : `${host} · Offline`;

  const menu = useActionMenu(); const dialog = useDialog();
  const act = (fn: () => Promise<unknown>) => { void fn().then(() => refresh()).catch(e => setError(errorMessage(e))); };
  const confirm = (title: string, message: string, label: string, run: () => void) => { void dialog.confirm({ title, message, confirm: label, destructive: true }).then(ok => { if (ok) run(); }); };
  /** Workspace actions via the official workspace API (same calls the Web UI sidebar makes). */
  const workspaceMenu = (section: { id: string; title: string; path: string; sessions: { sessionId: string }[] }) => {
    const real = !section.id.startsWith('path:'); const first = section.sessions[0]?.sessionId;
    menu({ title: section.title, subtitle: section.path, actions: [
      ...(first ? [{ label: 'Browse Files', icon: 'folder-open-outline' as const, onPress: () => router.push({ pathname: '/files', params: { sessionId: first, root: section.path } }) }, { label: 'Open Terminal', icon: 'terminal-outline' as const, onPress: () => router.push({ pathname: '/terminal', params: { sessionId: first } }) }] : []),
      { label: 'New Thread Here', icon: 'add-circle-outline', onPress: () => router.push({ pathname: '/new', params: { cwd: section.path } }) },
      ...(real ? [{ label: 'Rename', icon: 'pencil-outline' as const, onPress: () => { void dialog.prompt({ title: 'Rename Workspace', initial: section.title, placeholder: 'Workspace name', confirm: 'Rename' }).then(t => { if (t) act(() => client!.call('workspace/rename', { request: { workspaceId: section.id, title: t } })); }); } }] : []),
      { label: 'Refresh Cache', icon: 'refresh-outline', detail: 'Chats download again only when opened', onPress: () => { void refreshWorkspace(section.sessions.map(x => x.sessionId)).catch(e => setError(errorMessage(e))); } },
      ...(real ? [{ label: 'Remove Workspace', icon: 'trash-outline' as const, destructive: true, detail: 'Removes it from the list; files stay on disk', onPress: () => confirm(`Remove ${section.title}?`, 'The folder and its files stay on the Harness. Only the workspace entry is removed.', 'Remove', () => act(() => client!.call('workspace/delete', { request: { workspaceId: section.id } }))) }] : []),
    ] });
  };
  const threadMenu = (sessionId: string, title: string) => {
    const isPinned = pinned.includes(sessionId);
    menu({ title, actions: [
      { label: isPinned ? 'Unpin' : 'Pin to Top', icon: isPinned ? 'pin' : 'pin-outline', onPress: () => act(() => client!.call(isPinned ? 'workspace/unpinSession' : 'workspace/pinSession', { request: { sessionId } })) },
      { label: 'Browse Files', icon: 'folder-open-outline', onPress: () => router.push({ pathname: '/files', params: { sessionId } }) },
      { label: 'Open Terminal', icon: 'terminal-outline', onPress: () => router.push({ pathname: '/terminal', params: { sessionId } }) },
      { label: 'Archive', icon: 'archive-outline', destructive: true, detail: 'Hides it from the list; nothing is deleted', onPress: () => act(() => client!.call('workspace/archiveSession', { request: { sessionId, stopActivity: true } })) },
    ] });
  };

  return <Screen edges={['top']}>
    <GlassTarget target={target}>
      {loading ? <View style={{ paddingTop: 70 }}><SkeletonRows rows={10} /></View> : <SectionList
        sections={sections}
        stickySectionHeadersEnabled={false}
        keyExtractor={x => x.sessionId}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.muted} progressViewOffset={60} />}
        contentContainerStyle={{ paddingTop: 60, paddingBottom: insets.bottom + 90, flexGrow: 1 }}
        ListHeaderComponent={<><UpdateBanner /><View style={{ paddingHorizontal: 12, gap: 10, paddingBottom: 4 }}>
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
        </View></>}
        renderSectionHeader={({ section }) => { const open = isOpen(section.id); const runningHere = section.sessions.some(x => live && x.running); return <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, marginTop: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${section.title}, ${section.sessions.length} threads`} accessibilityState={{ expanded: open }} onPress={() => toggle(section.id)} style={({ pressed }) => ({ flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} style={{ width: 12 }} />
            <Ionicons name={open ? 'folder-open-outline' : 'folder-outline'} size={14} color={colors.muted} />
            <T style="subhead" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{section.title}</T>
            <T style="caption1" color="secondary">{section.sessions.length}</T>
            {!open && runningHere ? <View accessibilityLabel="Has a live thread" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live }} /> : null}
          </Pressable>
          <IconButton icon="ellipsis-horizontal" size={17} tint={colors.muted} label={`Options for ${section.title}`} onPress={() => workspaceMenu(section)} />
        </View>; }}
        renderSectionFooter={({ section }) => section.more ? <Pressable accessibilityRole="button" accessibilityLabel={`Show ${Math.min(10, section.more)} more threads in ${section.title}`} onPress={() => showMore(section.id)} style={({ pressed }) => ({ marginLeft: 19, paddingLeft: 26, paddingVertical: 8, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.5 : 1 })}><Ionicons name="chevron-down" size={12} color={colors.primary} /><T style="caption1" color="accent">{`Show ${Math.min(10, section.more)} more · ${section.more} hidden`}</T></Pressable> : null}
        renderItem={({ item }) => {
          const active = item.running && live; const attention = pending.some(p => p.agentId === item.sessionId);
          const tree = subagentTree(item, subIndex, byId);
          return <View style={{ marginLeft: 19, paddingLeft: 10, paddingRight: 12, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${sessionTitle(item)}${active ? ', working' : ''}${attention ? ', needs input' : ''}`} onPress={() => router.push({ pathname: '/thread/[id]', params: { id: item.sessionId, harness: client?.connection.url ?? savedUrl } })} onLongPress={client ? () => threadMenu(item.sessionId, sessionTitle(item)) : undefined} delayLongPress={350} style={({ pressed }) => ({ minHeight: 38, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: pressed ? colors.fill : 'transparent' })}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: attention ? '#ffb74d' : active ? colors.live : 'transparent' }} />
              <T style="footnote" numberOfLines={1} styleOverride={{ flex: 1 }}>{sessionTitle(item)}</T>
              {pinned.includes(item.sessionId) ? <Ionicons name="pin" size={11} color={colors.muted} /> : null}
              <SubagentToggle nodes={tree} open={!!subOpen[item.sessionId]} onToggle={() => setSubOpen(o => ({ ...o, [item.sessionId]: !o[item.sessionId] }))} />
              <T style="caption2" color="secondary">{relativeTime(item.updatedAt)}</T>
            </Pressable>
            {subOpen[item.sessionId] && tree.length ? <SubagentBranches nodes={tree} live={live} onOpen={n => router.push({ pathname: '/thread/[id]', params: { id: n.session.sessionId, harness: client?.connection.url ?? savedUrl } })} /> : null}
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
          {client ? <IconButton icon="folder-open-outline" size={19} label="Add workspace" onPress={() => router.push('/workspace-new')} /> : null}
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
