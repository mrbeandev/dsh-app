import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../state/app';
import { Empty, ErrorNotice, Header, IconButton, Label, Screen, s } from '../../components/ui';
import { Disclosure } from '../../components/Disclosure';
import { PendingRequest } from '../../components/PendingRequest';
import { errorMessage } from '../../lib/harness';
import { Frame, projectEvent, sessionTitle, WireEvent } from '../../lib/protocol';
import { expandStream, streamText } from '../../lib/stream';
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { client, colors, sessions, pending, refresh } = useApp();
  const [records, setRecords] = useState<WireEvent[]>([]); const [live, setLive] = useState(''); const [draft, setDraft] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [running, setRunning] = useState(false); const [cursor, setCursor] = useState(-1); const [hasMore, setHasMore] = useState(false);
  const list = useRef<FlatList>(null); const liveChunks = useRef<Map<number, Frame>>(new Map());
  const session = sessions.find(x => x.sessionId === id);
  useEffect(() => {
    liveChunks.current.clear();
    if (!client) return;
    return client.follow('session/follow', { request: { address: { kind: 'session', sessionId: id }, maxMessages: 60, assistantStream: true } }, frame => {
      if (frame.type === 'stream-error') { setError(frame.error.message); return; }
      if (frame.type === 'snapshot') {
        setRecords((frame.records ?? []).filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event)); setCursor(frame.cursor); setHasMore(frame.hasMore); liveChunks.current.clear(); setLive('');
        const chunks = expandStream(frame.assistantStream?.activeAttempt?.stream);
        for (let i = 0; i < chunks.length; i++) liveChunks.current.set(i, chunks[i]);
        setLive(streamText([...liveChunks.current.values()]));
      }
      if (frame.type === 'event') {
        const event = frame.event as WireEvent;
        setRecords(p => p.some(x => x.seq === event.seq) ? p : [...p, event]);
        if (event.type === 'turn/start') setRunning(true);
        if (event.type === 'turn/end') { setRunning(false); void refresh().catch(() => {}); }
        if (['assistant/message', 'assistant/attempt'].includes(event.type)) { setLive(''); liveChunks.current.clear(); }
      }
      if (frame.type === 'assistant-stream') {
        const f = frame.frame;
        if (f.type === 'start' || f.type === 'reset') { liveChunks.current.clear(); setLive(''); }
        if (f.type === 'chunk') { liveChunks.current.set(f.index, f.chunk); setLive(streamText([...liveChunks.current.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c))); }
      }
    });
  }, [client, id, refresh]);
  const rows = useMemo(() => records.map(projectEvent).filter(x => x !== null), [records]);
  const send = async () => {
    if (!client || !draft.trim() || busy) return; setBusy(true); setError(''); const content = draft.trim();
    try {
      // Commands have a separate strict write path; unregistered slash names remain prompts (skills).
      const name = content.match(/^\/(\S+)/)?.[1];
      const commands = name ? await client.call('commands/list', { agentId: id }) : null;
      const catalog = Array.isArray(commands) ? commands : commands?.commands ?? [];
      if (name && catalog.some((c: any) => c.name === name || c.id === name || c.name === `/${name}`)) await client.call('commands/execute', { agentId: id, line: content, submittedAttachments: [] });
      else await client.request('session/prompt', { requestId: randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: content }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setDraft(''); setRunning(true);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const older = async () => { if (!client || !records.length) return; try { const page = await client.request('session/page', { address: { kind: 'session', sessionId: id }, throughSeq: cursor, beforeSeq: records[0].seq, maxMessages: 60 }); setRecords(p => [...page.records.filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event), ...p]); setHasMore(page.hasMore); } catch (e) { setError(errorMessage(e)); } };
  return <Screen><Header title={session ? sessionTitle(session) : 'Thread'} back><IconButton icon="ellipsis-horizontal" label="Thread details" onPress={() => router.push({ pathname: '/thread/details', params: { id } })} /></Header><View style={{ paddingHorizontal: 24, paddingBottom: 12 }}><Label muted size={12}>{session?.cwd ?? 'Harness workspace'}</Label></View><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><FlatList ref={list} data={rows} keyExtractor={x => x.id} contentContainerStyle={{ padding: 20, gap: 22, flexGrow: 1 }} ListHeaderComponent={hasMore ? <Pressable onPress={() => void older()} style={{ alignItems: 'center', padding: 8 }}><Label muted size={13}>Load earlier messages</Label></Pressable> : null} ListEmptyComponent={<Empty title="Let’s build something" detail="Describe a task, ask a question, or pick up an idea. Your Harness takes care of the rest." />} renderItem={({ item }) => item.kind === 'tool' || item.kind === 'event' ? <Disclosure title={item.label ?? 'Activity'} text={item.text} /> : <View style={item.kind === 'user' ? { alignSelf: 'flex-end', maxWidth: '92%', padding: 15, backgroundColor: colors.bubble, borderRadius: 20 } : { gap: 9 }}><Label muted size={11}>{item.kind === 'user' ? 'You' : 'Assistant'}</Label><Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 25 }}>{item.text}</Text></View>} ListFooterComponent={<View style={{ gap: 16 }}>{live ? <View style={{ gap: 8 }}><Label muted size={11}>Assistant · working</Label><Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 25 }}>{live}</Text></View> : null}{pending.filter(p => p.agentId === id).map(p => <PendingRequest key={`${p.clientId}:${p.eventId}`} frame={p} />)}</View>} /><ErrorNotice message={error} /><View style={{ padding: 12, paddingTop: 4 }}><View style={{ padding: 13, borderRadius: 23, backgroundColor: colors.grouped, borderWidth: 1, borderColor: colors.border, gap: 12 }}><TextInput accessibilityLabel="Message" value={draft} onChangeText={setDraft} multiline placeholder="Ask anything, or / for commands" placeholderTextColor={colors.muted} style={{ minHeight: 46, maxHeight: 160, color: colors.text, fontSize: 16, lineHeight: 23, textAlignVertical: 'top' }} /><View style={s.row}><Pressable onPress={() => router.push({ pathname: '/thread/details', params: { id } })} style={[s.row, { padding: 5 }]}><Ionicons name="options-outline" size={17} color={colors.muted} /><Label muted size={12}>Thread settings</Label></Pressable><View style={{ flex: 1 }} />{running || session?.running ? <IconButton icon="stop-circle-outline" label="Stop generation" onPress={() => { void client?.request('session/cancel', { sessionId: id }).then(() => setRunning(false)).catch(e => setError(errorMessage(e))); }} /> : null}<Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={busy || !draft.trim() || !client} onPress={() => void send()} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, opacity: busy || !draft.trim() ? .35 : 1 }}><Ionicons name="arrow-up" size={23} color={colors.bg} /></Pressable></View></View></View></KeyboardAvoidingView></Screen>;
}
