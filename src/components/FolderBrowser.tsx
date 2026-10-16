import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { useDialog } from './Dialog';
import { Button, ErrorNotice, IconButton, T } from './ui';
import { Loading, SkeletonRows } from './Loader';
import { ShellBrowser } from '../lib/shellBrowse';
import { errorMessage } from '../lib/harness';
import { isNativeOnly, listDir, type DirListing, type DirMode } from '../lib/dirBrowse';

type Root = { sessionId: string; path: string; title: string };

/**
 * Pick a folder on the Harness. Uses the browse picker when the Harness offers it; otherwise browses
 * inside existing workspaces through the file API (see lib/dirBrowse.ts).
 */
export function FolderBrowser({ initial, confirmLabel, onPick, busy }: { initial?: string; confirmLabel: string; onPick: (path: string) => void; busy?: boolean }) {
  const { client, colors, sessions, workspaces } = useApp(); const dialog = useDialog();
  const [mode, setMode] = useState<DirMode | null>({ kind: 'browse' });
  const [path, setPath] = useState<string | undefined>(initial || undefined);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState(''); const [showHidden, setShowHidden] = useState(false);

  // Roots for scoped mode: each workspace (or session cwd) with a session that can authorise reads.
  const roots = useMemo<Root[]>(() => {
    const seen = new Map<string, Root>();
    for (const w of workspaces as any[]) { const sid = (w.sessionIds ?? []).find((id: string) => sessions.some(s => s.sessionId === id)); if (w.path && sid && !seen.has(w.path)) seen.set(w.path, { sessionId: sid, path: w.path, title: w.title || w.path.split('/').pop() }); }
    for (const s of sessions) if (s.cwd && !seen.has(s.cwd)) seen.set(s.cwd, { sessionId: s.sessionId, path: s.cwd, title: s.cwd.split('/').filter(Boolean).pop() ?? s.cwd });
    return [...seen.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [workspaces, sessions]);

  // When the Harness only offers its desktop chooser, browse through a short-lived Harness shell
  // (whole file system, from /). It needs any existing thread to host the shell.
  const shellHost = useMemo(() => [...sessions].filter(x => x.origin !== 'subagent').sort((a, b) => b.updatedAt - a.updatedAt)[0]?.sessionId, [sessions]);
  const [shell, setShell] = useState<ShellBrowser | null>(null);
  const [shellState, setShellState] = useState<'idle' | 'starting' | 'failed'>('idle');
  useEffect(() => () => { void shell?.close(); }, [shell]);
  const startShell = useCallback(async () => {
    if (!client || !shellHost) { setMode(null); return; }
    setShellState('starting');
    const b = new ShellBrowser(client, shellHost);
    try { await b.open(); setShell(b); setShellState('idle'); setMode({ kind: 'shell', browser: b }); }
    catch (e) { void b.close(); setShellState('failed'); setError(errorMessage(e)); setMode(null); }
  }, [client, shellHost]);

  useEffect(() => {
    if (!client || !mode) return; let active = true;
    listDir(client, mode, path).then(l => { if (active) { setListing(l); setError(''); } }).catch(e => {
      if (!active) return;
      if (mode.kind === 'browse' && isNativeOnly(e)) { setListing(null); void startShell(); return; }
      setError(errorMessage(e));
    });
    return () => { active = false; };
  }, [client, mode, path, startShell]);

  const go = (p: string) => { setListing(null); setPath(p); };
  const enterRoot = (r: Root) => { setListing(null); setPath(r.path); setMode({ kind: 'scoped', sessionId: r.sessionId, root: r.path }); };
  const canCreate = mode?.kind === 'browse' || mode?.kind === 'shell';
  const newFolder = async () => {
    if (!client || !listing || !canCreate) return;
    const name = await dialog.prompt({ title: 'New Folder', message: `Create inside ${listing.path}`, placeholder: 'Folder name', confirm: 'Create' });
    if (!name) return;
    try { go(mode?.kind === 'shell' ? await mode.browser.mkdir(listing.path, name) : await client.call<string>('directoryPicker/createDirectory', { path: listing.path, name })); } catch (e) { setError(errorMessage(e)); }
  };
  const entries = (listing?.entries ?? []).filter(e => showHidden || !e.hidden);

  if (!mode && shellState === 'starting') return <View style={{ flex: 1 }}><Loading label="Opening the Harness file system…" /></View>;
  // Last resort (no thread to host a shell, or the shell failed): browse inside existing workspaces.
  if (!mode) return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 14, paddingBottom: 8, gap: 4 }}>
      <T style="caption1" color="secondary">{shellHost ? 'Couldn’t open a shell on the Harness to browse its file system, so here are your workspaces instead.' : 'Start any session first so the app can browse the Harness file system. Meanwhile you can browse inside your workspaces.'}</T>
      {error ? <T style="caption1" color="danger">{error}</T> : null}
      {shellHost ? <Button title="Try Again" secondary onPress={() => void startShell()} /> : null}
    </View>
    <FlatList data={roots} keyExtractor={r => r.path} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListEmptyComponent={<T style="footnote" color="secondary" align="center">No workspaces yet.</T>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => enterRoot(item)} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}>
        <Ionicons name="folder" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}><T style="footnote" numberOfLines={1} styleOverride={{ fontSize: 14 }}>{item.title}</T><T style="caption2" color="tertiary" numberOfLines={1}>{item.path}</T></View>
        <Ionicons name="chevron-forward" size={13} color={colors.tertiary} />
      </Pressable>} />
  </View>;

  return <View style={{ flex: 1 }}>
    <View style={{ paddingHorizontal: 12, paddingBottom: 6, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
          {mode.kind === 'scoped' ? <Pressable accessibilityRole="button" onPress={() => { setMode(null); setListing(null); setPath(undefined); }} style={{ paddingVertical: 4, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 2 }}><Ionicons name="albums-outline" size={14} color={colors.primary} /><T style="footnote" color="secondary">Workspaces</T><Ionicons name="chevron-forward" size={11} color={colors.tertiary} /></Pressable> : null}
          {(listing?.crumbs ?? []).map((c, i, all) => <View key={c.path} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" onPress={() => go(c.path)} style={{ paddingVertical: 4, paddingHorizontal: 3 }}><T style="footnote" weight={i === all.length - 1 ? '600' : '400'} color={i === all.length - 1 ? 'primary' : 'secondary'}>{c.name}</T></Pressable>
            {i < all.length - 1 ? <Ionicons name="chevron-forward" size={11} color={colors.tertiary} /> : null}
          </View>)}
        </ScrollView>
        {mode.kind !== 'scoped' && listing?.path !== '/' ? <IconButton icon="arrow-up-circle-outline" size={18} label="Go to the root folder /" onPress={() => go('/')} /> : null}
        {mode.kind !== 'scoped' && listing && listing.path !== listing.home ? <IconButton icon="home-outline" size={17} label="Go to home folder" onPress={() => go(listing.home)} /> : null}
        <IconButton icon={showHidden ? 'eye-outline' : 'eye-off-outline'} size={17} label={showHidden ? 'Hide hidden folders' : 'Show hidden folders'} onPress={() => setShowHidden(v => !v)} />
        {canCreate ? <IconButton icon="add" size={19} label="New folder" onPress={() => void newFolder()} /> : null}
      </View>
    </View>
    <ErrorNotice message={error} />
    {!listing ? <SkeletonRows rows={8} indent={false} /> : <FlatList data={entries} keyExtractor={e => e.path} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListHeaderComponent={listing.path !== (mode.kind === 'scoped' ? listing.home : '/') ? <Pressable accessibilityRole="button" onPress={() => go(listing.crumbs[listing.crumbs.length - 2]?.path ?? listing.home)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.5 : 1 }]}><Ionicons name="arrow-up" size={17} color={colors.muted} /><T style="footnote" color="secondary">Up</T></Pressable> : null}
      ListEmptyComponent={<T style="footnote" color="secondary" align="center">No subfolders.</T>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => go(item.path)} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}><Ionicons name="folder" size={18} color={colors.primary} /><T style="footnote" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 14 }}>{item.name}</T><Ionicons name="chevron-forward" size={13} color={colors.tertiary} /></Pressable>} />}
    <View style={{ padding: 14, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}>
      <T style="caption1" color="secondary" numberOfLines={1}>{listing?.path ?? ' '}</T>
      <Button title={confirmLabel} onPress={() => listing && onPick(listing.path)} loading={busy} disabled={!listing} />
    </View>
  </View>;
}
const s = StyleSheet.create({ row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 10 } });
