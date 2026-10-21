import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { SkeletonRows } from '../components/Loader';
import { UpdateBanner } from '../components/UpdateCard';
import { SyncStatus } from '../components/SyncStatus';
import { useUnseen } from '../state/unseen';
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
/** Sessions listed directly under each workspace; the rest sit behind "Show more", revealed a page at a time. */
const SESSIONS_SHOWN = 5;
const SESSIONS_PAGE = 10;

export default function Home() {
  const { colors, sessions, workspaces, archived, pinned, client, status, deviceOffline, savedUrl, loading, refresh, resync, refreshWorkspace, pending } = useApp();
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
  const { unseen } = useUnseen();
  const live = status === 'connected';
  const rows = useMemo(() => sessions.filter(x => isListedSession(x) && !archived.includes(x.sessionId)).filter(x => (sessionTitle(x) + ' ' + (x.cwd ?? '')).toLowerCase().includes(query.toLowerCase()) && (filter !== 'Working' || (live && x.running))), [sessions, archived, query, filter, live]);
  const groups = useMemo(() => groupWorkspaces(rows, workspaces).filter(g => g.sessions.length || (!query && filter === 'All')).map(g => ({ ...g, sessions: [...g.sessions].sort((a, b) => Number(pinned.includes(b.sessionId)) - Number(pinned.includes(a.sessionId))) })), [rows, workspaces, query, filter, pinned]);
  const collapseByDefault = groups.length > 5;
  const isOpen = useCallback((id: string) => !!query || (openState[id] ?? !collapseByDefault), [query, openState, collapseByDefault]);
  const sections = useMemo(() => groups.map(g => {
    if (!isOpen(g.id)) return { ...g, data: [] as typeof g.sessions, more: 0 };
    if (query || g.sessions.length <= SESSIONS_SHOWN) return { ...g, data: g.sessions, more: 0 };
    const limit = shown[g.id] ?? SESSIONS_SHOWN;
    return { ...g, data: g.sessions.slice(0, limit), more: Math.max(0, g.sessions.length - limit) };
  }), [groups, isOpen, query, shown]);
  const workingCount = sessions.filter(x => isListedSession(x) && live && x.running).length;
  const toggle = (id: string) => setOpenState(p => ({ ...p, [id]: !isOpen(id) }));
  const showMore = (id: string) => setShown(p => ({ ...p, [id]: (p[id] ?? SESSIONS_SHOWN) + SESSIONS_PAGE }));
  // Pull-to-refresh = the same full sync as the "Synced …" button: reconnect the live socket if it dropped,
  // then re-fetch sessions/workspaces. Keep the spinner up briefly so a fast refresh is still visible.
  const reload = async () => {
    setRefreshing(true); const started = Date.now();
    try {
      if (deviceOffline) throw new Error('This device is offline. Connect to a network to refresh.');
      if (!client) throw new Error('Not connected to a Harness.');
      await resync(); setError('');
    } catch (e) { setError(errorMessage(e)); }
    finally { const wait = 600 - (Date.now() - started); if (wait > 0) await new Promise(r => setTimeout(r, wait)); setRefreshing(false); }
  };
  const host = client ? new URL(client.connection.url).host : savedUrl ? new URL(savedUrl).host : '';
  // Connection state shown beside the Harness host: green Live, gray Connecting…, red Offline.
  const connecting = !!host && (status === 'connecting' || status === 'reconnecting' || status === 'cached');
  const conn = !host ? { label: 'Not connected', color: colors.tertiary }
    : live ? { label: 'Live', color: colors.success }
    : connecting ? { label: 'Connecting…', color: colors.muted }
    : { label: 'Offline', color: colors.danger };
  const statusText = host ? `${host} · ${conn.label}` : conn.label;

  const menu = useActionMenu(); const dialog = useDialog();
  const act = (fn: () => Promise<unknown>) => { void fn().then(() => refresh()).catch(e => setError(errorMessage(e))); };
  const confirm = (title: string, message: string, label: string, run: () => void) => { void dialog.confirm({ title, message, confirm: label, destructive: true }).then(ok => { if (ok) run(); }); };
  /** Workspace actions via the official workspace API (same calls the Web UI sidebar makes). */
  const workspaceMenu = (section: { id: string; title: string; path: string; sessions: { sessionId: string }[] }) => {
    const real = !section.id.startsWith('path:'); const first = section.sessions[0]?.sessionId;
    menu({ title: section.title, subtitle: section.path, actions: [
      { label: 'New Session Here', icon: 'add-circle-outline', onPress: () => router.push({ pathname: '/new', params: { cwd: section.path } }) },
      ...(first ? [{ label: 'Browse Files', icon: 'folder-open-outline' as const, onPress: () => router.push({ pathname: '/files', params: { sessionId: first, root: section.path } }) }, { label: 'Open Terminal', icon: 'terminal-outline' as const, onPress: () => router.push({ pathname: '/terminal', params: { sessionId: first } }) }] : []),
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={colors.text} colors={[colors.text]} progressBackgroundColor={colors.popover} progressViewOffset={insets.top + 72} />}
        contentContainerStyle={{ paddingTop: 60, paddingBottom: insets.bottom + 90, flexGrow: 1 }}
        ListHeaderComponent={<><UpdateBanner /><View style={{ paddingHorizontal: 12, gap: 10, paddingBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Harness: ${statusText}. Change connection`} onPress={() => router.push('/connect')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, paddingHorizontal: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: conn.color }} />
              {host ? <T style="footnote" color="secondary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{host}</T> : null}
              <T style="footnote" weight="600" color={conn.color} numberOfLines={1}>{host ? `· ${conn.label}` : conn.label}</T>
              <Ionicons name="chevron-down" size={11} color={colors.muted} />
            </Pressable>
            <SyncStatus />
          </View>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search workspaces and sessions" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {(['All', 'Working'] as const).map(x => { const on = filter === x; return <Pressable key={x} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(x)} hitSlop={slop(30)} style={({ pressed }) => ({ height: 30, paddingHorizontal: 12, borderRadius: 8, boxShadow: on ? `inset 0 1px 0 ${colors.rim}` : undefined, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: on ? colors.fill : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on ? colors.glassEdge : 'transparent', opacity: pressed ? 0.6 : 1 })}><T style="footnote" weight="500">{x}</T>{x === 'Working' && workingCount ? <T style="caption1" color="secondary">{workingCount}</T> : null}</Pressable>; })}
            <View style={{ flex: 1 }} />
          </View>
        </View></>}
        renderSectionHeader={({ section }) => { const open = isOpen(section.id); const runningHere = section.sessions.some(x => live && x.running); return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 4, marginHorizontal: 12, marginTop: 7, marginBottom: open ? 3 : 0, borderRadius: 11, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: `inset 0 1px 0 ${colors.rim}` }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${section.title}, ${section.sessions.length} sessions`} accessibilityState={{ expanded: open }} onPress={() => toggle(section.id)} style={({ pressed }) => ({ flex: 1, minHeight: 32, paddingHorizontal: 5, borderRadius: 8, backgroundColor: pressed ? colors.state : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} style={{ width: 12 }} />
            <Ionicons name={open ? 'folder-open-outline' : 'folder-outline'} size={14} color={colors.muted} />
            <T style="subhead" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{section.title}</T>
            <T style="caption1" color="secondary">{section.sessions.length}</T>
            {!open && runningHere ? <View accessibilityLabel="Has a live session" style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.live }} /> : null}
          </Pressable>
          <WorkspaceAction icon="add" label={`New session in ${section.title}`} disabled={!client || !live} onPress={() => router.push({ pathname: '/new', params: { cwd: section.path } })} />
          <WorkspaceAction icon="ellipsis-horizontal" label={`Options for ${section.title}`} onPress={() => workspaceMenu(section)} />
        </View>; }}
        renderSectionFooter={({ section }) => section.more ? <Pressable accessibilityRole="button" accessibilityLabel={`Show ${Math.min(SESSIONS_PAGE, section.more)} more sessions in ${section.title}`} onPress={() => showMore(section.id)} style={({ pressed }) => ({ marginLeft: 29, paddingLeft: 26, paddingVertical: 8, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.5 : 1 })}><Ionicons name="chevron-down" size={12} color={colors.primary} /><T style="caption1" color="accent">{`Show ${Math.min(SESSIONS_PAGE, section.more)} more · ${section.more} hidden`}</T></Pressable> : null}
        renderItem={({ item, index, section }) => {
          const active = item.running && live; const attention = pending.some(p => p.agentId === item.sessionId);
          const finished = !active && !attention && unseen.has(item.sessionId);
          const tree = subagentTree(item, subIndex, byId);
          return <View style={{ marginLeft: 29, paddingLeft: 15, marginRight: 12, paddingBottom: 3 }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: index === section.data.length - 1 && !section.more ? 19 : 0, width: 1, backgroundColor: colors.border }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 16, width: 15, height: 1, backgroundColor: colors.border }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`${sessionTitle(item)}${active ? ', working' : ''}${attention ? ', needs input' : ''}${finished ? ', finished, not seen yet' : ''}`} onPress={() => router.push({ pathname: '/thread/[id]', params: { id: item.sessionId, harness: client?.connection.url ?? savedUrl } })} onLongPress={client ? () => threadMenu(item.sessionId, sessionTitle(item)) : undefined} delayLongPress={350} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: pressed ? colors.state : colors.panel })}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.tertiary} />
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: attention ? colors.warning : active ? colors.live : finished ? (colors.success) : 'transparent' }} />
              <T style="footnote" numberOfLines={1} styleOverride={{ flex: 1 }}>{sessionTitle(item)}</T>
              {pinned.includes(item.sessionId) ? <Ionicons name="pin" size={11} color={colors.muted} /> : null}
              <SubagentToggle nodes={tree} open={!!subOpen[item.sessionId]} onToggle={() => setSubOpen(o => ({ ...o, [item.sessionId]: !o[item.sessionId] }))} />
              <T style="caption2" color="secondary">{relativeTime(item.updatedAt)}</T>
            </Pressable>
            {subOpen[item.sessionId] && tree.length ? <SubagentBranches nodes={tree} live={live} onOpen={n => router.push({ pathname: '/thread/[id]', params: { id: n.session.sessionId, harness: client?.connection.url ?? savedUrl } })} /> : null}
          </View>;
        }}
        ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', paddingTop: 40, gap: 20 }}>
          <Empty icon={client ? 'search' : 'server-outline'} title={client ? 'No Sessions' : 'Connect a Harness'} detail={client ? (query ? 'No sessions match your search.' : 'Start a new task to see it here.') : 'Add your Harness URL and token to see your workspaces and sessions.'} />
          {!client && !sessions.length ? <View style={{ paddingHorizontal: 48 }}><Button title="Connect" onPress={() => router.push('/connect')} /></View> : null}
        </View>}
      />}
      <ErrorNotice message={deviceOffline ? '' : error} />
    </GlassTarget>

    {/* Floating control layer */}
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0 }}>
      <ScrollEdge height={64} />
      <GlassTargetProvider value={target}>
        <Header title="DSH" large leading={<View style={{ width: 8 }} />} logo={<View accessible accessibilityRole="header" accessibilityLabel="DSH" style={{ flexDirection: 'row', alignItems: 'center' }}><Image source={require('../../assets/brand/header-logo.png')} style={{ width: 34, height: 34 }} resizeMode="contain" /></View>}>
          {client ? <IconButton icon="folder-open-outline" size={19} label="Add workspace" onPress={() => router.push('/workspace-new')} /> : null}
          <IconButton icon="settings-outline" size={19} label="Settings" onPress={() => router.push('/settings')} />
        </Header>
      </GlassTargetProvider>
    </View>
    {client ? <View pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: insets.bottom + 14 }}>
      <GlassTargetProvider value={target}>
        <Pressable accessibilityRole="button" accessibilityLabel="New task" onPress={() => router.push('/new')} hitSlop={4} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <Glass radius={11} interactive prominent style={{ height: 44, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="add" size={20} color={colors.text} /><T style="footnote" weight="600">New task</T></Glass>
        </Pressable>
      </GlassTargetProvider>
    </View> : null}
  </Screen>;
}

/** Independent workspace actions: bordered compact buttons, with 44pt-wide touch targets. */
function WorkspaceAction({ icon, label, onPress, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={{ top: 4, bottom: 4 }}
    style={({ pressed }) => ({ width: 34, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.state : colors.panel, opacity: disabled ? 0.35 : pressed ? 0.65 : 1 })}>
    <Ionicons name={icon} size={18} color={colors.text} />
  </Pressable>;
}
