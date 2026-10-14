import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useApp } from './app';
import { CHANNELS, endAlert, requestAlert, shouldDeliver, type Alert, type Kind } from '../lib/notify';
import { isListedSession, sessionTitle, textContent } from '../lib/protocol';
import type { HarnessClient } from '../lib/harness';
import { background } from '../../modules/dsh-background';

/**
 * Agent notifications (local, no push server):
 *  - "Needs your input": a question / approval / plan review arrives;
 *  - "Finished" / "Failed" / "Stopped": a thread goes running → idle; its last turn/end decides which.
 * Delivered while the app is open or recently backgrounded (and, with the opt-in background
 * service, while it is closed). Never for the thread on screen; one notification per thread.
 */
const PREFS = 'dsh.notify.prefs';
type Prefs = Record<Kind, boolean> & { background: boolean };
const DEFAULTS: Prefs = { input: true, failed: true, finished: true, stopped: false, background: false };
type Api = { prefs: Prefs; setPref: (k: keyof Prefs, v: boolean) => void; permission: 'granted' | 'denied' | 'undetermined'; requestPermission: () => Promise<boolean>; setViewing: (id?: string) => void; markStoppedByMe: (id: string) => void };
const Ctx = createContext<Api | null>(null);

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  for (const c of Object.values(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name, description: c.description,
      importance: c.high ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: c.high ? [0, 200, 120, 200] : null, showBadge: true,
    });
  }
}

/** How the latest turn ended + its reply preview, from a tiny follow (latest messages only). */
export async function lastTurnEnd(client: HarnessClient, sessionId: string): Promise<{ end?: any; reply: string }> {
  return new Promise(resolve => {
    let done = false;
    const finish = (v: { end?: any; reply: string }) => { if (done) return; done = true; clearTimeout(timer); stop(); resolve(v); };
    const stop = client.follow('session/follow', { request: { address: { kind: 'session', sessionId }, maxMessages: 2 } }, frame => {
      if (frame.type !== 'snapshot') return;
      const events = (frame.records ?? []).filter((r: any) => r.type === 'event').map((r: any) => r.event);
      const end = [...events].reverse().find((e: any) => e?.type === 'turn/end');
      const assistant = [...events].reverse().find((e: any) => e?.type === 'assistant/message' || e?.type === 'attempt/settled');
      const message = assistant?.data?.message ?? assistant?.data?.assistantMessage;
      finish({ end: end?.data?.reason, reply: textContent(message?.content ?? assistant?.data?.content) });
    });
    const timer = setTimeout(() => finish({ reply: '' }), 8000);
  });
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { client, sessions, pending } = useApp();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [permission, setPermission] = useState<Api['permission']>('undetermined');
  const viewing = useRef<string | undefined>(undefined);
  const foreground = useRef(AppState.currentState === 'active');
  const stoppedByMe = useRef(new Map<string, number>());
  const prevRunning = useRef(new Map<string, boolean>());
  const seenRequests = useRef(new Set<string>());
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);

  useEffect(() => {
    void SecureStore.getItemAsync(PREFS).then(v => { if (v) setPrefs({ ...DEFAULTS, ...JSON.parse(v) }); }).catch(() => {});
    void ensureChannels().catch(() => {});
    void Notifications.getPermissionsAsync().then(p => setPermission(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied')).catch(() => {});
    const app = AppState.addEventListener('change', s => { foreground.current = s === 'active'; });
    // Tapping a notification opens its thread.
    const open = (r: Notifications.NotificationResponse | null) => {
      const id = r?.notification.request.content.data?.sessionId;
      if (typeof id === 'string' && id) router.push({ pathname: '/thread/[id]', params: { id } });
    };
    open(Notifications.getLastNotificationResponse());
    const tap = Notifications.addNotificationResponseReceivedListener(open);
    return () => { app.remove(); tap.remove(); };
  }, []);

  // Opt-in background connection: a foreground service keeps this process (and the live socket) alive.
  const { savedUrl } = useApp();
  useEffect(() => {
    if (!background.available) return;
    if (prefs.background && client && permission === 'granted') {
      const host = savedUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      background.start('Connected to your Harness', `${host} · notifies you when an agent finishes or needs you`);
    } else background.stop();
  }, [prefs.background, client, permission, savedUrl]);

  const deliver = useCallback(async (alert: Alert) => {
    if (!shouldDeliver(alert, { foreground: foreground.current, viewing: viewing.current, enabled: prefsRef.current })) return;
    await Notifications.scheduleNotificationAsync({
      identifier: `dsh-${alert.sessionId}`, // one per thread: a newer event replaces the older one
      content: { title: alert.title, body: alert.body, data: { sessionId: alert.sessionId, kind: alert.kind }, color: '#89baff' },
      trigger: Platform.OS === 'android' ? { channelId: CHANNELS[alert.kind].id } : null,
    }).catch(() => {});
  }, []);

  // Questions / approvals / plan reviews.
  useEffect(() => {
    for (const p of pending) {
      if (seenRequests.current.has(p.eventId)) continue;
      seenRequests.current.add(p.eventId);
      const s = sessions.find(x => x.sessionId === p.agentId);
      const a = requestAlert(p, s ? sessionTitle(s) : 'DSH');
      if (a) void deliver(a);
    }
  }, [pending, sessions, deliver]);

  // Running → idle, from the live status event (a fast turn can start and end between list refreshes).
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const { onSessionStatus } = useApp();
  useEffect(() => onSessionStatus((id, running) => {
    const was = prevRunning.current.get(id);
    prevRunning.current.set(id, running);
    if (running || was !== true || !client) return; // only a real running → idle change (never on connect)
    const s = sessionsRef.current.find(x => x.sessionId === id);
    if (s && !isListedSession(s)) return; // subagents report through their parent
    const mine = (stoppedByMe.current.get(id) ?? 0) > Date.now() - 60_000;
    stoppedByMe.current.delete(id);
    void lastTurnEnd(client, id).then(({ end, reply }) => {
      const title = s ? sessionTitle(s) : 'DSH';
      const alert = endAlert(end, id, title, reply, mine);
      if (alert) void deliver(alert);
    });
  }), [onSessionStatus, client, deliver]);

  const setPref = useCallback((k: keyof Prefs, v: boolean) => setPrefs(p => { const n = { ...p, [k]: v }; void SecureStore.setItemAsync(PREFS, JSON.stringify(n)).catch(() => {}); return n; }), []);
  const requestPermission = useCallback(async () => {
    await ensureChannels().catch(() => {});
    const r = await Notifications.requestPermissionsAsync();
    setPermission(r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied');
    return r.granted;
  }, []);
  const setViewing = useCallback((id?: string) => { viewing.current = id; if (id) void Notifications.dismissNotificationAsync(`dsh-${id}`).catch(() => {}); }, []);
  const markStoppedByMe = useCallback((id: string) => { stoppedByMe.current.set(id, Date.now()); }, []);

  const value = useMemo(() => ({ prefs, setPref, permission, requestPermission, setViewing, markStoppedByMe }), [prefs, setPref, permission, requestPermission, setViewing, markStoppedByMe]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications outside NotificationProvider');
  return v;
}
