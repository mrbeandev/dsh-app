import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';

/** Progressive disclosure for tool activity (HIG › Layout): a quiet one-line row that expands. */
export function Disclosure({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false); const { colors } = useApp();
  return <View style={{ borderRadius: 12, backgroundColor: open ? colors.grouped : 'transparent', overflow: 'hidden' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${open ? 'Hide' : 'Show'} details`} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: open ? 12 : 2, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.5 : 1 })}>
      <Ionicons name="terminal-outline" size={14} color={colors.muted} />
      <T style="footnote" color="secondary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{title}</T>
      <Ionicons name={open ? 'chevron-up' : 'chevron-forward'} size={12} color={colors.tertiary} />
    </Pressable>
    {open ? <Text selectable style={{ color: colors.muted, paddingHorizontal: 12, paddingBottom: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 17 }}>{text}</Text> : null}
  </View>;
}
