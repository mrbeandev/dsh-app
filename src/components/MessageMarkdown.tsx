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
    fence: node => <ScrollView key={node.key} horizontal style={{ borderRadius: 10, backgroundColor: colors.grouped, marginVertical: 6 }}><Text selectable style={{ color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 20, padding: 12 }}>{node.content.replace(/\n$/, '')}</Text></ScrollView>,
    code_block: node => <ScrollView key={node.key} horizontal style={{ backgroundColor: colors.grouped, borderRadius: 10 }}><Text selectable style={{ color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 20, padding: 12 }}>{node.content}</Text></ScrollView>,
    text: (node, _children, _parents, _styles, inherited) => <Text key={node.key} selectable style={[inherited, { color: colors.text }]}>{node.content}</Text>,
  };
  return <Markdown markdownit={parser} rules={rules} onLinkPress={url => { if (safeMessageLink(url)) void Linking.openURL(url).catch(() => {}); return false; }} style={{ body: { color: colors.text, fontSize: 16, lineHeight: 24 }, paragraph: { marginTop: 0, marginBottom: 10 }, heading1: { fontSize: 23, lineHeight: 30, fontWeight: '600', marginTop: 10, marginBottom: 8 }, heading2: { fontSize: 20, lineHeight: 27, fontWeight: '600', marginTop: 8, marginBottom: 6 }, heading3: { fontSize: 18, lineHeight: 25, fontWeight: '600', marginBottom: 6 }, strong: { fontWeight: '700' }, em: { fontStyle: 'italic' }, link: { color: colors.primary }, code_inline: { color: colors.text, backgroundColor: colors.grouped, fontFamily: mono, fontSize: 14 }, bullet_list: { marginBottom: 8 }, ordered_list: { marginBottom: 8 }, list_item: { marginBottom: 4 }, blockquote: { backgroundColor: colors.grouped, borderLeftColor: colors.border, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 6 }, hr: { backgroundColor: colors.border, height: 1 }, table: { borderColor: colors.border }, tr: { borderColor: colors.border }, th: { padding: 6 }, td: { padding: 6 } }}>{text}</Markdown>;
});
