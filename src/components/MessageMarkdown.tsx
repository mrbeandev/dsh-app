import { memo } from 'react';
import { Linking, Platform, ScrollView, Text } from 'react-native';
import Markdown, { MarkdownIt, type RenderRules } from 'react-native-markdown-display';
import { useApp } from '../state/app';
// Never execute HTML or load remote images automatically from model output.
const parser = MarkdownIt({ html: false, linkify: false, typographer: false });
export function safeMessageLink(url: string) { return /^https?:\/\//i.test(url) || /^mailto:/i.test(url); }
export const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  const { colors } = useApp(); const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const rules: RenderRules = {
    image: node => <Text key={node.key} style={{ color: colors.muted }}>Image: {node.attributes.alt || 'attachment'} (not downloaded)</Text>,
    fence: node => <ScrollView key={node.key} horizontal style={{ borderRadius: 12, backgroundColor: colors.grouped, marginVertical: 6 }}><Text selectable style={{ color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 }}>{node.content.replace(/\n$/, '')}</Text></ScrollView>,
    code_block: node => <ScrollView key={node.key} horizontal style={{ backgroundColor: colors.grouped, borderRadius: 12, marginVertical: 6 }}><Text selectable style={{ color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 10 }}>{node.content}</Text></ScrollView>,
    text: (node, _children, _parents, _styles, inherited) => <Text key={node.key} selectable style={[inherited, { color: colors.text }]}>{node.content}</Text>,
  };
  return <Markdown markdownit={parser} rules={rules} onLinkPress={url => { if (safeMessageLink(url)) void Linking.openURL(url).catch(() => {}); return false; }} style={{ body: { color: colors.text, fontSize: 17, lineHeight: 24 }, paragraph: { marginTop: 0, marginBottom: 8 }, heading1: { fontSize: 22, lineHeight: 28, fontWeight: '700', marginTop: 8, marginBottom: 6 }, heading2: { fontSize: 20, lineHeight: 25, fontWeight: '600', marginTop: 6, marginBottom: 4 }, heading3: { fontSize: 17, lineHeight: 22, fontWeight: '600', marginTop: 4, marginBottom: 4 }, strong: { fontWeight: '600' }, em: { fontStyle: 'italic' }, link: { color: colors.primary, textDecorationLine: 'none' }, code_inline: { color: colors.text, backgroundColor: colors.fill, fontFamily: mono, fontSize: 15, borderRadius: 4 }, bullet_list: { marginBottom: 6 }, ordered_list: { marginBottom: 6 }, list_item: { marginBottom: 3 }, blockquote: { backgroundColor: 'transparent', borderLeftColor: colors.separator, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 2, marginVertical: 4 }, hr: { backgroundColor: colors.separator, height: 1, marginVertical: 8 }, table: { borderColor: colors.separator, borderRadius: 8 }, tr: { borderColor: colors.separator }, th: { padding: 6 }, td: { padding: 6 } }}>{text}</Markdown>;
});
