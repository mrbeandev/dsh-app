import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState as RNAppState, Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Network from 'expo-network';
import { deviceIsOffline } from '../lib/connectivity';
import { errorMessage, HarnessClient, isTransportError } from '../lib/harness';
import { drainOutbox, type OutboxItem } from '../lib/outbox';
import { Connection, Frame, Session } from '../lib/protocol';
import { applyBaseline, mergeRefreshed, withValues } from '../lib/projections';
import { cacheEpoch, readCatalog, writeCatalog, clearWorkspaceHistory } from '../lib/cache';
import { light, dark, type SolidGlassColors } from '../lib/solidGlass';
type ThemeMode = 'system' | 'light' | 'dark';
export type Colors = SolidGlassColors;
type AppState = { flushOutbox: () => Promise<void>; client: HarnessClient | null; sessions: Session[]; workspaces: Frame[]; archived: string[]; pinned: string[]; status: string; deviceOffline: boolean; savedUrl: string; loading: boolean; pending: Frame[]; onSessionStatus: (fn: (id: string, running: boolean) => void) => () => void; lastSync: () => number; resync: () => Promise<void>; applyProjections: (sessionId: string, values: Record<string, unknown>) => void; theme: ThemeMode; colors: Colors; connect: (c: Connection) => Promise<void>; disconnect: () => Promise<void>; refresh: () => Promise<void>; refreshWorkspace: (ids: string[]) => Promise<void>; setTheme: (t: ThemeMode) => void; dismiss: (id: string) => void };
const Context = createContext<AppState | null>(null);
const credentials = { read: async () => Platform.OS === 'web' ? null : SecureStore.getItemAsync('dsh.connection'), save: async (c: Connection) => { if (Platform.OS !== 'web') await SecureStore.setItemAsync('dsh.connection', JSON.stringify(c)); }, clear: async () => { if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('dsh.connection'); } };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [deviceOffline, setDeviceOffline] = useState(false);
  const offlineRef = useRef(false);
  const [client, setClient] = useState<HarnessClient | null>(null); const current = useRef<HarnessClient | null>(null);
  // Live running/idle transitions straight from the Harness event, before any list refresh can hide them.
  const statusListeners = useRef(new Set<(id: string, running: boolean) => void>());
  const onSessionStatus = useCallback((fn: (id: string, running: boolean) => void) => { statusListeners.current.add(fn); return () => { statusListeners.current.delete(fn); }; }, []);
  // Last time anything arrived from the Harness (live frame or RPC). A ref, read by the header's ticker,
  // so busy streams don't re-render the whole app.
  const lastSyncAt = useRef(0);
  const lastSync = useCallback(() => lastSyncAt.current, []);
  const [sessions, setSessions] = useState<Session[]>([]); const [workspaces, setWorkspaces] = useState<Frame[]>([]);
  const [archived, setArchived] = useState<string[]>([]); const [pinned, setPinned] = useState<string[]>([]);
  const [status, setStatus] = useState('disconnected'); const [savedUrl, setSavedUrl] = useState(''); const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Frame[]>([]); const [theme, setTheme] = useState<ThemeMode>('system'); const system = useColorScheme();
  const catalog = useRef<{ sessions: Session[]; workspaces: Frame[] }>({ sessions: [], workspaces: [] });
  const refreshFlight = useRef<Promise<void> | null>(null);
  // Live projection frames arrive many times a second while an agent works; serialising the whole
  // catalog to SQLite on each one blocked the JS thread. Coalesce writes into one per second.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = useCallback(() => {
    if (persistTimer.current) return;
    persistTimer.current = setTimeout(() => { persistTimer.current = undefined; const c = current.current; if (c) void writeCatalog({ url: c.connection.url, ...catalog.current, savedAt: Date.now() }).catch(() => {}); }, 1000);
  }, []);
  const refresh = useCallback(async () => {
    const c = current.current; if (!c || offlineRef.current) return;
    if (refreshFlight.current) return refreshFlight.current;
    const epoch = cacheEpoch(c.connection.url);
    const task = (async () => {
      const first = c.initialList; c.initialList = null;
      const [result, workspace] = await Promise.all([first ?? c.call('session/list', { _request: {} }), c.call('workspace/list', {}).catch(() => null)]);
      if (current.current !== c) return;
      // Keep live projection values (inbox, todos, goal, …) that arrived over session/control: list
      // items only carry partial hints, so a plain replace would drop the queue and other live state.
      const items = mergeRefreshed(catalog.current.sessions, result.items ?? []);
      catalog.current = { sessions: items, workspaces: workspace?.items ?? catalog.current.workspaces };
      setSessions(catalog.current.sessions); setWorkspaces(catalog.current.workspaces);
      await writeCatalog({ url: c.connection.url, ...catalog.current, savedAt: Date.now() }, epoch);
    })();
    refreshFlight.current = task; try { await task; } finally { if (refreshFlight.current === task) refreshFlight.current = null; }
  }, []);
  // Offline outbox: messages typed while disconnected are delivered here, in order, once connected.
  const draining = useRef(false);
  const flushOutbox = useCallback(async () => {
    const c = current.current; if (!c || draining.current || offlineRef.current) return;
    draining.current = true;
    try {
      const deliver = (item: OutboxItem) => c.request('session/prompt', { requestId: item.id, sessionId: item.sessionId, mode: item.mode, content: item.parts, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(() => {});
      const { sent } = await drainOutbox(c.connection.url, deliver, isTransportError, errorMessage);
      if (sent) void refresh().catch(() => {});
    } finally { draining.current = false; }
  }, [refresh]);
  const connect = useCallback(async (connection: Connection) => {
    const next = new HarnessClient(connection); await next.authenticate(); await credentials.save(next.connection);
    current.current?.disconnect(); current.current = next; refreshFlight.current = null;
    setPending([]); setClient(next); setSavedUrl(next.connection.url); setStatus('connecting');
    const cached = await readCatalog(next.connection.url).catch(() => null);
    if (cached) { catalog.current = { sessions: cached.sessions.map(s => ({ ...s, running: false })), workspaces: cached.workspaces }; setSessions(catalog.current.sessions); setWorkspaces(cached.workspaces); }
    next.onActivity = () => { if (current.current === next) lastSyncAt.current = Date.now(); };
    next.onStatus = value => { if (current.current !== next) return; setStatus(value); if (value !== 'connected') { catalog.current.sessions = catalog.current.sessions.map(s => ({ ...s, running: false })); setSessions(catalog.current.sessions); } };
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (current.current === next) void refresh().catch(() => {}); }, 250); };
    next.follow('$events', {}, frame => {
      if (frame.type === 'ready') { next.clientId = frame.clientId; setPending([]); setStatus('connected'); scheduleRefresh(); void flushOutbox(); }
      if (frame.type === 'waterfall') setPending(p => [...p.filter(x => x.eventId !== frame.eventId), { ...frame, clientId: next.clientId }]);
      if (frame.type === 'cancel') setPending(p => p.filter(x => x.eventId !== frame.eventId));
      if (frame.type === 'emit' && frame.event === 'api-session/status') {
        const [id, running] = frame.args; for (const fn of statusListeners.current) { try { fn(String(id), !!running); } catch { /* listener errors never break the stream */ } }
        catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === id ? { ...s, running: !!running } : s); setSessions(catalog.current.sessions); scheduleRefresh();
      } else if (frame.type === 'emit' && /session|workspace/.test(frame.event)) scheduleRefresh();
    });
    next.follow('session/control', {}, frame => {
      // Baseline: { projections: { [sessionId]: { asOfSeq, values } } } — merge the inner `values`.
      // (Spreading the whole entry put every key under values.values, so the queue never showed.)
      if (frame.type === 'baseline') { catalog.current.sessions = applyBaseline(catalog.current.sessions, frame.value); setSessions(catalog.current.sessions); persist(); }
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
  }, [refresh, persist, flushOutbox]);
  const disconnect = async () => { current.current?.disconnect(); current.current = null; setClient(null); setSessions([]); setWorkspaces([]); setArchived([]); setPinned([]); setPending([]); setStatus('disconnected'); await credentials.clear(); };
  /** Merge authoritative projection values for one session (e.g. from its follow snapshot). */
  const applyProjections = useCallback((sessionId: string, values: Record<string, unknown>) => {
    if (!values || !Object.keys(values).length) return;
    catalog.current.sessions = catalog.current.sessions.map(s => s.sessionId === sessionId ? withValues(s, values) : s);
    setSessions(catalog.current.sessions);
  }, []);
  /** Sync now: reconnect the live socket if it dropped, then reload threads and workspaces. */
  const resync = useCallback(async () => {
    const c = current.current; if (!c || offlineRef.current) return;
    c.reconnectNow();
    await refresh();
  }, [refresh]);
  useEffect(() => {
    let active = true;
    const update = (state: Network.NetworkState) => {
      if (!active) return;
      const offline = deviceIsOffline(state), wasOffline = offlineRef.current;
      offlineRef.current = offline; setDeviceOffline(offline);
      current.current?.setNetworkOffline(offline);
      if (offline) setStatus('offline');
      else if (wasOffline) {
        const c = current.current;
        if (c) { setStatus('reconnecting'); void resync().catch(() => setStatus('offline')); }
        else void credentials.read().then(value => { if (active && value) return connect(JSON.parse(value)); }).catch(() => { if (active) setStatus('offline'); });
      }
    };
    void Network.getNetworkStateAsync().then(update).catch(() => {});
    const subscription = Network.addNetworkStateListener(update);
    return () => { active = false; subscription.remove(); };
  }, [connect, resync]);
  // Light heartbeat while the app is open: re-check every 30 s if nothing arrived meanwhile, so the
  // "synced … ago" time stays honest and a silently dropped connection is noticed.
  useEffect(() => {
    const tick = () => {
      if (RNAppState.currentState !== 'active' || !current.current) return;
      if (Date.now() - lastSyncAt.current >= 30_000) void resync().catch(() => {});
      void flushOutbox();
    };
    const t = setInterval(tick, 10_000);
    const sub = RNAppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [resync, flushOutbox]);
  const refreshWorkspace = async (ids: string[]) => { if (!current.current) throw new Error('Connect Harness to refresh this workspace.'); await clearWorkspaceHistory(current.current.connection.url, ids); await refresh(); };
  useEffect(() => { let active = true; void credentials.read().then(async value => {
    if (!active || !value) return; const c = JSON.parse(value); setSavedUrl(c.url);
    const cached = await readCatalog(c.url).catch(() => null);
    if (active && cached) { catalog.current = { sessions: cached.sessions.map(s => ({ ...s, running: false })), workspaces: cached.workspaces }; setSessions(catalog.current.sessions); setWorkspaces(cached.workspaces); setLoading(false); setStatus('cached'); }
    const network = await Network.getNetworkStateAsync().catch(() => null);
    if (network && deviceIsOffline(network)) { offlineRef.current = true; setDeviceOffline(true); setStatus('offline'); }
    else if (active) await connect(c);
  }).catch(() => setStatus('offline')).finally(() => { if (active) setLoading(false); }); return () => { active = false; current.current?.disconnect(); }; }, [connect]);
  return <Context.Provider value={{ onSessionStatus, lastSync, resync, flushOutbox, applyProjections, client, sessions, workspaces, archived, pinned, status: deviceOffline ? 'offline' : status, deviceOffline, savedUrl, loading, pending, theme, colors: (theme === 'system' ? system === 'dark' : theme === 'dark') ? dark : light, connect, disconnect, refresh, refreshWorkspace, setTheme, dismiss: id => setPending(p => p.filter(x => x.eventId !== id)) }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
