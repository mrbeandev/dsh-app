import { memo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';
import { MessageMarkdown } from './MessageMarkdown';
import { toolTitle, type ContextIcon, type TranscriptRow } from '../lib/protocol';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const CONTEXT_ICONS: Record<ContextIcon, IconName> = { time: 'time-outline', goal: 'flag-outline', skill: 'flash-outline', plan: 'list-outline', schedule: 'alarm-outline', hook: 'git-branch-outline', tools: 'construct-outline', answer: 'chatbox-ellipses-outline', subagent: 'people-outline', webhook: 'globe-outline', info: 'information-circle-outline' };

/**
 * Quiet process row, styled like the DSH web chat: tertiary icon + text at rest,
 * a chevron, and an inset detail panel when expanded.
 */
function ProcessRow({ icon, iconColor, title, detail, children, tone, busy, defaultOpen = false }: { icon: IconName; iconColor?: string; title: React.ReactNode; detail?: string; children?: React.ReactNode; tone?: 'error' | 'warning'; busy?: boolean; defaultOpen?: boolean }) {
  const { colors } = useApp(); const [open, setOpen] = useState(defaultOpen);
  const expandable = !!children;
  const color = tone === 'error' ? colors.danger : tone === 'warning' ? '#ffb74d' : colors.muted;
  return <View>
    <Pressable accessibilityRole={expandable ? 'button' : undefined} accessibilityState={expandable ? { expanded: open } : undefined} disabled={!expandable} onPress={() => setOpen(o => !o)} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => ({ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.55 : 1 })}>
      {busy ? <ActivityIndicator size="small" color={colors.muted} style={{ transform: [{ scale: 0.7 }], width: 14 }} /> : <Ionicons name={icon} size={14} color={iconColor ?? color} />}
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center' }}>{typeof title === 'string' ? <T style="footnote" color={color} numberOfLines={1}>{title}</T> : title}</View>
      {detail ? <T style="caption1" color="tertiary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{detail}</T> : null}
      {expandable ? <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={11} color={colors.tertiary} /> : null}
    </Pressable>
    {open && children ? <View style={{ marginTop: 4, marginLeft: 21, borderRadius: 10, backgroundColor: colors.grouped, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>{children}</View> : null}
  </View>;
}

function Mono({ text, label, max = 4000, color }: { text: string; label?: string; max?: number; color?: string }) {
  const { colors } = useApp();
  const body = text.length > max ? `${text.slice(0, max)}\n… ${text.length - max} more characters` : text;
  return <View>
    {label ? <View style={{ paddingHorizontal: 10, paddingTop: 7 }}><T style="caption2" color="tertiary" weight="600" styleOverride={{ letterSpacing: 0.5 }}>{label.toUpperCase()}</T></View> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={{ color: color ?? colors.muted, fontFamily: MONO, fontSize: 11, lineHeight: 16, paddingHorizontal: 10, paddingVertical: 7 }}>{body}</Text></ScrollView>
  </View>;
}

function prettyArgs(args: string) { try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; } }

export const ChatRow = memo(function ChatRow({ row }: { row: TranscriptRow }) {
  const { colors } = useApp();
  switch (row.kind) {
    case 'user':
      return <View style={{ marginLeft: 40, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 1, backgroundColor: colors.bubble, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}><T style="caption2" color="secondary">You</T><MessageMarkdown text={row.text} /></View>;
    case 'assistant':
      return <View style={{ gap: 4 }}>
        {row.reasoning ? <ProcessRow icon="bulb-outline" title="Thought" detail={row.reasoning.split('\n')[0].slice(0, 60)}><Mono text={row.reasoning} /></ProcessRow> : null}
        {row.text ? <View><View style={{ marginBottom: 3 }}><T style="caption2" color="secondary">Assistant</T></View><MessageMarkdown text={row.text} />{row.interrupted ? <T style="caption1" color="tertiary">Interrupted</T> : null}</View> : null}
      </View>;
    case 'tool': {
      const { verb, target } = toolTitle(row.name, row.args);
      const title = <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}><Text style={{ color: row.isError ? colors.danger : colors.muted, fontWeight: '500' }}>{verb}</Text>{target ? <Text style={{ color: colors.tertiary, fontFamily: MONO, fontSize: 12 }}>{'  '}{target}</Text> : null}{row.approval ? <Text style={{ color: row.approval === 'denied' ? colors.danger : row.approval === 'asked' ? '#ffb74d' : colors.tertiary, fontSize: 11 }}>{'  ·  '}{row.approval === 'asked' ? 'Needs approval' : row.approval === 'allowed' ? 'Allowed' : row.approval === 'denied' ? 'Denied' : 'Approval cancelled'}</Text> : null}</Text>;
      return <ProcessRow icon={row.isError ? 'alert-circle-outline' : /^Ran/.test(verb) ? 'terminal-outline' : /Read|Wrote|Edited/.test(verb) ? 'document-text-outline' : /Search|Listed/.test(verb) ? 'search-outline' : /web|Fetched/.test(verb) ? 'globe-outline' : 'construct-outline'} tone={row.isError ? 'error' : undefined} busy={row.pending} title={title}>
        {row.args ? <Mono label={row.name} text={prettyArgs(row.args)} /> : null}
        {row.result !== undefined ? <><View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} /><Mono label={row.isError ? 'Error' : 'Result'} text={row.errorReason ? `${row.errorReason}\n\n${row.result}` : row.result || '(no output)'} color={row.isError ? colors.danger : undefined} /></> : null}
      </ProcessRow>;
    }
    case 'context':
      return <ProcessRow icon={CONTEXT_ICONS[row.icon]} title={row.label} detail={row.summary}>{row.text ? <View style={{ padding: 10 }}><MessageMarkdown text={row.text} /></View> : null}</ProcessRow>;
    case 'compaction':
      return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
        <View style={{ maxWidth: '80%' }}><ProcessRow icon={row.state === 'failed' ? 'warning-outline' : 'layers-outline'} tone={row.state === 'failed' ? 'warning' : undefined} busy={row.state === 'running'} title={row.state === 'running' ? 'Compacting context…' : row.state === 'failed' ? 'Context compaction failed' : 'Context compacted'} detail={row.tokens ? `${Math.round(row.tokens / 1000)}k tokens summarized` : undefined}>{row.summary || row.error ? <View style={{ padding: 10 }}><MessageMarkdown text={row.summary || row.error || ''} /></View> : null}</ProcessRow></View>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
      </View>;
    case 'system':
      return <ProcessRow icon="document-lock-outline" title="System prompt" detail={`${Math.max(1, Math.round(row.text.length / 4 / 100) / 10)}k tokens`}><Mono text={row.text} max={6000} /></ProcessRow>;
    case 'failure':
      return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 }}><View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: row.warning ? '#ffb74d' : colors.danger }} /><View style={{ flex: 1 }}><T style="footnote" color={row.warning ? 'secondary' : 'danger'} selectable>{row.text}</T></View></View>;
    case 'notice':
      return <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="code-slash-outline" size={13} color={colors.muted} /><T style="footnote" color="secondary">{row.label}</T>{row.text ? <T style="caption1" color="tertiary" numberOfLines={1}>{row.text}</T> : null}</View>;
    default:
      return <ProcessRow icon="ellipse-outline" title={row.label}><Mono text={row.text} /></ProcessRow>;
  }
});
