import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { HarnessClient } from '../lib/harness';
import { Connection, Frame, Session } from '../lib/protocol';
import { cacheEpoch, readCatalog, writeCatalog, clearWorkspaceHistory } from '../lib/cache';
type ThemeMode = 'system' | 'light' | 'dark';
// Apple HIG semantic system colors (iOS light / dark). Glass tones follow the materials guidance:
// glass only on the control layer, content stays on solid backgrounds.
// Palette taken from the approved glass prototype (designs/android-glass-preview): soft charcoal / cool-gray,
// warm-gray glass with a light hairline edge, off-white text, soft blue accent.
const light = { dark: false, bg: '#edf1f5', card: '#ffffff', grouped: '#ffffff8a', text: '#202936', muted: '#586677', tertiary: '#58667799', border: '#29426026', separator: '#29426026', primary: '#1c65b9', bubble: '#ffffff8a', danger: '#c62828', success: '#2e7d32', live: '#1c65b9', glass: '#fafbfcf2', glassEdge: '#fffffff2', fill: '#2942601a' };
const dark = { dark: true, bg: '#0e0f11', card: '#1c1c1f', grouped: '#2e2e3175', text: '#edf0f6', muted: '#aeb6c5', tertiary: '#aeb6c580', border: '#d3dff426', separator: '#d3dff426', primary: '#89baff', bubble: '#2e2e3175', danger: '#ff8a80', success: '#81c995', live: '#89baff', glass: '#2c2c2ef0', glassEdge: '#e0ebff29', fill: '#2e2e3175' };
export type Colors = typeof light;
type AppState = { client: HarnessClient | null; sessions: Session[]; workspaces: Frame[]; archived: string[]; pinned: string[]; status: string; savedUrl: string; loading: boolean; pending: Frame[]; onSessionStatus: (fn: (id: string, running: boolean) => void) => () => void; theme: ThemeMode; colors: Colors; connect: (c: Connection) => Promise<void>; disconnect: () => Promise<void>; refresh: () => Promise<void>; refreshWorkspace: (ids: string[]) => Promise<void>; setTheme: (t: ThemeMode) => void; dismiss: (id: string) => void };
const Context = createContext<AppState | null>(null);
const credentials = { read: async () => Platform.OS === 'web' ? null : SecureStore.getItemAsync('dsh.connection'), save: async (c: Connection) => { if (Platform.OS !== 'web') await SecureStore.setItemAsync('dsh.connection', JSON.stringify(c)); }, clear: async () => { if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('dsh.connection'); } };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<HarnessClient | null>(null); const current = useRef<HarnessClient | null>(null);
  // Live running/idle transitions straight from the Harness event, before any list refresh can hide them.
  const statusListeners = useRef(new Set<(id: string, running: boolean) => void>());
  const onSessionStatus = useCallback((fn: (id: string, running: boolean) => void) => { statusListeners.current.add(fn); return () => { statusListeners.current.delete(fn); }; }, []);
  const [sessions, setSessions] = useState<Session[]>([]); const [workspaces, setWorkspaces] = useState<Frame[]>([]);
  const [archived, setArchived] = useState<string[]>([]); const [pinned, setPinned] = useState<string[]>([]);
  const [status, setStatus] = useState('disconnected'); const [savedUrl, setSavedUrl] = useState(''); const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Frame[]>([]); const [theme, setTheme] = useState<ThemeMode>('system'); const system = useColorScheme();
  const catalog = useRef<{ sessions: Session[]; workspaces: Frame[] }>({ sessions: [], workspaces: [] });
  const refreshFlight = useRef<Promise<void> | null>(null);
  const persist = useCallback(() => { const c = current.current; if (c) void writeCatalog({ url: c.connection.url, ...catalog.current, savedAt: Date.now() }).catch(() => {}); }, []);
  const refresh = useCallback(async () => {
    const c = current.current; if (!c) return;
    if (refreshFlight.current) return refreshFlight.current;
    const epoch = cacheEpoch(c.connection.url);
    const task = (async () => {
      const [result, workspace] = await Promise.all([c.call('session/list', { _request: {} }), c.call('workspace/list', {}).catch(() => null)]);
      if (current.current !== c) return;
      catalog.current = { sessions: result.items ?? [], workspaces: workspace?.items ?? catalog.current.workspaces };
      setSessions(catalog.current.sessions); setWorkspaces(catalog.current.workspaces);
      await writeCatalog({ url: c.connection.url, ...catalog.current, savedAt: Date.now() }, epoch);
    })();
    refreshFlight.current = task; try { await task; } finally { if (refreshFlight.current === task) refreshFlight.current = null; }
  }, []);
  const connect = useCallback(async (connection: Connection) => {
    const next = new HarnessClient(connection); await next.authenticate(); await credentials.save(next.connection);
    current.current?.disconnect(); current.current = next; refreshFlight.current = null;
    setPending([]); setClient(next); setSavedUrl(next.connection.url); setStatus('connecting');
    const cached = await readCatalog(next.connection.url).catch(() => null);
    if (cached) { catalog.current = { sessions: cached.sessions.map(s => ({ ...s, running: false })), workspaces: cached.workspaces }; setSessions(catalog.current.sessions); setWorkspaces(cached.workspaces); }
    next.onStatus = value => { if (current.current !== next) return; setStatus(value); if (value !== 'connected') { catalog.current.sessions = catalog.current.sessions.map(s => ({ ...s, running: false })); setSessions(catalog.current.sessions); } };
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (current.current === next) void refresh().catch(() => {}); }, 250); };
    next.follow('$events', {}, frame => {
      if (frame.type === 'ready') { next.clientId = frame.clientId; setPending([]); setStatus('connected'); scheduleRefresh(); }
      if (frame.type === 'waterfall') setPending(p => [...p.filter(x => x.eventId !== frame.eventId), { ...frame, clientId: next.clientId }]);
      if (frame.type === 'cancel') setPending(p => p.filter(x => x.eventId !== frame.eventId));
      if (frame.type === 'emit' && frame.event === 'api-session/status') {
        const [id, running] = frame.args; for (const fn of statusListeners.current) { try { fn(String(id), !!running); } catch { /* listener errors never break the stream */ } }
        catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === id ? { ...s, running: !!running } : s); setSessions(catalog.current.sessions); scheduleRefresh();
      } else if (frame.type === 'emit' && /session|workspace/.test(frame.event)) scheduleRefresh();
    });
    next.follow('session/control', {}, frame => {
      if (frame.type === 'baseline') { catalog.current.sessions = catalog.current.sessions.map(s => ({ ...s, projections: { ...s.projections, values: { ...s.projections?.values, ...frame.value?.projections?.[s.sessionId] } } })); setSessions(catalog.current.sessions); persist(); }
      if (frame.type === 'projection') { catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === frame.sessionId ? { ...s, projections: { ...s.projections, values: { ...s.projections?.values, [frame.key]: frame.value } } } : s); setSessions(catalog.current.sessions); persist(); }
    });
    next.follow('workspace/follow', {}, frame => {
      // Official workspace/follow frames: baseline { items, archivedSessionIds, pinnedSessionIds } then increments.
      if (frame.type === 'baseline') { catalog.current.workspaces = frame.value?.items ?? frame.workspaces ?? []; setArchived(frame.value?.archivedSessionIds ?? []); setPinned(frame.value?.pinnedSessionIds ?? []); }
      else if (frame.type === 'archived') { setArchived(frame.archivedSessionIds ?? []); return; }
      else if (frame.type === 'pinned') { setPinned(frame.pinnedSessionIds ?? []); return; }
      else if (frame.type === 'order') { const order: string[] = frame.workspaceIds ?? []; catalog.current.workspaces = [...catalog.current.workspaces].sort((a, b) => order.indexOf(a.workspaceId) - order.indexOf(b.workspaceId)); }
      else if (frame.type === 'upsert') catalog.current.workspaces = [...catalog.current.workspaces.filter(w => w.workspaceId !== frame.workspace.workspaceId), frame.workspace];
      else if (frame.type === 'remove') catalog.current.workspaces = catalog.current.workspaces.filter(w => w.workspaceId !== frame.workspaceId);
      else return;
      setWorkspaces(catalog.current.workspaces); persist(); scheduleRefresh();
    });
    next.connectStreams(); await refresh();
  }, [refresh, persist]);
  const disconnect = async () => { current.current?.disconnect(); current.current = null; setClient(null); setSessions([]); setWorkspaces([]); setArchived([]); setPinned([]); setPending([]); setStatus('disconnected'); await credentials.clear(); };
  const refreshWorkspace = async (ids: string[]) => { if (!current.current) throw new Error('Connect Harness to refresh this workspace.'); await clearWorkspaceHistory(current.current.connection.url, ids); await refresh(); };
  useEffect(() => { let active = true; void credentials.read().then(async value => {
    if (!active || !value) return; const c = JSON.parse(value); setSavedUrl(c.url);
    const cached = await readCatalog(c.url).catch(() => null);
    if (active && cached) { catalog.current = { sessions: cached.sessions.map(s => ({ ...s, running: false })), workspaces: cached.workspaces }; setSessions(catalog.current.sessions); setWorkspaces(cached.workspaces); setLoading(false); setStatus('cached'); }
    if (active) await connect(c);
  }).catch(() => setStatus('offline')).finally(() => { if (active) setLoading(false); }); return () => { active = false; current.current?.disconnect(); }; }, [connect]);
  return <Context.Provider value={{ onSessionStatus, client, sessions, workspaces, archived, pinned, status, savedUrl, loading, pending, theme, colors: (theme === 'system' ? system === 'dark' : theme === 'dark') ? dark : light, connect, disconnect, refresh, refreshWorkspace, setTheme, dismiss: id => setPending(p => p.filter(x => x.eventId !== id)) }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
