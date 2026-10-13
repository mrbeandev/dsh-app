import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { cacheEpoch, readHistory, writeHistory, type CachedHistory } from '../../lib/cache';
import { randomUUID } from 'expo-crypto';
import { useApp } from '../../state/app';
import { Empty, ErrorNotice, Header, IconButton, Label, Screen } from '../../components/ui';
import { Disclosure } from '../../components/Disclosure';
import { ChatComposer } from '../../components/ChatComposer';
import { PendingRequest } from '../../components/PendingRequest';
import { errorMessage } from '../../lib/harness';
import { Frame, projectEvent, sessionTitle, WireEvent } from '../../lib/protocol';
import { expandStream, streamText } from '../../lib/stream';
export default function Thread() {
  const { id, harness } = useLocalSearchParams<{ id: string; harness?: string }>(); const { client, colors, sessions, savedUrl, pending, refresh, status } = useApp();
  const harnessUrl = harness ?? client?.connection.url ?? savedUrl;
  const [, setHistoryState] = useState('cached');
  const history = useRef<CachedHistory>({ records: [], cursor: -1, hasMore: false, savedAt: 0 });
  const atBottom = useRef(true); const userScrolled = useRef(false); const [jumpVisible, setJumpVisible] = useState(false);
  const [records, setRecords] = useState<WireEvent[]>([]); const [live, setLive] = useState(''); const [draft, setDraft] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [running, setRunning] = useState(false); const [cursor, setCursor] = useState(-1); const [hasMore, setHasMore] = useState(false);
  const list = useRef<FlatList>(null); const liveChunks = useRef<Map<number, Frame>>(new Map());
  const attempt = useRef<{ id: string; next: number; valid: boolean }>({ id: '', next: 0, valid: false });
  const session = sessions.find(x => x.sessionId === id);
  useFocusEffect(useCallback(() => {
    let active = true; let receivedLive = false;
    const epoch = cacheEpoch(harnessUrl);
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { void writeHistory(harnessUrl, id, { ...history.current, savedAt: Date.now() }, epoch).catch(() => {}); }, 400); };
    void readHistory(harnessUrl, id).then(cached => { if (active && !receivedLive && cached) { history.current = cached; setRecords(cached.records); setCursor(cached.cursor); setHasMore(cached.hasMore); setHistoryState('cached'); } }).catch(() => {});
    liveChunks.current.clear();
    if (!client || client.connection.url !== harnessUrl) return () => { active = false; };
    const stop = client.follow('session/follow', { request: { address: { kind: 'session', sessionId: id }, maxMessages: 60, assistantStream: true } }, frame => {
      if (frame.type === 'stream-error') { setError(frame.error.message); return; }
      if (frame.type === 'snapshot') {
        receivedLive = true; setHistoryState('live');
        history.current = { records: (frame.records ?? []).filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event), cursor: frame.cursor, hasMore: frame.hasMore, savedAt: Date.now() }; save();
        setRecords((frame.records ?? []).filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event)); setCursor(frame.cursor); setHasMore(frame.hasMore); liveChunks.current.clear(); setLive('');
        const active = frame.assistantStream?.activeAttempt;
        const chunks = expandStream(active?.stream);
        attempt.current = { id: active?.attemptId ?? '', next: active?.nextIndex ?? 0, valid: !!active && chunks.length === active.nextIndex };
        for (let i = 0; i < chunks.length; i++) liveChunks.current.set(i, chunks[i]);
        setLive(streamText([...liveChunks.current.values()]));
      }
      if (frame.type === 'event') {
        const event = frame.event as WireEvent;
        if (!history.current.records.some(x => x.seq === event.seq)) history.current.records = [...history.current.records, event]; save();
        setRecords(p => p.some(x => x.seq === event.seq) ? p : [...p, event]);
        if (event.type === 'turn/start') setRunning(true);
        if (event.type === 'turn/end') { setRunning(false); void refresh().catch(() => {}); }
        if (['assistant/message', 'assistant/attempt'].includes(event.type)) { setLive(''); liveChunks.current.clear(); }
      }
      if (frame.type === 'assistant-stream') {
        const f = frame.frame;
        if (f.type === 'start') { attempt.current = { id: f.attemptId, next: 0, valid: true }; liveChunks.current.clear(); setLive(''); }
        if (f.type === 'chunk' && attempt.current.valid) {
          if (f.attemptId !== attempt.current.id || f.index !== attempt.current.next) { attempt.current.valid = false; liveChunks.current.clear(); setLive(''); return; }
          attempt.current.next++; liveChunks.current.set(f.index, f.chunk); setLive(streamText([...liveChunks.current.values()]));
        }
        if (f.type === 'end' && f.outcome?.kind === 'abandoned') { attempt.current.valid = false; liveChunks.current.clear(); setLive(''); }
      }
    });
    return () => { active = false; stop(); clearTimeout(saveTimer); if (receivedLive) void writeHistory(harnessUrl, id, { ...history.current, savedAt: Date.now() }, epoch).catch(() => {}); };
  }, [client, id, harnessUrl, refresh]));
  const rows = useMemo(() => records.map(projectEvent).filter(x => x !== null && x.kind !== 'event'), [records]);
  const send = async () => {
    if (!client || !draft.trim() || busy) return; setBusy(true); setError(''); const content = draft.trim();
    try {
      // Commands have a separate strict write path; unregistered slash names remain prompts (skills).
      const name = content.match(/^\/(\S+)/)?.[1];
      const commands = name ? await client.call('commands/list', { agentId: id }) : null;
      const catalog = Array.isArray(commands) ? commands : commands?.commands ?? [];
      if (name && catalog.some((c: any) => c.name === name || c.id === name || c.name === `/${name}`)) await client.call('commands/execute', { agentId: id, line: content, submittedAttachments: [] });
      else await client.request('session/prompt', { requestId: randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: content }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setDraft(''); setRunning(true); atBottom.current = true; setJumpVisible(false); requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const older = async () => { if (!client || !records.length) return; try { const page = await client.request('session/page', { address: { kind: 'session', sessionId: id }, throughSeq: cursor, beforeSeq: records[0].seq, maxMessages: 60 }); atBottom.current = false; const merged = new Map(history.current.records.map(e => [e.seq, e])); for (const r of page.records) if (r.type === 'event') merged.set(r.event.seq, r.event); history.current = { ...history.current, records: [...merged.values()].sort((a, b) => a.seq - b.seq), hasMore: page.hasMore, savedAt: Date.now() }; setRecords(history.current.records); setHasMore(page.hasMore); await writeHistory(harnessUrl, id, history.current); } catch (e) { setError(errorMessage(e)); } };
  return <Screen><Header compact title={session ? sessionTitle(session) : 'Thread'} back><IconButton icon="ellipsis-horizontal" label="Thread details" onPress={() => router.push({ pathname: '/thread/details', params: { id } })} /></Header><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><FlatList ref={list} onScrollBeginDrag={() => { userScrolled.current = true; }} onContentSizeChange={() => { if (atBottom.current) list.current?.scrollToEnd({ animated: false }); }} onScroll={e => { if (!userScrolled.current) return; const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent; atBottom.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 100; setJumpVisible(!atBottom.current); }} scrollEventThrottle={100} data={rows} keyExtractor={x => x.id} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 16, flexGrow: 1 }} ListHeaderComponent={hasMore ? <Pressable onPress={() => void older()} style={{ alignItems: 'center', padding: 8 }}><Label muted size={13}>Load earlier messages</Label></Pressable> : null} ListEmptyComponent={<Empty title="Let’s build something" detail="Describe a task, ask a question, or pick up an idea. Your Harness takes care of the rest." />} renderItem={({ item }) => item.kind === 'tool' || item.kind === 'event' ? <Disclosure title={item.label ?? 'Activity'} text={item.text} /> : <View style={item.kind === 'user' ? { alignSelf: 'flex-end', maxWidth: '92%', padding: 15, backgroundColor: colors.bubble, borderRadius: 20 } : { gap: 9 }}><Label muted size={11}>{item.kind === 'user' ? 'You' : 'Assistant'}</Label><Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 25 }}>{item.text}</Text></View>} ListFooterComponent={<View style={{ gap: 16 }}>{live ? <View style={{ gap: 8 }}><Label muted size={11}>Assistant · working</Label><Text selectable style={{ color: colors.text, fontSize: 16, lineHeight: 25 }}>{live}</Text></View> : null}{pending.filter(p => p.agentId === id).map(p => <PendingRequest key={`${p.clientId}:${p.eventId}`} frame={p} />)}</View>} />{jumpVisible && <Pressable accessibilityRole="button" onPress={() => { atBottom.current = true; setJumpVisible(false); list.current?.scrollToEnd({ animated: true }); }} style={{ alignSelf: 'center', padding: 10, borderRadius: 20, backgroundColor: colors.grouped }}><Label size={13}>↓ Latest messages</Label></Pressable>}<ErrorNotice message={error} /><ChatComposer sessionId={id} draft={draft} onChange={setDraft} onSend={() => void send()} running={running || !!session?.running} busy={busy} disabled={!client || status !== 'connected'} onStop={() => { void client?.request('session/cancel', { sessionId: id }).then(() => setRunning(false)).catch(e => setError(errorMessage(e))); }} /></KeyboardAvoidingView></Screen>;
}
