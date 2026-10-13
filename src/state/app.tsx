import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { HarnessClient } from '../lib/harness';
import { Connection, Frame, Session } from '../lib/protocol';
import { cacheEpoch, readCatalog, writeCatalog, clearWorkspaceHistory } from '../lib/cache';
type ThemeMode = 'system' | 'light' | 'dark';
// Apple HIG semantic system colors (iOS light / dark). Glass tones follow the materials guidance:
// glass only on the control layer, content stays on solid backgrounds.
const light = { dark: false, bg: '#ffffff', card: '#ffffff', grouped: '#f2f2f7', text: '#000000', muted: '#3c3c4399', tertiary: '#3c3c434d', border: '#3c3c4333', separator: '#c6c6c8', primary: '#007aff', bubble: '#e9e9eb', danger: '#ff3b30', success: '#34c759', live: '#34c759', glass: '#f9f9f9cc', glassEdge: '#ffffffb3', fill: '#7878801f' };
const dark = { dark: true, bg: '#000000', card: '#1c1c1e', grouped: '#1c1c1e', text: '#ffffff', muted: '#ebebf599', tertiary: '#ebebf54d', border: '#54545899', separator: '#38383a', primary: '#0a84ff', bubble: '#2c2c2e', danger: '#ff453a', success: '#30d158', live: '#30d158', glass: '#1e1e20cc', glassEdge: '#ffffff1f', fill: '#7878803d' };
export type Colors = typeof light;
type AppState = { client: HarnessClient | null; sessions: Session[]; workspaces: Frame[]; status: string; savedUrl: string; loading: boolean; pending: Frame[]; theme: ThemeMode; colors: Colors; connect: (c: Connection) => Promise<void>; disconnect: () => Promise<void>; refresh: () => Promise<void>; refreshWorkspace: (ids: string[]) => Promise<void>; setTheme: (t: ThemeMode) => void; dismiss: (id: string) => void };
const Context = createContext<AppState | null>(null);
const credentials = { read: async () => Platform.OS === 'web' ? null : SecureStore.getItemAsync('dsh.connection'), save: async (c: Connection) => { if (Platform.OS !== 'web') await SecureStore.setItemAsync('dsh.connection', JSON.stringify(c)); }, clear: async () => { if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('dsh.connection'); } };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<HarnessClient | null>(null); const current = useRef<HarnessClient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]); const [workspaces, setWorkspaces] = useState<Frame[]>([]);
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
        const [id, running] = frame.args; catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === id ? { ...s, running: !!running } : s); setSessions(catalog.current.sessions); scheduleRefresh();
      } else if (frame.type === 'emit' && /session|workspace/.test(frame.event)) scheduleRefresh();
    });
    next.follow('session/control', {}, frame => {
      if (frame.type === 'baseline') { catalog.current.sessions = catalog.current.sessions.map(s => ({ ...s, projections: { ...s.projections, values: { ...s.projections?.values, ...frame.value?.projections?.[s.sessionId] } } })); setSessions(catalog.current.sessions); persist(); }
      if (frame.type === 'projection') { catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === frame.sessionId ? { ...s, projections: { ...s.projections, values: { ...s.projections?.values, [frame.key]: frame.value } } } : s); setSessions(catalog.current.sessions); persist(); }
    });
    next.follow('workspace/follow', {}, frame => {
      if (frame.type === 'baseline') catalog.current.workspaces = frame.workspaces ?? [];
      else if (frame.type === 'upsert') catalog.current.workspaces = [...catalog.current.workspaces.filter(w => w.workspaceId !== frame.workspace.workspaceId), frame.workspace];
      else if (frame.type === 'remove') catalog.current.workspaces = catalog.current.workspaces.filter(w => w.workspaceId !== frame.workspaceId);
      else return;
      setWorkspaces(catalog.current.workspaces); persist(); scheduleRefresh();
    });
    next.connectStreams(); await refresh();
  }, [refresh, persist]);
  const disconnect = async () => { current.current?.disconnect(); current.current = null; setClient(null); setSessions([]); setWorkspaces([]); setPending([]); setStatus('disconnected'); await credentials.clear(); };
  const refreshWorkspace = async (ids: string[]) => { if (!current.current) throw new Error('Connect Harness to refresh this workspace.'); await clearWorkspaceHistory(current.current.connection.url, ids); await refresh(); };
  useEffect(() => { let active = true; void credentials.read().then(async value => {
    if (!active || !value) return; const c = JSON.parse(value); setSavedUrl(c.url);
    const cached = await readCatalog(c.url).catch(() => null);
    if (active && cached) { catalog.current = { sessions: cached.sessions.map(s => ({ ...s, running: false })), workspaces: cached.workspaces }; setSessions(catalog.current.sessions); setWorkspaces(cached.workspaces); setLoading(false); setStatus('cached'); }
    if (active) await connect(c);
  }).catch(() => setStatus('offline')).finally(() => { if (active) setLoading(false); }); return () => { active = false; current.current?.disconnect(); }; }, [connect]);
  return <Context.Provider value={{ client, sessions, workspaces, status, savedUrl, loading, pending, theme, colors: (theme === 'system' ? system === 'dark' : theme === 'dark') ? dark : light, connect, disconnect, refresh, refreshWorkspace, setTheme, dismiss: id => setPending(p => p.filter(x => x.eventId !== id)) }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
