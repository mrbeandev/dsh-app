import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * What tapping Send does while the agent is working (Settings › Chat):
 * - 'queue': deliver after the current turn ends (the Harness default; long-press steers);
 * - 'steer': deliver at the agent's next step (long-press queues instead).
 * When the agent is idle, Send just sends — the setting doesn't apply.
 */
export type SendMode = 'queue' | 'steer';
const KEY = 'dsh.send-while-working';

let current: SendMode = 'queue';
let loaded = false;
const listeners = new Set<() => void>();

export function sendModeFrom(raw: string | null | undefined): SendMode { return raw === 'steer' ? 'steer' : 'queue'; }

export async function loadSendMode() {
  if (loaded) return current;
  try { current = sendModeFrom(Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY)); } catch { /* default */ }
  loaded = true;
  for (const l of listeners) l();
  return current;
}

export async function setSendMode(mode: SendMode) {
  current = mode; loaded = true;
  for (const l of listeners) l();
  try { if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, mode); else await SecureStore.setItemAsync(KEY, mode); } catch { /* best effort */ }
}

const subscribe = (l: () => void) => { listeners.add(l); if (!loaded) void loadSendMode(); return () => { listeners.delete(l); }; };
const get = () => current;
export function useSendMode() { return useSyncExternalStore(subscribe, get, get); }

/** The mode a tap (primary) or long-press (secondary) uses while the agent is working. */
export function sendActions(preferred: SendMode) {
  return { tap: preferred, longPress: preferred === 'steer' ? 'queue' as const : 'steer' as const };
}

/** Test hook. */
export function _resetSendMode() { current = 'queue'; loaded = false; listeners.clear(); }
