import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Glass, GlassTarget, GlassTargetProvider } from '../../components/Glass';
import { Dots, SkeletonChat } from '../../components/Loader';
import { useActionMenu } from '../../components/ActionMenu';
import { ComposerContext } from '../../components/ComposerContext';
import { useDialog } from '../../components/Dialog';
import { rewindTo, setPendingDraft, takePendingDraft } from '../../lib/rewind';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { cacheEpoch, readHistory, writeHistory, type CachedHistory } from '../../lib/cache';
import { randomUUID } from 'expo-crypto';
import { useApp } from '../../state/app';
import { Empty, ErrorNotice, Header, IconButton, ScrollEdge, Screen, T } from '../../components/ui';
import { ChatRow } from '../../components/ChatRows';
import { ChatComposer } from '../../components/ChatComposer';
import { MessageMarkdown } from '../../components/MessageMarkdown';
import { PendingRequest } from '../../components/PendingRequest';
import { PlanReview, planReviewOf } from '../../components/PlanReview';
import { PromptIndex } from '../../components/PromptIndex';
import { outlineOf, seedTimes, type OutlineEntry } from '../../lib/promptIndex';
import { usePinch } from '../../lib/usePinch';
import { historyAddress, stableAddress, subagentLabel } from '../../lib/subagents';
import { useNotifications } from '../../state/notifications';
import { ChatScrollContext } from '../../components/chatScroll';
import { GestureDetector } from 'react-native-gesture-handler';
import { errorMessage } from '../../lib/harness';
import { Frame, buildTranscript, foldTurns, sessionTitle, WireEvent } from '../../lib/protocol';
import { expandStream, streamText } from '../../lib/stream';
export default function Thread() {
  const { id, harness } = useLocalSearchParams<{ id: string; harness?: string }>(); const { client, colors, sessions, savedUrl, pending, refresh, status } = useApp();
  const harnessUrl = harness ?? client?.connection.url ?? savedUrl;
  // 'loading' until either the local cache or the live snapshot answers; the skeleton shows meanwhile.
  const [historyState, setHistoryState] = useState<'loading' | 'cached' | 'live'>('loading');
  const history = useRef<CachedHistory>({ records: [], cursor: -1, hasMore: false, savedAt: 0 });
  const scrollY = useRef(0);
  const chatScroll = useMemo(() => ({ offset: () => scrollY.current, scrollTo: (y: number) => { scrollY.current = y; list.current?.scrollToOffset({ offset: y, animated: false }); } }), []);
  const atBottom = useRef(true); const userScrolled = useRef(false); const [jumpVisible, setJumpVisible] = useState(false);
  const [records, setRecords] = useState<WireEvent[]>([]); const [live, setLive] = useState(''); const [draft, setDraft] = useState(() => takePendingDraft(id) ?? '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [running, setRunning] = useState(false); const [cursor, setCursor] = useState(-1); const [hasMore, setHasMore] = useState(false);
  const list = useRef<FlatList>(null); const target = useRef<View>(null); const liveChunks = useRef<Map<number, Frame>>(new Map());
  const attempt = useRef<{ id: string; next: number; valid: boolean }>({ id: '', next: 0, valid: false });
  const session = sessions.find(x => x.sessionId === id);
  const notify = useNotifications();
  useEffect(() => { notify.setViewing(id); return () => notify.setViewing(undefined); }, [notify, id]);
  // Subagent threads need the subagent address form; a plain session address is refused for them.
  const parentSession = session?.parentSessionId ? sessions.find(x => x.sessionId === session.parentSessionId) : undefined;
  // Derived subagent info, computed inside one memo so the compiler knows `session` isn't mutated.
  const sub = useMemo(() => ({
    address: stableAddress(historyAddress(session, id, parentSession)),
    label: session?.origin === 'subagent' ? subagentLabel(session, parentSession) : '',
  }), [session, id, parentSession]);
  const address = sub.address;
  const isSubagent = session?.origin === 'subagent';
  const readOnly = isSubagent && address.kind === 'subagent' && address.mode === 'one-shot';
  const [fade] = useState(() => new Animated.Value(0));
  const shown = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true; let receivedLive = false;
    const epoch = cacheEpoch(harnessUrl);
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { void writeHistory(harnessUrl, id, { ...history.current, savedAt: Date.now() }, epoch).catch(() => {}); }, 400); };
    void readHistory(harnessUrl, id).then(cached => { if (active && !receivedLive && cached) { history.current = cached; setRecords(cached.records); setCursor(cached.cursor); setHasMore(cached.hasMore); setHistoryState('cached'); } else if (active && !receivedLive && (!client || client.connection.url !== harnessUrl)) setHistoryState('cached'); }).catch(() => { if (active && !receivedLive) setHistoryState('cached'); });
    liveChunks.current.clear();
    if (!client || client.connection.url !== harnessUrl) return () => { active = false; };
    const stop = client.follow('session/follow', { request: { address, maxMessages: 24, assistantStream: true } }, frame => {
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
  }, [client, id, harnessUrl, refresh, address]));
  const rows = useMemo(() => foldTurns(records, buildTranscript(records)), [records]);
  // Inverted list: index 0 renders at the bottom, so the chat opens on the latest message with no scroll jump.
  const data = useMemo(() => [...rows].reverse(), [rows]);
  // Scroll ownership (like the DSH web chat): follow the tail unless the reader has scrolled away.
  // Sending a message or any new agent activity re-pins to the very bottom.
  const scrollToBottom = useCallback((animated = true) => {
    atBottom.current = true; userScrolled.current = false; setJumpVisible(false);
    list.current?.scrollToOffset({ offset: 0, animated });
  }, []);
  const lastRow = rows[rows.length - 1];
  const activity = `${rows.length}:${lastRow?.id}:${lastRow?.kind === 'tool' ? (lastRow.pending ? 0 : 1) : ''}:${live.length > 0 ? 1 : 0}:${pending.length}`;
  const lastActivity = useRef('');
  useEffect(() => {
    if (lastActivity.current === activity) return;
    const first = lastActivity.current === ''; lastActivity.current = activity;
    // An inverted list already sits at the bottom on first render; only follow later activity.
    if (!first && atBottom.current) scrollToBottom(true);
  }, [activity, scrollToBottom]);
  const menu = useActionMenu(); const dialog = useDialog();
  // App-native rewind (see lib/rewind.ts): fork before the chosen message, archive the old thread, refill the composer.
  const messageMenu = useCallback((row: { id: string; text: string }) => {
    const seq = Number(row.id);
    menu({ title: 'Your message', subtitle: row.text.length > 90 ? `${row.text.slice(0, 90)}…` : row.text, actions: [
      { label: 'Rewind to Here', icon: 'arrow-undo-outline', detail: 'Remove this message and everything after it, then edit and resend', onPress: () => { void (async () => {
        const ok = await dialog.confirm({ title: 'Rewind to this message?', message: 'This message and everything after it are removed from the conversation, and the message goes back into the composer to edit and resend.\n\nThe old thread is archived on the Harness, not deleted. Files the agent changed are not restored.', confirm: 'Rewind', destructive: true, icon: 'arrow-undo-outline' });
        if (!ok || !client) return;
        try {
          const r = await rewindTo(client, { sessionId: id, targetSeq: seq, text: row.text, title: session ? sessionTitle(session) : undefined, running: running || !!session?.running, records });
          setPendingDraft(r.sessionId, r.draft); await refresh();
          router.replace({ pathname: '/thread/[id]', params: { id: r.sessionId, harness: harnessUrl } });
        } catch (e) { await dialog.alert('Couldn’t Rewind', errorMessage(e), 'danger'); }
      })(); } },
      { label: 'Copy Text', icon: 'copy-outline', onPress: () => { void Clipboard.setStringAsync(row.text); } },
    ] });
  }, [menu, dialog, client, id, session, running, refresh, harnessUrl, records]);
  const send = async () => {
    if (!client || !draft.trim() || busy) return; setBusy(true); setError(''); const content = draft.trim();
    try {
      // Commands have a separate strict write path; unregistered slash names remain prompts (skills).
      const name = content.match(/^\/(\S+)/)?.[1];
      const commands = name ? await client.call('commands/list', { agentId: id }) : null;
      const catalog = Array.isArray(commands) ? commands : commands?.commands ?? [];
      if (name && catalog.some((c: any) => c.name === name || c.id === name || c.name === `/${name}`)) await client.call('commands/execute', { agentId: id, line: content, submittedAttachments: [] });
      else await client.request('session/prompt', { requestId: randomUUID(), sessionId: id, mode: 'queue', content: [{ type: 'text', text: content }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setDraft(''); setRunning(true); scrollToBottom();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const loadingOlder = useRef(false); const [olderBusy, setOlderBusy] = useState(false);
  const older = async () => { if (!client || !records.length || loadingOlder.current) return; loadingOlder.current = true; setOlderBusy(true); try { const page = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: records[0].seq, maxMessages: 30 }); const merged = new Map(history.current.records.map(e => [e.seq, e])); for (const r of page.records) if (r.type === 'event') merged.set(r.event.seq, r.event); history.current = { ...history.current, records: [...merged.values()].sort((a, b) => a.seq - b.seq), hasMore: page.hasMore, savedAt: Date.now() }; setRecords(history.current.records); setHasMore(page.hasMore); await writeHistory(harnessUrl, id, history.current); } catch (e) { setError(errorMessage(e)); } finally { loadingOlder.current = false; setOlderBusy(false); } };
  // Pinch-to-browse prompts (turnOutline) and jump-to-turn.
  const [promptsOpen, setPromptsOpen] = useState(false); const [pendingJump, setPendingJump] = useState<number | null>(null);
  const [highlight, setHighlight] = useState('');
  const outline = useMemo(() => outlineOf(session?.projections?.values as Record<string, any> | undefined), [session?.projections?.values]);
  useEffect(() => { seedTimes(id, records); }, [id, records]);
  const hasOutline = outline.length > 0;
  const openPrompts = useCallback(() => { if (hasOutline) setPromptsOpen(true); }, [hasOutline]);
  const closePrompts = useCallback(() => setPromptsOpen(false), []);
  const pinch = usePinch({ onPinchIn: openPrompts, onPinchOut: closePrompts });
  const jumpTo = useCallback(async (entry: OutlineEntry) => {
    // Load history back through the turn's turn/start seq if it is not in memory yet.
    if (client && records.length && records[0].seq > entry.seq) {
      try {
        const page = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: records[0].seq, maxMessages: 200, turnWindow: undefined });
        const merged = new Map(history.current.records.map(e => [e.seq, e]));
        for (const r of page.records) if (r.type === 'event') merged.set(r.event.seq, r.event);
        // Page further back until the turn is covered (bounded).
        let hasOlder = page.hasMore; let guard = 0;
        while (hasOlder && Math.min(...merged.keys()) > entry.seq && guard++ < 20) {
          const next = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: Math.min(...merged.keys()), maxMessages: 200 });
          for (const r of next.records) if (r.type === 'event') merged.set(r.event.seq, r.event);
          hasOlder = next.hasMore;
        }
        history.current = { ...history.current, records: [...merged.values()].sort((a, b) => a.seq - b.seq), hasMore: hasOlder, savedAt: Date.now() };
        setRecords(history.current.records); setHasMore(hasOlder);
        void writeHistory(harnessUrl, id, history.current).catch(() => {});
      } catch (e) { setError(errorMessage(e)); return; }
    }
    setPendingJump(entry.seq);
  }, [client, records, id, cursor, harnessUrl, address]);
  useEffect(() => {
    if (pendingJump === null) return;
    // The turn's prompt row: the oldest user row at/after the turn/start seq (data is newest-first).
    let index = -1;
    for (let i = data.length - 1; i >= 0; i--) if (data[i].kind === 'user' && Number(data[i].id) >= pendingJump) { index = i; break; }
    if (index < 0) return;
    const rowId = data[index].id;
    const t1 = setTimeout(() => {
      setPendingJump(null); atBottom.current = false; userScrolled.current = true; setJumpVisible(true); setHighlight(rowId);
      list.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
    }, 0);
    const t2 = setTimeout(() => setHighlight(''), 1900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pendingJump, data]);
  const working = running || !!session?.running;
  useEffect(() => {
    if (shown.current || !rows.length) return;
    shown.current = true;
    Animated.timing(fade, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [rows.length, fade]);
  const workspace = session?.cwd ? session.cwd.split('/').filter(Boolean).pop() : undefined;
  const subtitle = [workspace, status === 'connected' ? (working ? 'Working…' : undefined) : 'Offline'].filter(Boolean).join(' · ');
  const toLatest = () => scrollToBottom();
  return <Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GlassTarget target={target}>
        <GestureDetector gesture={pinch.pinch}><View style={{ flex: 1 }} collapsable={false}>
        {historyState === 'loading' && !rows.length ? <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 62 }}><SkeletonChat /></View>
        : !rows.length && !working ? <View style={{ flex: 1, justifyContent: 'center', paddingTop: 62 }}><Empty icon="sparkles-outline" title="New Thread" detail="Describe a task or ask a question. Your Harness does the rest." /></View>
        : <Animated.View style={{ flex: 1, opacity: fade }}><ChatScrollContext.Provider value={chatScroll}><GestureDetector gesture={pinch.list}><FlatList ref={list} inverted data={data} keyExtractor={x => x.id}
          // Inverted: the footer renders at the visual bottom (live text, pending requests), the header at the top.
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          initialNumToRender={14} maxToRenderPerBatch={12} windowSize={11} removeClippedSubviews={Platform.OS === 'android'}
          onScrollBeginDrag={() => { userScrolled.current = true; }}
          onScroll={e => { const y = e.nativeEvent.contentOffset.y; scrollY.current = y; if (!userScrolled.current) return; atBottom.current = y < 100; setJumpVisible(y > 300); }} scrollEventThrottle={16}
          onEndReached={() => { if (hasMore) void older(); }} onEndReachedThreshold={0.6}
          onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false }); setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.35, animated: true }), 120); }}
          keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 62 }}
          ListHeaderComponent={<View style={{ gap: 12, marginBottom: 2 }}>{pending.filter(p => p.agentId === id).map(p => (planReviewOf(p) ? <PlanReview key={`${p.clientId}:${p.eventId}`} frame={p} /> : <PendingRequest key={`${p.clientId}:${p.eventId}`} frame={p} />))}{live ? <View style={{ marginTop: 12 }}><View style={{ marginBottom: 4 }}><T style="caption2" color="secondary">Assistant · working</T></View><MessageMarkdown text={live} /></View> : working && status === 'connected' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, marginTop: 12 }}><Dots size="sm" /><T style="footnote" color="secondary">Working…</T></View> : null}</View>}
          ListFooterComponent={hasMore ? <View style={{ alignItems: 'center', paddingVertical: 10 }}>{olderBusy ? <Dots size="sm" /> : <Pressable accessibilityRole="button" onPress={() => void older()} style={({ pressed }) => ({ height: 30, paddingHorizontal: 14, borderRadius: 15, justifyContent: 'center', backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 })}><T style="caption1" color="secondary">Load earlier messages</T></Pressable>}</View> : null}
          renderItem={({ item, index }) => { const above = data[index + 1]; const quiet = (k?: string) => k === 'tool' || k === 'context' || k === 'system'; const gap = !above ? 0 : quiet(item.kind) && quiet(above.kind) ? 2 : 12; return <View style={{ marginTop: gap }}><ChatRow row={item} highlighted={highlight === item.id} onUserAction={client && status === 'connected' ? messageMenu : undefined} /></View>; }} /></GestureDetector></ChatScrollContext.Provider></Animated.View>}
        </View></GestureDetector>
        <ScrollEdge height={56} />
        {jumpVisible ? <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Scroll to latest message" onPress={toLatest} hitSlop={4}><Glass radius={18} interactive style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-down" size={18} color={colors.text} /></Glass></Pressable></View> : null}
      </GlassTarget>
      <ErrorNotice message={error} />
      <GlassTargetProvider value={target}>
        <ComposerContext sessionId={id} values={(session?.projections?.values as Record<string, any>) ?? {}} />
        {readOnly ? <View style={{ marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.fill }}><Ionicons name="git-branch-outline" size={16} color={colors.muted} /><View style={{ flex: 1 }}><T style="caption1" color="secondary">One-shot subagent — it ran once for its parent and can’t take new messages.</T></View></View> : <ChatComposer sessionId={id} draft={draft} onChange={setDraft} onSend={() => void send()} running={working} busy={busy} disabled={!client || status !== 'connected'} onStop={() => { notify.markStoppedByMe(id); void client?.request('session/cancel', { sessionId: id }).then(() => setRunning(false)).catch(e => setError(errorMessage(e))); }}  />}
      </GlassTargetProvider>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <GlassTargetProvider value={target}>
          <Header title={session ? (isSubagent ? sub.label : sessionTitle(session)) : 'Thread'} subtitle={isSubagent ? `Subagent${readOnly ? ' · one-shot' : ''}${subtitle ? ` · ${subtitle}` : ''}` : subtitle || undefined} back>
            {isSubagent && session?.parentSessionId ? <IconButton icon="git-branch-outline" size={18} label="Open parent thread" onPress={() => router.push({ pathname: '/thread/[id]', params: { id: session.parentSessionId!, harness: harnessUrl } })} /> : null}
            {outline.length ? <IconButton icon="list-outline" size={18} label="Prompts" onPress={() => setPromptsOpen(true)} /> : null}
            <IconButton icon="folder-open-outline" size={18} label="Files" onPress={() => router.push({ pathname: '/files', params: { sessionId: id, root: session?.cwd } })} />
            <IconButton icon="terminal-outline" size={18} label="Terminal" onPress={() => router.push({ pathname: '/terminal', params: { sessionId: id } })} />
            <IconButton icon="ellipsis-horizontal" size={18} label="Thread details" onPress={() => router.push({ pathname: '/thread/details', params: { id } })} />
          </Header>
        </GlassTargetProvider>
      </View>
    </KeyboardAvoidingView>
    <PromptIndex sessionId={id} outline={outline} visible={promptsOpen} onClose={() => setPromptsOpen(false)} onJump={e => void jumpTo(e)} />
  </Screen>;
}
