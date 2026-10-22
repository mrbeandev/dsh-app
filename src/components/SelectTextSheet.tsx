import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../state/app';
import { Sheet } from './Sheet';
import { T } from './ui';

/**
 * Plain-text view of a reply for picking part of it. One selectable Text gives native selection
 * handles and the system Copy / Share / Select all bar across the whole reply, which the rendered
 * Markdown (many separate Text nodes) can't do across paragraphs. "Copy All" is there for convenience.
 */
export function SelectTextSheet({ text, onClose }: { text: string | null; onClose: () => void }) {
  const { colors } = useApp(); const [copied, setCopied] = useState(false);
  const copyAll = () => { if (text) void Clipboard.setStringAsync(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return <Sheet visible={text !== null} onClose={onClose} title="Select Text" height={0.85}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}>
      <T style="caption1" color="secondary" styleOverride={{ flex: 1 }}>Long-press a word, then drag the handles to choose what to copy.</T>
      <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Copied' : 'Copy all'} onPress={copyAll} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: 0.5, borderColor: colors.border })}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={colors.text} />
        <T style="caption1">{copied ? 'Copied' : 'Copy All'}</T>
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <Text selectable selectionColor={colors.link} style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{text ?? ''}</Text>
    </ScrollView>
  </Sheet>;
}
