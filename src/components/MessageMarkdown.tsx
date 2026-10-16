import { memo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Markdown, { MarkdownIt, type RenderRules } from 'react-native-markdown-display';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useApp, type Colors } from '../state/app';

// Never execute HTML or load remote images automatically from model output.
const parser = MarkdownIt({ html: false, linkify: false, typographer: false });
export function safeMessageLink(url: string) { return /^https?:\/\//i.test(url) || /^mailto:/i.test(url); }
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** Fenced code block: header with language + copy action, horizontally scrollable monospace body. */
function CodeBlock({ code, lang, colors }: { code: string; lang?: string; colors: Colors }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void Clipboard.setStringAsync(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); };
  return <View style={{ marginVertical: 6, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, height: 30, backgroundColor: colors.fill, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <Text style={{ flex: 1, color: colors.muted, fontSize: 11, fontFamily: MONO }}>{lang || 'code'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={copied ? 'Copied' : 'Copy code'} onPress={copy} hitSlop={8} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 8, borderRadius: 13, opacity: pressed ? 0.5 : 1 })}>
        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={13} color={copied ? colors.primary : colors.muted} />
        <Text style={{ color: copied ? colors.primary : colors.muted, fontSize: 11 }}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={{ color: colors.text, fontFamily: MONO, fontSize: 11.5, lineHeight: 17, paddingHorizontal: 12, paddingVertical: 10 }}>{code}</Text></ScrollView>
  </View>;
}

export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  const { colors } = useApp();
  const rules: RenderRules = {
    image: node => <Text key={node.key} style={{ color: colors.muted }}>Image: {node.attributes.alt || 'attachment'} (not downloaded)</Text>,
    fence: node => <CodeBlock key={node.key} code={node.content.replace(/\n$/, '')} lang={(node as any).sourceInfo?.trim().split(/\s+/)[0]} colors={colors} />,
    code_block: node => <CodeBlock key={node.key} code={node.content.replace(/\n$/, '')} colors={colors} />,
    // Inline code: tinted monospace chip that stays on the text line.
    code_inline: (node, _c, _p, _s, inherited) => <Text key={node.key} selectable style={[inherited, { fontFamily: MONO, fontSize: 11.5, color: colors.codeInline, backgroundColor: colors.fill }]}>{` ${node.content} `}</Text>,
    // Quote: accent bar + tinted card.
    blockquote: (node, children) => <View key={node.key} style={{ flexDirection: 'row', marginVertical: 6, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.fill }}><View style={{ width: 3, backgroundColor: colors.primary }} /><View style={{ flex: 1, paddingHorizontal: 10, paddingTop: 7, paddingBottom: 1 }}>{children}</View></View>,
    text: (node, _children, _parents, _styles, inherited) => <Text key={node.key} selectable style={[inherited, { color: inherited?.color ?? colors.text }]}>{node.content}</Text>,
  };
  return <Markdown markdownit={parser} rules={rules} onLinkPress={url => { if (safeMessageLink(url)) void Linking.openURL(url).catch(() => {}); return false; }} style={{
    body: { color: colors.text, fontSize: 12.5, lineHeight: 18 },
    paragraph: { marginTop: 0, marginBottom: 6 },
    heading1: { fontSize: 15.5, lineHeight: 21, fontWeight: '700', marginTop: 6, marginBottom: 4 },
    heading2: { fontSize: 14, lineHeight: 19, fontWeight: '600', marginTop: 5, marginBottom: 3 },
    heading3: { fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 4, marginBottom: 3 },
    strong: { fontWeight: '600' }, em: { fontStyle: 'italic' },
    link: { color: colors.link, textDecorationLine: 'none' },
    bullet_list: { marginBottom: 6 }, ordered_list: { marginBottom: 6 }, list_item: { marginBottom: 2 },
    bullet_list_icon: { color: colors.muted, marginLeft: 2, marginRight: 6 }, ordered_list_icon: { color: colors.muted, marginRight: 6 },
    hr: { backgroundColor: colors.separator, height: StyleSheet.hairlineWidth, marginVertical: 10 },
    table: { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, marginVertical: 6 },
    thead: { backgroundColor: colors.fill }, th: { padding: 6, fontWeight: '600' },
    tr: { borderColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }, td: { padding: 6 },
  }}>{text}</Markdown>;
});
