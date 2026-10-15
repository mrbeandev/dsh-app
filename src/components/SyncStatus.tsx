import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';

/** "12s ago" / "3m ago" / "2h ago" — seconds matter here, unlike list timestamps. */
export function syncAgo(at: number, now = Date.now()) {
  if (!at) return 'never';
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/**
 * Last-sync time for the home header: when anything last arrived from the Harness. Ticks every
 * second; tapping syncs now (reconnects the live socket if it dropped, then reloads the lists).
 */
export function SyncStatus() {
  const { client, lastSync, resync, colors } = useApp();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!busy) { spin.stopAnimation(); spin.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }));
    loop.start(); return () => loop.stop();
  }, [busy, spin]);
  if (!client) return null;
  const at = lastSync();
  const stale = !at || now - at > 60_000;
  const label = busy ? 'Syncing…' : `Synced ${syncAgo(at, now)}`;
  const onPress = async () => {
    if (busy) return; setBusy(true);
    const started = Date.now();
    try { await resync(); } catch { /* the status dot/label shows offline; nothing else to do */ }
    // Keep the spinner visible briefly so a fast sync still reads as feedback.
    setTimeout(() => { setBusy(false); setNow(Date.now()); }, Math.max(0, 450 - (Date.now() - started)));
  };
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Sync now`} onPress={() => void onPress()} hitSlop={10} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, opacity: pressed ? 0.55 : 1 })}>
    <Animated.View style={{ transform: [{ rotate }] }}><Ionicons name="sync-outline" size={12} color={stale && !busy ? '#ffb74d' : colors.muted} /></Animated.View>
    <T style="footnote" color={stale && !busy ? '#ffb74d' : 'secondary'} numberOfLines={1}>{label}</T>
  </Pressable>;
}
