import { memo, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChatScrollContext } from './chatScroll';
import { StepDetailContext } from './stepDetail';
import { Dots } from './Loader';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';
import { MessageMarkdown } from './MessageMarkdown';
import { buildTranscript, toolTitle, type ContextIcon, type TranscriptRow, type WireEvent } from '../lib/protocol';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const CONTEXT_ICONS: Record<ContextIcon, IconName> = { time: 'time-outline', goal: 'flag-outline', skill: 'flash-outline', plan: 'list-outline', schedule: 'alarm-outline', hook: 'git-branch-outline', tools: 'construct-outline', answer: 'chatbox-ellipses-outline', subagent: 'people-outline', webhook: 'globe-outline', info: 'information-circle-outline' };

/**
 * Quiet process row, styled like the DSH web chat: tertiary icon + text at rest,
 * a chevron, and an inset detail panel when expanded.
 */
/**
 * Expand/collapse that keeps the tapped header fixed. The body's height is driven frame by frame
 * (open: 0 → measured height, close: height → 0); in the chat's inverted list each frame also moves
 * the scroll offset by the same height change, so the header stays put and the content grows or
 * shrinks below it. Once open, height is automatic so nested rows can still grow.
 */
function Collapsible({ open, style, children }: { open: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const scroll = useContext(ChatScrollContext);
  const [height] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(open);
  const [settled, setSettled] = useState(open); // open and done animating → natural height
  const [target, setTarget] = useState(0);
  const shown = useRef(0); // current body height in dp
  const reduce = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(v => { reduce.current = v; }).catch(() => {}); }, []);

  if (open && !mounted) setMounted(true);
  if (!open && settled) setSettled(false);

  useEffect(() => {
    if (!mounted || (open && !target)) return; // opening waits for the first measurement
    const from = shown.current, to = open ? target : 0;
    const startOffset = scroll ? scroll.offset() : 0;
    const duration = reduce.current ? 0 : Math.min(320, 170 + Math.abs(to - from) / 5);
    const ease = Easing.out(Easing.cubic);
    const t0 = Date.now(); let frame = 0; let alive = true;
    const step = () => {
      if (!alive) return;
      const k = duration ? Math.min(1, (Date.now() - t0) / duration) : 1;
      const h = from + (to - from) * ease(k);
      shown.current = h; height.setValue(h);
      if (scroll) scroll.scrollTo(Math.max(0, startOffset + (h - from)));
      if (k < 1) { frame = requestAnimationFrame(step); return; }
      if (open) setSettled(true); else { setMounted(false); setTarget(0); }
    };
    frame = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [open, target, mounted, height, scroll]);

  if (!mounted) return null;
  // Same element tree in every phase, so nested rows keep their state when the animation settles.
  return <Animated.View style={settled ? null : { height, overflow: 'hidden' }}>
    <View style={[settled ? null : { position: 'absolute', left: 0, right: 0, top: 0 }, style]} onLayout={e => {
      const h = e.nativeEvent.layout.height;
      if (settled) shown.current = h;
      else if (open && h && !target) setTarget(h);
    }}>{children}</View>
  </Animated.View>;
}

function ProcessRow({ icon, iconColor, title, detail, children, load, tone, busy, defaultOpen = false }: { icon: IconName; iconColor?: string; title: React.ReactNode; detail?: string; children?: React.ReactNode; /** Fetch the body before opening (lite rows: the step's full events from the phone DB). */ load?: () => Promise<React.ReactNode>; tone?: 'error' | 'warning'; busy?: boolean; defaultOpen?: boolean }) {
  const { colors } = useApp(); const [open, setOpenState] = useState(defaultOpen);
  const [loaded, setLoaded] = useState<React.ReactNode>(null); const [loading, setLoading] = useState(false);
  // Lite rows load first, then open — so the expand animation measures the real content once.
  const setOpen = (next: (o: boolean) => boolean) => {
    const want = next(open);
    if (want && load && loaded === null) {
      if (loading) return; setLoading(true);
      void load().then(n => { setLoaded(n ?? <View style={{ padding: 10 }}><T style="caption1" color="tertiary">No details.</T></View>); setOpenState(true); })
        .catch(e => { setLoaded(<View style={{ padding: 10 }}><T style="caption1" color="danger">{`Couldn’t load: ${e?.message ?? e}`}</T></View>); setOpenState(true); })
        .finally(() => setLoading(false));
      return;
    }
    setOpenState(want);
  };
  const body = load ? loaded : children;
  busy = busy || loading;
  const expandable = !!children || !!load;
  const color = tone === 'error' ? colors.danger : tone === 'warning' ? '#ffb74d' : colors.muted;
  return <View>
    <Pressable accessibilityRole={expandable ? 'button' : undefined} accessibilityState={expandable ? { expanded: open } : undefined} disabled={!expandable} onPress={() => setOpen(o => !o)} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => ({ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.55 : 1 })}>
      {busy ? <View style={{ width: 14, alignItems: 'center' }}><Dots size="sm" color={colors.muted} /></View> : <Ionicons name={icon} size={14} color={iconColor ?? color} />}
      <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center' }}>{typeof title === 'string' ? <T style="footnote" color={color} numberOfLines={1}>{title}</T> : title}</View>
      {detail ? <T style="caption1" color="tertiary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{detail}</T> : null}
      {expandable ? <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={11} color={colors.tertiary} /> : null}
    </Pressable>
    {expandable ? <Collapsible open={open}><View style={{ marginTop: 4, marginLeft: 21, borderRadius: 10, backgroundColor: colors.grouped, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' }}>{body}</View></Collapsible> : null}
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

/** Rebuild one lite row from its full events (call + result for a tool; the single event otherwise). */
function fullRow(events: WireEvent[], id: string): TranscriptRow | undefined {
  const rows = buildTranscript(events);
  return rows.find(r => r.id === id) ?? rows[0];
}

function prettyArgs(args: string) { try { return JSON.stringify(JSON.parse(args), null, 2); } catch { return args; } }

export const ChatRow = memo(function ChatRow({ row, onUserAction, highlighted }: { row: TranscriptRow; onUserAction?: (row: Extract<TranscriptRow, { kind: 'user' }>) => void; highlighted?: boolean }) {
  const { colors } = useApp();
  const steps = useContext(StepDetailContext);
  const seq = Number(row.id);
  // Lite rows fetch their body (phone DB, or the Harness once) when expanded.
  const loadRange = (from: number, to: number) => steps ? steps.load(from, to) : Promise.resolve([] as WireEvent[]);
  switch (row.kind) {
    case 'user':
      return <Pressable accessibilityHint={onUserAction ? 'Long-press for rewind and copy' : undefined} delayLongPress={350} onLongPress={onUserAction ? () => onUserAction(row) : undefined} style={({ pressed }) => ({ marginLeft: 40, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 1, backgroundColor: colors.bubble, borderRadius: 17, borderWidth: highlighted ? 1.5 : StyleSheet.hairlineWidth, borderColor: highlighted ? colors.primary : pressed && onUserAction ? colors.glassEdge : colors.border, opacity: pressed && onUserAction ? 0.85 : 1 })}><View style={{ flexDirection: 'row', alignItems: 'center' }}><View style={{ flex: 1 }}><T style="caption2" color="secondary">You</T></View>{onUserAction ? <Pressable accessibilityRole="button" accessibilityLabel="Message actions" hitSlop={10} onPress={() => onUserAction(row)} style={{ paddingHorizontal: 2 }}><Ionicons name="ellipsis-horizontal" size={14} color={colors.tertiary} /></Pressable> : null}</View><MessageMarkdown text={row.text} /></Pressable>;
    case 'assistant':
      return <View style={{ gap: 4 }}>
        {row.reasoning ? (row.lite
          ? <ProcessRow icon="bulb-outline" title="Thought" load={async () => { const r = fullRow(await loadRange(seq, seq), row.id); return r?.kind === 'assistant' && r.reasoning ? <Mono text={r.reasoning} /> : null; }} />
          : <ProcessRow icon="bulb-outline" title="Thought" detail={row.reasoning.split('\n')[0].slice(0, 60)}><Mono text={row.reasoning} /></ProcessRow>) : null}
        {row.text ? <View><View style={{ marginBottom: 3 }}><T style="caption2" color="secondary">Assistant</T></View><MessageMarkdown text={row.text} />{row.interrupted ? <T style="caption1" color="tertiary">Interrupted</T> : null}</View> : null}
      </View>;
    case 'tool': {
      const { verb, target } = toolTitle(row.name, row.args);
      const title = <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}><Text style={{ color: row.isError ? colors.danger : colors.muted, fontWeight: '500' }}>{verb}</Text>{target ? <Text style={{ color: colors.tertiary, fontFamily: MONO, fontSize: 12 }}>{'  '}{target}</Text> : null}{row.approval ? <Text style={{ color: row.approval === 'denied' ? colors.danger : row.approval === 'asked' ? '#ffb74d' : colors.tertiary, fontSize: 11 }}>{'  ·  '}{row.approval === 'asked' ? 'Needs approval' : row.approval === 'allowed' ? 'Allowed' : row.approval === 'denied' ? 'Denied' : 'Approval cancelled'}</Text> : null}</Text>;
      const toolBody = (t: Extract<TranscriptRow, { kind: 'tool' }>) => <>
        {t.args ? <Mono label={t.name} text={prettyArgs(t.args)} /> : null}
        {t.result !== undefined ? <><View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} /><Mono label={t.isError ? 'Error' : 'Result'} text={t.errorReason ? `${t.errorReason}\n\n${t.result}` : t.result || '(no output)'} color={t.isError ? colors.danger : undefined} /></> : null}
      </>;
      if (row.lite) return <ProcessRow load={async () => { const r = fullRow(await loadRange(seq, row.resultSeq ?? seq), row.id); return r?.kind === 'tool' ? toolBody(r) : null; }} icon={row.isError ? 'alert-circle-outline' : /^Ran/.test(verb) ? 'terminal-outline' : /Read|Wrote|Edited/.test(verb) ? 'document-text-outline' : /Search|Listed/.test(verb) ? 'search-outline' : /web|Fetched/.test(verb) ? 'globe-outline' : 'construct-outline'} tone={row.isError ? 'error' : undefined} busy={row.pending} title={title} />;
      return <ProcessRow icon={row.isError ? 'alert-circle-outline' : /^Ran/.test(verb) ? 'terminal-outline' : /Read|Wrote|Edited/.test(verb) ? 'document-text-outline' : /Search|Listed/.test(verb) ? 'search-outline' : /web|Fetched/.test(verb) ? 'globe-outline' : 'construct-outline'} tone={row.isError ? 'error' : undefined} busy={row.pending} title={title}>{toolBody(row)}</ProcessRow>;
    }
    case 'context':
      if (row.lite) return <ProcessRow icon={CONTEXT_ICONS[row.icon]} title={row.label} detail={row.summary} load={async () => { const r = fullRow(await loadRange(seq, seq), row.id); return r && 'text' in r && r.text ? <View style={{ padding: 10 }}><MessageMarkdown text={r.text} /></View> : null; }} />;
      return <ProcessRow icon={CONTEXT_ICONS[row.icon]} title={row.label} detail={row.summary}>{row.text ? <View style={{ padding: 10 }}><MessageMarkdown text={row.text} /></View> : null}</ProcessRow>;
    case 'compaction':
      return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
        <View style={{ maxWidth: '80%' }}><ProcessRow icon={row.state === 'failed' ? 'warning-outline' : 'layers-outline'} tone={row.state === 'failed' ? 'warning' : undefined} busy={row.state === 'running'} title={row.state === 'running' ? 'Compacting context…' : row.state === 'failed' ? 'Context compaction failed' : 'Context compacted'} detail={row.tokens ? `${Math.round(row.tokens / 1000)}k tokens summarized` : undefined}>{row.summary || row.error ? <View style={{ padding: 10 }}><MessageMarkdown text={row.summary || row.error || ''} /></View> : null}</ProcessRow></View>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
      </View>;
    case 'system':
      if (row.lite) return <ProcessRow icon="document-lock-outline" title="System prompt" detail={row.bytes ? `${Math.max(1, Math.round(row.bytes / 4 / 100) / 10)}k tokens` : undefined} load={async () => { const r = fullRow(await loadRange(seq, seq), row.id); return r?.kind === 'system' ? <Mono text={r.text} max={6000} /> : null; }} />;
      return <ProcessRow icon="document-lock-outline" title="System prompt" detail={`${Math.max(1, Math.round(row.text.length / 4 / 100) / 10)}k tokens`}><Mono text={row.text} max={6000} /></ProcessRow>;
    case 'failure':
      return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 2 }}><View style={{ width: 7, height: 7, borderRadius: 4, marginTop: 6, backgroundColor: row.warning ? '#ffb74d' : colors.danger }} /><View style={{ flex: 1 }}><T style="footnote" color={row.warning ? 'secondary' : 'danger'} selectable>{row.text}</T></View></View>;
    case 'notice':
      return <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="code-slash-outline" size={13} color={colors.muted} /><T style="footnote" color="secondary">{row.label}</T>{row.text ? <T style="caption1" color="tertiary" numberOfLines={1}>{row.text}</T> : null}</View>;
    case 'turn':
      return <TurnFold row={row} />;
    default:
      return <ProcessRow icon="ellipse-outline" title={row.label}><Mono text={row.text} /></ProcessRow>;
  }
});

/** "Completed in 4m 5s ⌄" — the finished turn's process rows, collapsed (Web UI parity). */
function TurnFold({ row }: { row: Extract<TranscriptRow, { kind: 'turn' }> }) {
  const { colors } = useApp(); const [open, setOpen] = useState(false);
  const verb = row.outcome === 'completed' ? 'Completed' : row.outcome === 'failed' ? 'Failed' : 'Stopped';
  const detail = [row.tools ? `${row.tools} tool call${row.tools === 1 ? '' : 's'}` : '', row.steps > 1 ? `${row.steps} steps` : ''].filter(Boolean).join(' · ');
  // No container gap: spacing lives inside the animated body, so mounting it never shifts the header.
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${verb} in ${fmtDuration(row.durationMs)}${detail ? `, ${detail}` : ''}. ${open ? 'Hide' : 'Show'} steps`} onPress={() => setOpen(o => !o)} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}>
      <T style="caption1" color={row.outcome === 'failed' ? colors.danger : 'secondary'} styleOverride={{ fontSize: 12.5 }}>{`${verb} in ${fmtDuration(row.durationMs)}`}</T>
      {detail ? <T style="caption1" color="tertiary" styleOverride={{ fontSize: 12.5 }}>{`· ${detail}`}</T> : null}
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.tertiary} />
    </Pressable>
    <View style={{ height: StyleSheet.hairlineWidth, marginTop: 6, backgroundColor: open ? 'transparent' : colors.separator, marginBottom: 2 }} />
    <Collapsible open={open}><View style={{ gap: 6, marginTop: 4, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.border }}>{row.rows.map(r => <ChatRow key={r.id} row={r} />)}</View></Collapsible>
  </View>;
}
function fmtDuration(ms: number) {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${m}m` : `${m}m ${s}s`;
}
