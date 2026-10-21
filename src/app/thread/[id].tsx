import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, FlatList, Platform, Pressable, View } from 'react-native';
// Frame-by-frame keyboard tracking: the composer follows the keyboard down when it hides, instead of
// staying mid-screen over a blank area until the window finishes resizing.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { Glass, GlassTarget, GlassTargetProvider } from '../../components/Glass';
import { Dots, SkeletonChat } from '../../components/Loader';
import { useActionMenu } from '../../components/ActionMenu';
import { ComposerContext, runQueuedNow, toQueueItem } from '../../components/ComposerContext';
import { useDialog } from '../../components/Dialog';
import { rewindTo, setPendingDraft, takePendingDraft } from '../../lib/rewind';
import { clearDraft, flushDraft, peekDraft, readDraft, saveDraft } from '../../lib/draftStore';
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
import { useUnseen } from '../../state/unseen';
import { ChatScrollContext } from '../../components/chatScroll';
import { SwipeBack } from '../../components/SwipeBack';
import { GestureDetector } from 'react-native-gesture-handler';
import { errorMessage } from '../../lib/harness';
import { Frame, buildTranscript, foldTurns, sessionTitle, WireEvent } from '../../lib/protocol';
import { expandStream, streamText } from '../../lib/stream';
import { liteEvent, sameRecords } from '../../lib/lite';
import { coverage, eventsBetween, putEvents } from '../../lib/eventStore';
import { backfill, markInteraction, turnEvents } from '../../lib/historySync';
import { StepDetailContext } from '../../components/stepDetail';
import { rememberSession } from '../../lib/recentSession';
import { useImports } from '../../lib/useImports';
import { promptWithImports } from '../../lib/imports';
import { diagnostic } from '../../lib/diagnostics';

/** List anchoring (keeps your place as new messages arrive); paused while a row expands. */
const MVCP = { minIndexForVisible: 0, autoscrollToTopThreshold: 80 } as const;
export default function Thread() {
  const { id, harness } = useLocalSearchParams<{ id: string; harness?: string }>(); const { client, colors, sessions, savedUrl, pending, refresh, status, deviceOffline } = useApp();
  const harnessUrl = harness ?? client?.connection.url ?? savedUrl;
  useFocusEffect(useCallback(() => { if (id && harnessUrl) void rememberSession(harnessUrl, id); }, [id, harnessUrl]));
  // Unsent text survives leaving the chat or closing the app; it's cleared only once Send/Steer succeeds.
  // A rewind hands back its prompt first; otherwise the saved draft (already in memory after the first load).
  const [draft, setDraftState] = useState(() => takePendingDraft(id) ?? (harnessUrl && id ? peekDraft(harnessUrl, id) : ''));
  const setDraft = setDraftState;
  // Persist whatever the composer holds (debounced inside saveDraft). Skips the first render so an
  // untouched chat never writes, and an empty draft deletes the saved row.
  const draftTouched = useRef(false);
  useEffect(() => { if (!draftTouched.current) { draftTouched.current = true; return; } if (id && harnessUrl) saveDraft(harnessUrl, id, draft); }, [draft, id, harnessUrl]);
  // First open after a cold start: drafts load from disk asynchronously, so fill in if still empty.
  useEffect(() => { if (!id || !harnessUrl) return; let live = true; void readDraft(harnessUrl, id).then(saved => { if (live && saved) setDraftState(d => d || saved); }); return () => { live = false; }; }, [id, harnessUrl]);
  // Leaving the chat or backgrounding the app writes the latest text straight away.
  useEffect(() => {
    if (!id || !harnessUrl) return;
    const sub = AppState.addEventListener('change', st => { if (st !== 'active') void flushDraft(harnessUrl, id); });
    return () => { sub.remove(); void flushDraft(harnessUrl, id); };
  }, [id, harnessUrl]);
  // 'loading' until either the local cache or the live snapshot answers; the skeleton shows meanwhile.
  const [historyState, setHistoryState] = useState<'loading' | 'cached' | 'live'>('loading');
  // Offline warning only when the Harness is really unreachable; while Live but before the first
  // snapshot lands we're merely syncing, so cached rows get a sync indicator instead.
  const offlineCache = status === 'offline' || status === 'disconnected' || status === 'cached';
  // A failed follow request ends the sync wait so the composer is never stuck disabled.
  const [syncFailed, setSyncFailed] = useState(false);
  // Cached history renders in ~30 ms; the live snapshot follows ~0.5 s later over a tunnel. Only
  // surface "Syncing" if it's genuinely slow, so normal opens show nothing at all.
  const [syncSlow, setSyncSlow] = useState(false);
  const waitingLive = !offlineCache && historyState !== 'live' && !syncFailed;
  const syncingLive = waitingLive && syncSlow;
  const history = useRef<CachedHistory>({ records: [], cursor: -1, hasMore: false, savedAt: 0 });
  const scrollY = useRef(0);
  const [anchorHolds, setAnchorHolds] = useState(0);
  const chatScroll = useMemo(() => ({
    offset: () => scrollY.current,
    scrollTo: (y: number) => { scrollY.current = y; list.current?.scrollToOffset({ offset: y, animated: false }); },
    holdAnchor: (on: boolean) => setAnchorHolds(n => Math.max(0, n + (on ? 1 : -1))),
  }), []);
  const atBottom = useRef(true); const userScrolled = useRef(false); const [jumpVisible, setJumpVisible] = useState(false); const jumpShown = useRef(false);
  const [records, setRecords] = useState<WireEvent[]>([]); const [live, setLive] = useState('');
  const [sending, setSending] = useState<{ key: string; text: string }[]>([]);
  const [error, setError] = useState(''); const [running, setRunning] = useState(false); const [cursor, setCursor] = useState(-1); const [hasMore, setHasMore] = useState(false);
  const list = useRef<FlatList>(null); const target = useRef<View>(null); const liveChunks = useRef<Map<number, Frame>>(new Map());
  const attempt = useRef<{ id: string; next: number; valid: boolean }>({ id: '', next: 0, valid: false });
  const { applyProjections } = useApp();
  const session = sessions.find(x => x.sessionId === id);
  const notify = useNotifications();
  const { setViewing: setSeenViewing } = useUnseen();
  useEffect(() => { notify.setViewing(id); setSeenViewing(id); return () => { notify.setViewing(undefined); setSeenViewing(undefined); }; }, [notify, setSeenViewing, id]);
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
    let active = true; let receivedLive = false; let sync = new AbortController();
    const epoch = cacheEpoch(harnessUrl);
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { void writeHistory(harnessUrl, id, { ...history.current, savedAt: Date.now() }, epoch).catch(() => {}); }, 400); };
    const openedAt = Date.now(); diagnostic('chat.open', { phase: 'start' });
    void readHistory(harnessUrl, id).then(cached => { diagnostic('chat.open', { phase: 'cache', durationMs: Date.now() - openedAt, count: cached?.records.length ?? 0 }); if (active && !receivedLive && cached) { cached = { ...cached, records: cached.records.map(liteEvent) }; history.current = cached; setRecords(cached.records); setCursor(cached.cursor); setHasMore(cached.hasMore); setHistoryState('cached'); } else if (active && !receivedLive && (!client || client.connection.url !== harnessUrl)) setHistoryState('cached'); }).catch(() => { if (active && !receivedLive) setHistoryState('cached'); });
    liveChunks.current.clear();
    if (!client || client.connection.url !== harnessUrl) return () => { active = false; };
    const stop = client.follow('session/follow', { request: { address, maxMessages: 24, assistantStream: true } }, frame => {
      if (frame.type === 'stream-error') { setError(frame.error.message); setSyncFailed(true); return; }
      if (frame.type === 'snapshot') {
        receivedLive = true; setHistoryState('live'); setSyncFailed(false); diagnostic('chat.open', { phase: 'snapshot', durationMs: Date.now() - openedAt, count: frame.records?.length ?? 0 });
        // The snapshot carries this thread's current projections (queue/inbox, todos, goal…): apply them
        // so the composer strip is right the moment the chat opens.
        if (frame.projections?.values) applyProjections(id, frame.projections.values);
        const full: WireEvent[] = (frame.records ?? []).filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event);
        // Full bodies go to the phone's event DB; the screen and the quick-open cache keep lite copies.
        void putEvents(harnessUrl, id, full, { reachedStart: !frame.hasMore }, epoch).catch(() => {});
        const lite = full.map(liteEvent);
        history.current = { records: lite, cursor: frame.cursor, hasMore: frame.hasMore, savedAt: Date.now() }; save();
        // Usually identical to the cached copy already on screen: keep the same array so the list doesn't re-render.
        setRecords(prev => sameRecords(prev, lite) ? prev : lite); setCursor(frame.cursor); setHasMore(frame.hasMore);
        // Keep the phone's copy of this chat complete: page older history in quietly.
        sync.abort(); sync = new AbortController();
        if (frame.hasMore) void backfill(client, harnessUrl, id, address, frame.cursor, sync.signal).catch(() => {}); liveChunks.current.clear(); setLive('');
        const active = frame.assistantStream?.activeAttempt;
        const chunks = expandStream(active?.stream);
        attempt.current = { id: active?.attemptId ?? '', next: active?.nextIndex ?? 0, valid: !!active && chunks.length === active.nextIndex };
        for (let i = 0; i < chunks.length; i++) liveChunks.current.set(i, chunks[i]);
        setLive(streamText([...liveChunks.current.values()]));
      }
      if (frame.type === 'event') {
        const full = frame.event as WireEvent;
        void putEvents(harnessUrl, id, [full], {}, epoch).catch(() => {});
        const event = liteEvent(full);
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
    return () => { active = false; sync.abort(); stop(); clearTimeout(saveTimer); if (receivedLive) void writeHistory(harnessUrl, id, { ...history.current, savedAt: Date.now() }, epoch).catch(() => {}); };
  }, [client, id, harnessUrl, refresh, address, applyProjections]));
  const rows = useMemo(() => foldTurns(records, buildTranscript(records)), [records]);
  // Expanding a lite step loads its full events: phone DB first, the Harness once if never stored.
  const steps = useMemo(() => ({ sessionId: id, load: (from: number, to: number) => turnEvents(client, harnessUrl, id, address, cursor, from, to) }), [client, harnessUrl, id, address, cursor]);
  // Inverted list: index 0 renders at the bottom, so the chat opens on the latest message with no scroll jump.
  const data = useMemo(() => [...rows].reverse(), [rows]);
  // syncSlow only turns on from a timer; it's ignored (via waitingLive) once the snapshot lands, and reset on leave.
  // A chat already shown from the phone's cache needs no sync notice; the fresh copy swaps in quietly.
  // Only flag a sync that's genuinely stuck (slow tunnels routinely take 1–3 s).
  const hasCached = rows.length > 0;
  useEffect(() => { if (!waitingLive) return; const t = setTimeout(() => setSyncSlow(true), hasCached ? 6000 : 2000); return () => { clearTimeout(t); setSyncSlow(false); }; }, [waitingLive, hasCached]);
  // Scroll ownership (like the DSH web chat): follow the tail unless the reader has scrolled away.
  // Sending a message or any new agent activity re-pins to the very bottom.
  const scrollToBottom = useCallback((animated = true) => {
    atBottom.current = true; userScrolled.current = false; jumpShown.current = false; setJumpVisible(false);
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
        const ok = await dialog.confirm({ title: 'Rewind to this message?', message: 'This message and everything after it are removed from the conversation, and the message goes back into the composer to edit and resend.\n\nThe old session is archived on the Harness, not deleted. Files the agent changed are not restored.', confirm: 'Rewind', destructive: true, icon: 'arrow-undo-outline' });
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
  // Optimistic send (Web UI parity): the draft clears and a "Sending…" bubble appears immediately; on
  // a slow tunnel the request can take seconds. A failure removes the bubble and restores the draft.
  const imports = useImports(client, id, setError);
  const send = async (mode: 'queue' | 'steer' = 'queue') => {
    if (!client || (!draft.trim() && !imports.items.length)) return;
    if (imports.items.some(i => i.state !== 'ready')) { setError('Wait for attachments to finish or remove failed imports.'); return; }
    diagnostic('prompt.submit', { count: imports.items.length, phase: mode, pending: sending.length });
    const selected = imports.items; const content = draft.trim(); const parts = promptWithImports(content, selected); const key = randomUUID();
    setError(''); setDraft(''); imports.setItems([]); setSending(s => [...s, { key, text: [content, ...selected.map(i => `Attachment: ${i.name}`)].filter(Boolean).join('\n') }]); scrollToBottom();
    try {
      // Commands have a separate strict write path; unregistered slash names remain prompts (skills).
      const name = content.match(/^\/(\S+)/)?.[1];
      const commands = name ? await client.call('commands/list', { agentId: id }) : null;
      const catalog = Array.isArray(commands) ? commands : commands?.commands ?? [];
      if (name && catalog.some((c: any) => c.name === name || c.id === name || c.name === `/${name}`)) await client.call('commands/execute', { agentId: id, line: content, submittedAttachments: parts.filter(p => p.type !== 'text') });
      else await client.request('session/prompt', { requestId: key, sessionId: id, mode, content: parts, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      // Accepted: only now is the saved draft discarded (a failure below restores it instead).
      if (harnessUrl) void clearDraft(harnessUrl, id);
      setRunning(true); scrollToBottom();
      // Keep the bubble until the Harness echoes the message (or a queue row shows it), max 8 s.
      setTimeout(() => setSending(s => s.filter(x => x.key !== key)), 8000);
    } catch (e) {
      setSending(s => s.filter(x => x.key !== key));
      setDraft(d => d.trim() ? d : content);
      imports.setItems(current => [...selected, ...current]);
      setError(errorMessage(e));
    }
  };
  // Drop a Sending… bubble as soon as the Harness has it: the durable user message (or queue row)
  // carries source.rpcId = our request id.
  const projectionValues = session?.projections?.values;
  const echoed = useMemo(() => {
    const ids = new Set<string>();
    for (const e of records) { const src: any = (e.data as any)?.source ?? (e.data as any)?.message?.source; if (src?.rpcId) ids.add(String(src.rpcId)); }
    const inbox = (projectionValues as any)?.inbox;
    for (const m of [...(inbox?.['next-turn'] ?? []), ...(inbox?.['next-step'] ?? [])]) if (m?.source?.rpcId) ids.add(String(m.source.rpcId));
    return ids;
  }, [records, projectionValues]);
  const pendingSends = sending.filter(s => !echoed.has(s.key));
  // Stop = cancel the running turn. The Harness keeps queued messages (session/cancel keeps the inbox)
  // but does not start a turn for them, so they'd sit in the queue. Expected behaviour (user): the
  // next queued message goes in as the next prompt. So after the cancel lands and the agent is idle,
  // send the head of the queue; the Harness runs the rest of the queue after it.
  const resumeQueue = useRef(0); // deadline (ms) while waiting to send the next queued message
  const stopTurn = async () => {
    if (!client) return;
    notify.markStoppedByMe(id);
    try { await client.request('session/cancel', { sessionId: id }); } catch (e) { setError(errorMessage(e)); return; }
    resumeQueue.current = Date.now() + 15000;
  };
  // Once the Harness reports the agent idle (live status), send the head of the queue.
  const liveRunning = !!session?.running;
  const queueHead = (((session?.projections?.values as any)?.inbox?.['next-turn'] ?? []) as any[]).map(toQueueItem).find(Boolean) ?? null;
  useEffect(() => {
    if (!resumeQueue.current || liveRunning || !client) return;
    const live = Date.now() < resumeQueue.current; resumeQueue.current = 0;
    if (!live || !queueHead) return;
    runQueuedNow(client, id, queueHead).then(() => setRunning(true), e => setError(errorMessage(e)));
  }, [liveRunning, client, id, queueHead]);
  const loadingOlder = useRef(false); const [olderBusy, setOlderBusy] = useState(false);
  // Load older messages: from the phone's event DB when it already has them (background backfill),
  // otherwise one page from the Harness (stored in full). The screen only keeps lite copies.
  const older = async () => {
    if (!client || !records.length || loadingOlder.current) return; loadingOlder.current = true; setOlderBusy(true);
    try {
      const before = records[0].seq;
      const cov = await coverage(harnessUrl, id);
      let full: WireEvent[]; let more: boolean;
      if (cov && cov.low < before) {
        full = await eventsBetween(harnessUrl, id, Math.max(cov.low, before - 400), before - 1);
        more = !cov.complete || full[0]?.seq > cov.low;
      } else {
        const page = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: before, maxMessages: 30 });
        full = page.records.filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event);
        more = page.hasMore; void putEvents(harnessUrl, id, full, { reachedStart: !page.hasMore }).catch(() => {});
      }
      const merged = new Map(history.current.records.map(e => [e.seq, e])); for (const e of full) merged.set(e.seq, liteEvent(e));
      history.current = { ...history.current, records: [...merged.values()].sort((x, y) => x.seq - y.seq), hasMore: more, savedAt: Date.now() };
      setRecords(history.current.records); setHasMore(more); await writeHistory(harnessUrl, id, history.current);
    } catch (e) { setError(errorMessage(e)); } finally { loadingOlder.current = false; setOlderBusy(false); }
  };
  // Pinch-to-browse prompts (turnOutline) and jump-to-turn.
  const [promptsOpen, setPromptsOpen] = useState(false); const [pendingJump, setPendingJump] = useState<number | null>(null);
  const [highlight, setHighlight] = useState('');
  const outline = useMemo(() => outlineOf(session?.projections?.values as Record<string, any> | undefined), [session?.projections?.values]);
  useEffect(() => { seedTimes(id, records); }, [id, records]);
  const hasOutline = outline.length > 0;
  const openPrompts = useCallback(() => { if (hasOutline) setPromptsOpen(true); }, [hasOutline, setPromptsOpen]);
  const closePrompts = useCallback(() => setPromptsOpen(false), [setPromptsOpen]);
  const pinch = usePinch({ onPinchIn: openPrompts, onPinchOut: closePrompts });
  const jumpTo = useCallback(async (entry: OutlineEntry) => {
    // Load history back through the turn's turn/start seq if it is not in memory yet.
    if (client && records.length && records[0].seq > entry.seq) {
      try {
        const page = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: records[0].seq, maxMessages: 200, turnWindow: undefined });
        const merged = new Map(history.current.records.map(e => [e.seq, e]));
        for (const r of page.records) if (r.type === 'event') merged.set(r.event.seq, liteEvent(r.event));
        void putEvents(harnessUrl, id, page.records.filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event)).catch(() => {});
        // Page further back until the turn is covered (bounded).
        let hasOlder = page.hasMore; let guard = 0;
        while (hasOlder && Math.min(...merged.keys()) > entry.seq && guard++ < 20) {
          const next = await client.request('session/page', { address, throughSeq: cursor, beforeSeq: Math.min(...merged.keys()), maxMessages: 200 });
          for (const r of next.records) if (r.type === 'event') merged.set(r.event.seq, liteEvent(r.event));
          void putEvents(harnessUrl, id, next.records.filter((r: Frame) => r.type === 'event').map((r: Frame) => r.event), { reachedStart: !next.hasMore }).catch(() => {});
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
      setPendingJump(null); atBottom.current = false; userScrolled.current = true; jumpShown.current = true; setJumpVisible(true); setHighlight(rowId);
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
  const goBack = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/'); }, []);
  return <SwipeBack onBack={goBack} enabled={!promptsOpen}><Screen edges={['top', 'bottom']}>
    <KeyboardAvoidingView onLayout={e => diagnostic('chat.layout', { ...e.nativeEvent.layout })} style={{ flex: 1 }} behavior="padding">
      <GlassTarget target={target}>
        <GestureDetector gesture={pinch.pinch}><View style={{ flex: 1 }} collapsable={false}>
        {historyState === 'loading' && !rows.length ? <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 62 }}><SkeletonChat /></View>
        : !rows.length && !working ? <View style={{ flex: 1, justifyContent: 'center', paddingTop: 62 }}><Empty icon="sparkles-outline" title="New Session" detail="Describe a task or ask a question. Your Harness does the rest." /></View>
        : <Animated.View style={{ flex: 1, opacity: fade }}><ChatScrollContext.Provider value={chatScroll}><StepDetailContext.Provider value={steps}><GestureDetector gesture={pinch.list}><FlatList ref={list} inverted data={data} keyExtractor={x => x.id}
          // Inverted: the footer renders at the visual bottom (live text, pending requests), the header at the top.
          maintainVisibleContentPosition={anchorHolds ? undefined : MVCP}
          initialNumToRender={14} maxToRenderPerBatch={12} windowSize={11} removeClippedSubviews={Platform.OS === 'android'}
          onScrollBeginDrag={() => { userScrolled.current = true; markInteraction(); }} onMomentumScrollEnd={() => markInteraction(400)}
          onScroll={e => { const y = e.nativeEvent.contentOffset.y; scrollY.current = y; markInteraction(600); if (!userScrolled.current) return; atBottom.current = y < 100; const show = y > 300; if (show !== jumpShown.current) { jumpShown.current = show; setJumpVisible(show); } }} scrollEventThrottle={16}
          onEndReached={() => { if (hasMore) void older(); }} onEndReachedThreshold={0.6}
          onScrollToIndexFailed={info => { list.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false }); setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.35, animated: true }), 120); }}
          keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 62 }}
          ListHeaderComponent={<View style={{ gap: 12, marginBottom: 2 }}>{pendingSends.map(s => <View key={s.key} style={{ marginTop: 12, marginLeft: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 17, backgroundColor: colors.bubble, opacity: 0.75 }}><T style="caption2" color="secondary">You · Sending…</T><T style="footnote" numberOfLines={6}>{s.text}</T></View>)}{pending.filter(p => p.agentId === id).map(p => (planReviewOf(p) ? <PlanReview key={`${p.clientId}:${p.eventId}`} frame={p} /> : <PendingRequest key={`${p.clientId}:${p.eventId}`} frame={p} />))}{live ? <View style={{ marginTop: 12 }}><View style={{ marginBottom: 4 }}><T style="caption2" color="secondary">Assistant · working</T></View><MessageMarkdown text={live} /></View> : working && status === 'connected' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, marginTop: 12 }}><Dots size="sm" /><T style="footnote" color="secondary">Working…</T></View> : null}</View>}
          ListFooterComponent={hasMore ? <View style={{ alignItems: 'center', paddingVertical: 10 }}>{olderBusy ? <Dots size="sm" /> : <Pressable accessibilityRole="button" onPress={() => void older()} style={({ pressed }) => ({ height: 30, paddingHorizontal: 14, borderRadius: 15, justifyContent: 'center', backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 })}><T style="caption1" color="secondary">Load earlier messages</T></Pressable>}</View> : null}
          renderItem={({ item, index }) => { const above = data[index + 1]; const quiet = (k?: string) => k === 'tool' || k === 'context' || k === 'system'; const gap = !above ? 0 : quiet(item.kind) && quiet(above.kind) ? 2 : 12; return <View style={{ marginTop: gap }}><ChatRow row={item} highlighted={highlight === item.id} onUserAction={client && status === 'connected' ? messageMenu : undefined} /></View>; }} /></GestureDetector></StepDetailContext.Provider></ChatScrollContext.Provider></Animated.View>}
        </View></GestureDetector>
        <ScrollEdge height={56} />
        {jumpVisible ? <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Scroll to latest message" onPress={toLatest} hitSlop={4}><Glass radius={18} interactive style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-down" size={18} color={colors.text} /></Glass></Pressable></View> : null}
      </GlassTarget>
      <ErrorNotice message={deviceOffline ? '' : error} />
      <GlassTargetProvider value={target}>
        {/* Only when actually disconnected: while Live, cached rows are just the brief warm-up before the fresh history arrives. */}
        {/* Live but the latest history is still in flight: show a sync state, not the offline warning. */}
        {syncingLive ? <View accessibilityRole="progressbar" accessibilityLabel="Syncing latest messages" accessibilityLiveRegion="polite" style={{ marginHorizontal: 12, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.panel, borderWidth: 0.5, borderColor: colors.glassEdge }}><Dots size="sm" /><T style="caption1" color="secondary">Syncing latest messages…</T></View> : null}
        {offlineCache ? <View accessibilityRole="alert" style={{ marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 10, flexDirection: 'row', gap: 8, backgroundColor: colors.panel, borderWidth: 0.5, borderColor: colors.warning }}><Ionicons name="warning-outline" size={18} color={colors.warning} /><View style={{ flex: 1 }}><T style="caption1" weight="600" color={colors.warning}>{deviceOffline ? 'Device offline · Local cache' : 'Showing local cache'}</T><T style="caption1" color="secondary">Connect to your Harness to get the latest chat data.</T></View></View> : null}
        <ComposerContext sessionId={id} running={running} values={(session?.projections?.values as Record<string, any>) ?? {}} />
        {readOnly ? <View style={{ marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.fill }}><Ionicons name="git-branch-outline" size={16} color={colors.muted} /><View style={{ flex: 1 }}><T style="caption1" color="secondary">One-shot subagent — it ran once for its parent and can’t take new messages.</T></View></View> : <ChatComposer sessionId={id} imports={imports.items} onImport={c => void imports.pick(c)} onRemoveImport={imports.remove} onRetryImport={imports.retry} draft={draft} onChange={setDraft} onSend={mode => void send(mode)} running={working} busy={false} disabled={!client || status !== 'connected'} onStop={stopTurn}  />}
      </GlassTargetProvider>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <GlassTargetProvider value={target}>
          <Header title={session ? (isSubagent ? sub.label : sessionTitle(session)) : 'Session'} subtitle={isSubagent ? `Subagent${readOnly ? ' · one-shot' : ''}${subtitle ? ` · ${subtitle}` : ''}` : subtitle || undefined} back>
            {isSubagent && session?.parentSessionId ? <IconButton icon="git-branch-outline" size={18} label="Open parent session" onPress={() => router.push({ pathname: '/thread/[id]', params: { id: session.parentSessionId!, harness: harnessUrl } })} /> : null}
            {outline.length ? <IconButton icon="list-outline" size={18} label="Prompts" onPress={() => setPromptsOpen(true)} /> : null}
            <IconButton icon="folder-open-outline" size={18} label="Files" onPress={() => router.push({ pathname: '/files', params: { sessionId: id, root: session?.cwd } })} />
            <IconButton icon="terminal-outline" size={18} label="Terminal" onPress={() => router.push({ pathname: '/terminal', params: { sessionId: id } })} />
            <IconButton icon="ellipsis-horizontal" size={18} label="Session details" onPress={() => router.push({ pathname: '/thread/details', params: { id } })} />
          </Header>
        </GlassTargetProvider>
      </View>
    </KeyboardAvoidingView>
    <PromptIndex sessionId={id} outline={outline} visible={promptsOpen} onClose={() => setPromptsOpen(false)} onJump={e => void jumpTo(e)} />
  </Screen></SwipeBack>;
}
