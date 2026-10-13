import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useApp } from '../state/app';
import { Empty, ErrorNotice, Header, IconButton, Screen, T } from '../components/ui';
import { errorMessage } from '../lib/harness';
import { TermBuffer } from '../lib/ansi';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type TermInfo = { id: string; title: string; cwd: string; state: 'running' | 'exited' | 'failed'; exitCode: number | null; shell?: { name: string } };
const COLS = 64, ROWS = 32;
const KEYS: { label: string; data: string }[] = [{ label: 'Ctrl-C', data: '\u0003' }, { label: 'Tab', data: '\t' }, { label: '↑', data: '\u001b[A' }, { label: '↓', data: '\u001b[B' }, { label: 'Esc', data: '\u001b' }, { label: 'Ctrl-D', data: '\u0004' }, { label: 'Ctrl-L', data: '\u000c' }];

/** Workspace terminal over the official terminal API (create / follow / write / resize / close). */
export default function Terminal() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { client, colors, status } = useApp();
  const [terms, setTerms] = useState<TermInfo[] | null>(null); const [active, setActive] = useState<string>(''); const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const load = () => setReload(r => r + 1);
  useEffect(() => {
    if (!client) return; let active = true;
    client.call<TermInfo[]>('terminal/list', { sessionId }).then(list => { if (!active) return; setTerms(list); setActive(a => (a && list.some(t => t.id === a) ? a : list[0]?.id ?? '')); })
      .catch(e => { if (active) { setError(errorMessage(e)); setTerms([]); } });
    return () => { active = false; };
  }, [client, sessionId, reload]);

  const create = async () => {
    if (!client) return; setError('');
    try { const info = await client.call<TermInfo>('terminal/create', { agentId: sessionId, request: { id: `term-${randomUUID().slice(0, 8)}`, cols: COLS, rows: ROWS } }); setTerms(t => [...(t ?? []), info]); setActive(info.id); }
    catch (e) { setError(errorMessage(e)); }
  };
  const close = (t: TermInfo) => Alert.alert(`Close ${t.title}?`, 'This ends the shell process on the Harness.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Close', style: 'destructive', onPress: () => { void client?.call('terminal/close', { agentId: sessionId, id: t.id }).then(load).catch(e => setError(errorMessage(e))); } }]);

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
    {terms === null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.muted} /> : !terms.length ? <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
      <Empty icon="terminal-outline" title="No Terminals" detail="Open a shell in this thread’s workspace. It keeps running on the Harness until you close it." />
      <Pressable accessibilityRole="button" onPress={() => void create()} style={({ pressed }) => ({ alignSelf: 'center', height: 44, paddingHorizontal: 20, borderRadius: 22, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.text, opacity: pressed ? 0.7 : 1 })}><Ionicons name="add" size={18} color={colors.bg} /><T style="footnote" weight="600" color={colors.bg}>New Terminal</T></Pressable>
    </View> : active ? <TerminalView key={active} sessionId={sessionId} id={active} onState={info => setTerms(ts => ts?.map(t => t.id === info.id ? { ...t, ...info } : t) ?? ts)} /> : null}
  </Screen>;
}

function TerminalView({ sessionId, id, onState }: { sessionId: string; id: string; onState: (info: TermInfo) => void }) {
  const { client, colors } = useApp();
  const buffer = useRef(new TermBuffer(3000, COLS)); /* width must match terminal/resize */ const [text, setText] = useState(''); const [line, setLine] = useState('');
  const [attachment] = useState(() => `att-${randomUUID().slice(0, 12)}`);
  const [state, setState] = useState<TermInfo['state']>('running'); const [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);
  const onStateRef = useRef(onState);
  useEffect(() => { onStateRef.current = onState; }, [onState]);

  useEffect(() => {
    if (!client) return;
    let frame = 0;
    const flush = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setText(buffer.current.text())); };
    const stop = client.follow('terminal/follow', { agentId: sessionId, id, attachmentId: attachment }, f => {
      if (f.type === 'snapshot') { buffer.current.reset(f.screen ?? ''); setState(f.info?.state ?? 'running'); flush(); }
      else if (f.type === 'output') { buffer.current.write(f.data ?? ''); flush(); }
      else if (f.type === 'state') { setState(f.info?.state); onStateRef.current(f.info); }
      else if (f.type === 'stream-error') setError(f.error?.message ?? 'Terminal stream ended.');
    });
    void client.call('terminal/resize', { agentId: sessionId, id, attachmentId: attachment, cols: COLS, rows: ROWS }).catch(() => {});
    return () => { cancelAnimationFrame(frame); stop(); };
  }, [client, sessionId, id, attachment]);

  const send = (data: string) => { if (!client || state !== 'running') return; void client.call('terminal/write', { agentId: sessionId, id, attachmentId: attachment, data }).catch(e => setError(errorMessage(e))); };
  const submit = () => { send(`${line}\r`); setLine(''); };

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={{ flex: 1, marginHorizontal: 10, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.dark ? '#0a0a0b' : '#1b1d21', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={{ color: '#e6e6e6', fontFamily: MONO, fontSize: 11, lineHeight: 15 }}>{text || ' '}</Text></ScrollView>
      </ScrollView>
      {state !== 'running' ? <View style={{ padding: 8, backgroundColor: '#00000066' }}><T style="caption1" color="#ffb74d" align="center">Shell {state}. Open a new terminal to continue.</T></View> : null}
    </View>
    <ErrorNotice message={error} />
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, gap: 6 }}>
      {KEYS.map(k => <Pressable key={k.label} accessibilityRole="button" accessibilityLabel={`Send ${k.label}`} onPress={() => send(k.data)} style={({ pressed }) => ({ height: 30, minWidth: 40, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.5 : 1 })}><Text style={{ color: colors.text, fontFamily: MONO, fontSize: 11 }}>{k.label}</Text></Pressable>)}
    </ScrollView>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8 }}>
      <View style={{ flex: 1, height: 42, borderRadius: 21, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 4, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge }}>
        <Text style={{ color: colors.live, fontFamily: MONO, fontSize: 13, marginRight: 6 }}>$</Text>
        <TextInput accessibilityLabel="Terminal command" value={line} onChangeText={setLine} onSubmitEditing={submit} blurOnSubmit={false} returnKeyType="send" autoCapitalize="none" autoCorrect={false} spellCheck={false} placeholder="Type a command" placeholderTextColor={colors.muted} style={{ flex: 1, color: colors.text, fontFamily: MONO, fontSize: 13, paddingVertical: 0 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Run command" onPress={submit} hitSlop={5} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, opacity: pressed ? 0.7 : 1 })}><Ionicons name="return-down-back" size={17} color={colors.bg} /></Pressable>
      </View>
    </View>
  </KeyboardAvoidingView>;
}
