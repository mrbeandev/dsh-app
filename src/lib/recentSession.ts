import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'dsh.recent-sessions';
let values: Record<string, string> = {};
let loaded: Promise<void> | undefined;
let writes = Promise.resolve();
const normalize = (url: string) => url.replace(/\/+$/, '');
async function load() {
  loaded ??= (async () => {
    try {
      const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
      if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')); }
    } catch { /* unavailable storage: keep an in-memory fallback */ }
  })();
  await loaded;
}
/** Device-local, per-Harness pointer. Store only identifiers, never prompts or tokens. */
export async function rememberSession(url: string, id: string) {
  if (!url || !id) return;
  await load(); const key = normalize(url);
  if (values[key] === id) return;
  values = { ...values, [key]: id };
  writes = writes.catch(() => {}).then(async () => {
    try {
      const raw = JSON.stringify(values);
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, raw);
      else await SecureStore.setItemAsync(KEY, raw);
    } catch { /* gesture still works for the current app lifetime */ }
  });
  await writes;
}
export async function recentSession(url: string): Promise<string | null> {
  await load(); return values[normalize(url)] ?? null;
}
/** Negative horizontal movement, enough distance or a deliberate quick flick. */
export function shouldOpenRecent(dx: number, dy: number, vx: number) {
  return Math.abs(dy) < 55 && (dx < -100 || (dx < -40 && vx < -550));
}
