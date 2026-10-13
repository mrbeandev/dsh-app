import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../state/app';

/** Inline copy control: copies `value`, shows a checkmark for 1.4 s. */
export function CopyButton({ value, label = 'Copy', size = 15 }: { value: string; label?: string; size?: number }) {
  const { colors } = useApp(); const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = () => { void Clipboard.setStringAsync(value).then(() => { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1400); }); };
  return <Pressable accessibilityRole="button" accessibilityLabel={done ? 'Copied' : label} accessibilityLiveRegion="polite" hitSlop={8} onPress={copy} style={({ pressed }) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
    <Ionicons name={done ? 'checkmark' : 'copy-outline'} size={size} color={done ? colors.live : colors.muted} />
  </Pressable>;
}
