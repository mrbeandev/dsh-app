import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useApp } from './app';
import { emptyUnseen, markSeen, observeRunning, prune, type UnseenState } from '../lib/unseen';

/**
 * Green "finished, not seen yet" dots (Web UI parity). Watches live running → stopped changes,
 * marks threads that finish while you aren't looking at them, and clears the mark when you open
 * the thread. Marks are saved per Harness so they survive restarting the app.
 */
type Api = { unseen: ReadonlySet<string>; setViewing: (id?: string) => void };
const Ctx = createContext<Api>({ unseen: new Set(), setViewing: () => {} });

const keyFor = (url: string) => `dsh.unseen.${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 80)}`;

export function UnseenProvider({ children }: { children: React.ReactNode }) {
  const { client, savedUrl, sessions, onSessionStatus } = useApp();
  const url = client?.connection.url ?? savedUrl;
  const [state, setState] = useState<UnseenState>(emptyUnseen);
  // Pointers read inside event handlers (never during render): which thread is open, list seed.
  const viewing = useRef<string | undefined>(undefined);
  const seeded = useRef<Record<string, boolean>>({});
  const loadedFor = useRef('');

  // Load saved marks for this Harness.
  useEffect(() => {
    if (!url || loadedFor.current === url) return;
    loadedFor.current = url;
    void SecureStore.getItemAsync(keyFor(url)).then(v => {
      const saved: string[] = v ? JSON.parse(v) : [];
      setState(s => ({ ...s, unseen: [...new Set([...saved, ...s.unseen])] }));
    }).catch(() => {});
  }, [url]);

  // Save marks (only the ids; running state is live).
  useEffect(() => {
    if (!url || loadedFor.current !== url) return;
    void SecureStore.setItemAsync(keyFor(url), JSON.stringify(state.unseen)).catch(() => {});
  }, [url, state.unseen]);

  // Live running/stopped transitions from the Harness.
  useEffect(() => onSessionStatus((id, running) => setState(s => {
    const base = s.running[id] === undefined && seeded.current[id] ? { ...s, running: { ...s.running, [id]: true } } : s;
    return observeRunning(base, id, running, viewing.current);
  })), [onSessionStatus]);

  // Threads already running when the app opened count as running (so their stop is noticed), and
  // marks for threads that no longer exist are ignored — both derived at render, no extra state.
  const present = useMemo(() => new Set(sessions.map(x => x.sessionId)), [sessions]);
  const runningAtList = useMemo(() => Object.fromEntries(sessions.filter(x => x.running).map(x => [x.sessionId, true] as const)), [sessions]);
  useEffect(() => { seeded.current = runningAtList; }, [runningAtList]);

  // Stable setViewing (consumers' effects depend on it): created once, writes the ref from a
  // handler (allowed), never during render.
  const [setViewing] = useState(() => (id?: string) => { viewing.current = id; if (id) setState(s => markSeen(s, id)); });
  const unseen = useMemo(() => new Set(prune(state, present).unseen), [state, present]);
  const value = useMemo(() => ({ unseen, setViewing }), [unseen, setViewing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useUnseen = () => useContext(Ctx);
