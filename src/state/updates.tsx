import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { checkForUpdate, downloadUpdate, installUpdate, type Download, type UpdateState } from '../lib/updater';
import { errorMessage } from '../lib/harness';

const LAST_CHECK = 'dsh.update.lastCheck';
const SKIPPED = 'dsh.update.skipped';
const EVERY_MS = 6 * 60 * 60 * 1000;

type Api = { state: UpdateState; check: (manual?: boolean) => Promise<void>; download: () => void; cancel: () => void; install: () => Promise<void>; skip: () => void; skipped: string };
const Ctx = createContext<Api | null>(null);

/** Async updater: never blocks app work. Checks on launch/foreground (≤ every 6 h) and on demand. */
export function UpdateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const [skipped, setSkipped] = useState('');
  const active = useRef<Download | null>(null);
  const busy = useRef(false);

  const check = useCallback(async (manual = false) => {
    if (Platform.OS !== 'android' || busy.current) return;
    if (!manual) {
      const last = Number(await SecureStore.getItemAsync(LAST_CHECK).catch(() => null)) || 0;
      if (Date.now() - last < EVERY_MS) return;
    }
    busy.current = true;
    setState(s => (s.kind === 'downloading' || s.kind === 'ready' ? s : manual ? { kind: 'checking' } : s));
    try {
      const release = await checkForUpdate(AbortSignal.timeout(15000));
      await SecureStore.setItemAsync(LAST_CHECK, String(Date.now())).catch(() => {});
      setState(s => (s.kind === 'downloading' || s.kind === 'ready' ? s : release ? { kind: 'available', release } : { kind: 'current', checkedAt: Date.now() }));
    } catch (e) { if (manual) setState({ kind: 'error', message: errorMessage(e) }); }
    finally { busy.current = false; }
  }, []);

  useEffect(() => {
    void SecureStore.getItemAsync(SKIPPED).then(v => setSkipped(v ?? '')).catch(() => {});
    const t = setTimeout(() => void check(false), 4000); // after the app has settled
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void check(false); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [check]);

  const download = useCallback(() => {
    setState(s => {
      if (s.kind !== 'available' && s.kind !== 'error') return s;
      const release = s.kind === 'available' ? s.release : s.release; if (!release) return s;
      const d = downloadUpdate(release, progress => setState(cur => (cur.kind === 'downloading' ? { ...cur, progress } : cur)));
      active.current = d;
      d.promise.then(file => setState({ kind: 'ready', release, file }))
        .catch(e => setState(/abort/i.test(String((e as Error)?.name ?? e)) ? { kind: 'available', release } : { kind: 'error', message: errorMessage(e), release }))
        .finally(() => { active.current = null; });
      return { kind: 'downloading', release, progress: 0 };
    });
  }, []);
  const cancel = useCallback(() => active.current?.cancel(), []);
  const install = useCallback(async () => { if (state.kind === 'ready') { try { await installUpdate(state.file); } catch (e) { setState({ kind: 'error', message: errorMessage(e), release: state.release }); } } }, [state]);
  const skip = useCallback(() => { if (state.kind === 'available') { setSkipped(state.release.version); void SecureStore.setItemAsync(SKIPPED, state.release.version).catch(() => {}); } }, [state]);

  const value = useMemo(() => ({ state, check, download, cancel, install, skip, skipped }), [state, check, download, cancel, install, skip, skipped]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useUpdates() { const v = useContext(Ctx); if (!v) throw new Error('UpdateProvider missing'); return v; }
