import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { HarnessClient } from '../lib/harness';
import { Connection, Frame, Session } from '../lib/protocol';

type ThemeMode = 'system' | 'light' | 'dark';
const light = { bg: '#fcfcfc', card: '#ffffff', grouped: '#f4f4f5', text: '#27272a', muted: '#71717b', border: '#e4e4e7', primary: '#1b4ed8', bubble: '#efeff1', danger: '#c10007', success: '#047857' };
const dark = { bg: '#18181b', card: '#212124', grouped: '#27272a', text: '#f4f4f5', muted: '#a1a1aa', border: '#3f3f46', primary: '#8ba8ff', bubble: '#303034', danger: '#ff8a94', success: '#6ee7b7' };
export type Colors = typeof light;
type AppState = { client: HarnessClient | null; sessions: Session[]; status: string; savedUrl: string; loading: boolean; pending: Frame[]; theme: ThemeMode; colors: Colors; connect: (c: Connection) => Promise<void>; disconnect: () => Promise<void>; refresh: () => Promise<void>; setTheme: (t: ThemeMode) => void; dismiss: (id: string) => void };
const Context = createContext<AppState | null>(null);
// Never persist auth tokens in browser localStorage. Web sessions are intentionally memory-only.
const credentials = { read: async () => Platform.OS === 'web' ? null : SecureStore.getItemAsync('dsh.connection'), save: async (c: Connection) => { if (Platform.OS !== 'web') await SecureStore.setItemAsync('dsh.connection', JSON.stringify(c)); }, clear: async () => { if (Platform.OS !== 'web') await SecureStore.deleteItemAsync('dsh.connection'); } };
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<HarnessClient | null>(null);
  const current = useRef<HarnessClient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState('disconnected');
  const [savedUrl, setSavedUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Frame[]>([]);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const system = useColorScheme();
  const refresh = useCallback(async () => {
    if (!current.current) return;
    const result = await current.current.call('session/list', { _request: {} });
    setSessions(result.items ?? []);
  }, []);
  const connect = useCallback(async (connection: Connection) => {
    const next = new HarnessClient(connection);
    await next.authenticate();
    await credentials.save(next.connection);
    current.current?.disconnect(); current.current = next;
    setPending([]); setClient(next); setSavedUrl(next.connection.url); setStatus('connecting');
    next.onStatus = setStatus;
    next.follow('$events', {}, (frame) => {
      if (frame.type === 'ready') { next.clientId = frame.clientId; setPending([]); setStatus('connected'); void refresh().catch(() => {}); }
      if (frame.type === 'waterfall') setPending(p => [...p.filter(x => x.eventId !== frame.eventId), { ...frame, clientId: next.clientId }]);
      if (frame.type === 'cancel') setPending(p => p.filter(x => x.eventId !== frame.eventId));
      if (frame.type === 'emit') void refresh().catch(() => {});
    });
    next.connectStreams(); await refresh();
  }, [refresh]);
  const disconnect = async () => { current.current?.disconnect(); current.current = null; setClient(null); setSessions([]); setPending([]); setStatus('disconnected'); await credentials.clear(); };
  useEffect(() => {
    let active = true;
    void credentials.read().then(async value => { if (active && value) { const c = JSON.parse(value); setSavedUrl(c.url); await connect(c); } }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; current.current?.disconnect(); };
  }, [connect]);
  return <Context.Provider value={{ client, sessions, status, savedUrl, loading, pending, theme, colors: (theme === 'system' ? system === 'dark' : theme === 'dark') ? dark : light, connect, disconnect, refresh, setTheme, dismiss: id => setPending(p => p.filter(x => x.eventId !== id)) }}>{children}</Context.Provider>;
}
export function useApp() { const value = useContext(Context); if (!value) throw new Error('AppProvider missing'); return value; }
