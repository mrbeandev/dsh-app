import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Label, s } from './ui';
export function Disclosure({ title, text }: { title: string; text: string }) { const [open, setOpen] = useState(false); const { colors } = useApp(); return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' }}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={[s.row, { padding: 12 }]}><Ionicons name="terminal-outline" size={15} color={colors.muted} /><View style={{ flex: 1 }}><Label muted size={12}>{title}</Label></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} /></Pressable>{open && <Text selectable style={{ color: colors.muted, backgroundColor: colors.grouped, padding: 12, fontFamily: 'monospace', fontSize: 12, lineHeight: 19 }}>{text}</Text>}</View>; }
