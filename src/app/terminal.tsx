import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Loading } from '../components/Loader';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { Empty, ErrorNotice, Header, IconButton, Screen, T } from '../components/ui';
import { errorMessage } from '../lib/harness';
import * as SecureStore from 'expo-secure-store';
import { XTerm, type XTermHandle } from '../components/XTerm';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type TermInfo = { id: string; title: string; cwd: string; state: 'running' | 'exited' | 'failed'; exitCode: number | null; shell?: { name: string } };
const COLS = 80, ROWS = 24;
const KEYS: { label: string; data: string }[] = [{ label: 'Esc', data: '\u001b' }, { label: 'Tab', data: '\t' }, { label: '^C', data: '\u0003' }, { label: '^D', data: '\u0004' }, { label: '←', data: '\u001b[D' }, { label: '↑', data: '\u001b[A' }, { label: '↓', data: '\u001b[B' }, { label: '→', data: '\u001b[C' }, { label: 'Home', data: '\u001b[H' }, { label: 'End', data: '\u001b[F' }, { label: 'PgUp', data: '\u001b[5~' }, { label: 'PgDn', data: '\u001b[6~' }, { label: '|', data: '|' }, { label: '~', data: '~' }, { label: '/', data: '/' }, { label: '-', data: '-' }];
const FONT_KEY = 'dsh.terminal.fontSize';

/** Workspace terminal over the official terminal API (create / follow / write / resize / close). */
export default function Terminal() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { client, colors, status } = useApp();
  const dialog = useDialog();
  const [terms, setTerms] = useState<TermInfo[] | null>(null); const [active, setActive] = useState<string>(''); const [error, setError] = useState('');

  useEffect(() => {
    if (!client) return; let active = true;
    client.call<TermInfo[]>('terminal/list', { sessionId }).then(list => { if (!active) return; setTerms(list); setActive(a => (a && list.some(t => t.id === a) ? a : list[0]?.id ?? '')); })
      .catch(e => { if (active) { setError(errorMessage(e)); setTerms([]); } });
    return () => { active = false; };
  }, [client, sessionId]);

  const create = async () => {
    if (!client) return; setError('');
    try { const info = await client.call<TermInfo>('terminal/create', { agentId: sessionId, request: { id: `term-${randomUUID().slice(0, 8)}`, cols: COLS, rows: ROWS } }); setTerms(t => [...(t ?? []), info]); setActive(info.id); }
    catch (e) { setError(errorMessage(e)); }
  };
  const close = async (t: TermInfo) => {
    if (!await dialog.confirm({ title: `Close ${t.title}?`, message: 'This ends the shell process on the Harness. Anything still running in it stops.', confirm: 'Close Terminal', destructive: true, icon: 'terminal-outline' })) return;
    // Optimistic: the Harness takes ~1 s to reap the shell, so drop the tab now and restore it only if the close fails.
    const before = terms;
    setTerms(ts => ts?.filter(x => x.id !== t.id) ?? ts);
    setActive(a => (a === t.id ? before?.find(x => x.id !== t.id)?.id ?? '' : a));
    client?.call('terminal/close', { agentId: sessionId, id: t.id }).catch(e => { setTerms(before); setActive(t.id); setError(`Couldn’t close ${t.title}: ${errorMessage(e)}`); });
  };

  return <Screen>
    <Header title="Terminal" back><IconButton icon="add" size={20} label="New terminal" onPress={() => void create()} disabled={!client || status !== 'connected'} /></Header>
    {terms && terms.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
      {terms.map(t => { const on = t.id === active; return <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setActive(t.id)} onLongPress={() => close(t)} style={{ height: 30, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 4, borderRadius: 15, backgroundColor: on ? colors.fill : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on ? colors.glassEdge : colors.border }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.state === 'running' ? colors.live : colors.tertiary }} />
        <T style="caption1" weight={on ? '600' : '400'}>{t.title}</T>
        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${t.title}`} hitSlop={8} onPress={() => close(t)} style={{ padding: 4 }}><Ionicons name="close" size={12} color={colors.muted} /></Pressable>
      </Pressable>; })}
    </ScrollView> : null}
    <ErrorNotice message={error} />
    {terms === null ? <Loading label="Connecting to terminals…" /> : !terms.length ? <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <Empty icon="terminal-outline" title="No Terminals" detail="Open a shell in this thread’s workspace. It keeps running on the Harness until you close it." />
      <Pressable accessibilityRole="button" onPress={() => void create()} style={({ pressed }) => ({ alignSelf: 'center', height: 44, paddingHorizontal: 20, borderRadius: 22, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.text, opacity: pressed ? 0.7 : 1 })}><Ionicons name="add" size={18} color={colors.bg} /><T style="footnote" weight="600" color={colors.bg}>New Terminal</T></Pressable>
    </View> : active ? <TerminalView key={active} sessionId={sessionId} id={active} onState={info => setTerms(ts => ts?.map(t => t.id === info.id ? { ...t, ...info } : t) ?? ts)} /> : null}
  </Screen>;
}

function TerminalView({ sessionId, id, onState }: { sessionId: string; id: string; onState: (info: TermInfo) => void }) {
  const { client, colors } = useApp();
  const term = useRef<XTermHandle>(null);
  const [attachment] = useState(() => `att-${randomUUID().slice(0, 12)}`);
  const [state, setState] = useState<TermInfo['state']>('running'); const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState(12); const [ctrl, setCtrl] = useState(false);
  const [ready, setReady] = useState(false);
  const pending = useRef<string[]>([]); const snapshot = useRef<string | null>(null); const readyRef = useRef(false);
  const onStateRef = useRef(onState);
  useEffect(() => { onStateRef.current = onState; }, [onState]);
  useEffect(() => { void SecureStore.getItemAsync(FONT_KEY).then(v => { const n = Number(v); if (n >= 8 && n <= 24) { setFontSize(n); term.current?.setFontSize(n); } }).catch(() => {}); }, []);

  useEffect(() => {
    if (!client) return;
    // Output is buffered until xterm reports ready, then flushed in order.
    const out = (fn: (t: XTermHandle) => void, raw: () => void) => { if (term.current && readyRef.current) fn(term.current); else raw(); };
    const stop = client.follow('terminal/follow', { agentId: sessionId, id, attachmentId: attachment }, f => {
      if (f.type === 'snapshot') { setState(f.info?.state ?? 'running'); out(t => t.reset(f.screen ?? ''), () => { snapshot.current = f.screen ?? ''; pending.current = []; }); }
      else if (f.type === 'output') out(t => t.write(f.data ?? ''), () => pending.current.push(f.data ?? ''));
      else if (f.type === 'state') { setState(f.info?.state); onStateRef.current(f.info); }
      else if (f.type === 'stream-error') setError(f.error?.message ?? 'Terminal stream ended.');
    });
    return () => stop();
  }, [client, sessionId, id, attachment]);
  const onReady = () => {
    readyRef.current = true; setReady(true);
    if (snapshot.current !== null) term.current?.reset(snapshot.current);
    for (const d of pending.current) term.current?.write(d);
    snapshot.current = null; pending.current = [];
  };

  // Writes must reach the PTY in order. Each keystroke used to be its own request, and parallel
  // requests can land out of order ("clear" -> "celar"), so queue them: one request in flight,
  // and anything typed meanwhile is batched into the next request.
  const outbox = useRef({ buf: '', busy: false });
  const flush = useCallback(async () => {
    const o = outbox.current; if (o.busy || !o.buf || !client) return;
    o.busy = true;
    try {
      while (o.buf) { const data = o.buf; o.buf = ''; await client.call('terminal/write', { agentId: sessionId, id, attachmentId: attachment, data }); }
    } catch (e) { setError(errorMessage(e)); o.buf = ''; } finally { o.busy = false; }
  }, [client, sessionId, id, attachment]);
  const send = (data: string) => { if (!client || state !== 'running') return; outbox.current.buf += data; void flush(); };
  // With the Ctrl key latched, the next typed letter becomes its control code (Ctrl-A … Ctrl-Z, Ctrl-[ etc.).
  const onInput = (data: string) => {
    if (ctrl && data.length === 1) { const c = data.toUpperCase().charCodeAt(0); setCtrl(false); if (c >= 64 && c <= 95) { send(String.fromCharCode(c - 64)); return; } }
    send(data);
  };
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onResize = (cols: number, rows: number) => { clearTimeout(resizeTimer.current); resizeTimer.current = setTimeout(() => { void client?.call('terminal/resize', { agentId: sessionId, id, attachmentId: attachment, cols, rows }).catch(() => {}); }, 120); };
  const zoom = (d: number) => setFontSize(f => { const n = Math.max(8, Math.min(24, f + d)); term.current?.setFontSize(n); void SecureStore.setItemAsync(FONT_KEY, String(n)).catch(() => {}); return n; });

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 10, paddingBottom: 6 }}>
      <T style="caption2" color="tertiary">{`${fontSize}px`}</T>
      <Mini label="A−" a11y="Smaller text" onPress={() => zoom(-1)} />
      <Mini label="A+" a11y="Larger text" onPress={() => zoom(1)} />
      <Mini label="⌨" a11y="Show keyboard" onPress={() => term.current?.focus()} />
    </View>
    <View style={{ flex: 1, marginHorizontal: 10, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <XTerm ref={term} fontSize={fontSize} dark={colors.dark} onInput={onInput} onResize={onResize} onReady={onReady} />
      {!ready ? <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.dark ? '#0a0a0b' : '#1b1d21' }}><Loading label="Starting terminal…" /></View> : null}
      {state !== 'running' ? <View style={{ padding: 8, backgroundColor: '#00000066' }}><T style="caption1" color="#ffb74d" align="center">Shell {state}. Open a new terminal to continue.</T></View> : null}
    </View>
    <ErrorNotice message={error} />
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 6 }}>
      <KeyBtn label="Ctrl" active={ctrl} onPress={() => setCtrl(v => !v)} />
      {KEYS.map(k => <KeyBtn key={k.label} label={k.label} onPress={() => send(k.data)} />)}
    </ScrollView>
  </KeyboardAvoidingView>;
}

function KeyBtn({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Send ${label}`} accessibilityState={{ selected: !!active }} onPress={onPress} style={({ pressed }) => ({ height: 32, minWidth: 42, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.primary : colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.5 : 1 })}><Text style={{ color: active ? colors.bg : colors.text, fontFamily: MONO, fontSize: 12 }}>{label}</Text></Pressable>;
}
function Mini({ label, a11y, onPress }: { label: string; a11y: string; onPress: () => void }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} onPress={onPress} style={({ pressed }) => ({ height: 28, minWidth: 34, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.5 : 1 })}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{label}</Text></Pressable>;
}
