import { useEffect, useMemo, useState } from 'react';
import { useModelName } from '../../lib/modelNames';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/app';
import { Button, ErrorNotice, Field, Header, Row, Screen, Section, T, s } from '../../components/ui';
import { ModelPicker } from '../../components/ModelPicker';
import { Skeleton } from '../../components/Loader';
import { errorMessage } from '../../lib/harness';
import { sessionTitle } from '../../lib/protocol';
import { coverage, storeStats } from '../../lib/eventStore';
import { compact, contextUsage, duration, grouped, sessionStats, tokenUsage } from '../../lib/sessionStats';

type Values = Record<string, any>;
type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Readable labels for the raw event types counted in the local journal summary. */
const EVENT_GROUPS: { label: string; match: (t: string) => boolean }[] = [
  { label: 'Your messages', match: t => t === 'user/message' || t === 'message/user' },
  { label: 'Assistant replies', match: t => t === 'assistant/message' },
  { label: 'Tool calls', match: t => t === 'tool/call' },
  { label: 'Tool results', match: t => t === 'tool/result' },
  { label: 'Approvals', match: t => t.startsWith('approval/') },
  { label: 'Compactions', match: t => t === 'compaction/end' },
  { label: 'Turns', match: t => t === 'turn/start' },
];
type JournalSummary = { total: number; first: number; last: number; counts: { label: string; count: number }[]; other: number; savedAt?: number; bytes: number; complete?: boolean };

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { client, sessions, refresh, savedUrl, colors } = useApp();
  const session = sessions.find(x => x.sessionId === id);
  const [title, setTitle] = useState(session ? sessionTitle(session) : ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [picker, setPicker] = useState(false);
  // Live projections (fresh numbers); fall back to whatever the cached session list carried.
  const [live, setLive] = useState<Values | null>(null);
  const values: Values = live ?? (session?.projections?.values as Values) ?? {};
  const loading = !live && !session?.projections?.values;
  const [journal, setJournal] = useState<JournalSummary | null>(null);

  useEffect(() => {
    if (!client) return; let active = true;
    client.request<{ values: Values }>('session/projections', { sessionId: id }).then(r => { if (active) setLive(r.values ?? {}); }).catch(() => {});
    return () => { active = false; };
  }, [client, id]);
  useEffect(() => {
    let active = true;
    // Summarise the phone's per-event store (SQL counts; no events are loaded into memory).
    const url = client?.connection.url ?? savedUrl;
    void Promise.all([storeStats(url, id), coverage(url, id)]).then(([st, cov]) => {
      if (!active || !st.count) return;
      const count = (match: (t: string) => boolean) => st.types.filter(x => match(x.type)).reduce((n, x) => n + x.n, 0);
      const counts = EVENT_GROUPS.map(g => ({ label: g.label, count: count(g.match) })).filter(c => c.count);
      const matched = counts.reduce((n, c) => n + c.count, 0);
      setJournal({ total: st.count, first: st.first, last: st.last, counts, other: st.count - matched, bytes: st.bytes, complete: !!cov?.complete });
    }).catch(() => {});
    return () => { active = false; };
  }, [client, savedUrl, id]);

  const selection = values.modelSelection;
  const model: string = (selection?.next ?? selection?.lastUsed)?.model ?? '';
  const provider: string = (selection?.next ?? selection?.lastUsed)?.provider ?? '';
  const modelLabel = useModelName(client, model, provider);
  const tokens = useMemo(() => tokenUsage(values.tokenUsage), [values.tokenUsage]);
  const ctx = useMemo(() => contextUsage(values.contextPressure, values.contextBreakdown), [values.contextPressure, values.contextBreakdown]);
  const stats = useMemo(() => sessionStats(values.sessionStats), [values.sessionStats]);
  const save = async () => { if (!client) return; setBusy(true); setError(''); try { await client.request('session/rename', { sessionId: id, title }); await refresh(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };

  const partColor = [colors.tertiary, colors.muted, colors.primary];
  const pendingQuestions = values.userQuestions?.active?.length ?? 0;
  const inboxCount = (values.inbox?.['next-turn']?.length ?? 0) + (values.inbox?.['next-step']?.length ?? 0);
  const todos: { content?: string; status?: string }[] = Array.isArray(values.todos?.items) ? values.todos.items : Array.isArray(values.todos) ? values.todos : [];

  return <Screen><Header title="Session Details" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
    <View style={{ gap: 10 }}><Field label="Title" value={title} onChangeText={setTitle} returnKeyType="done" onSubmitEditing={save} /><Button title="Save Title" secondary loading={busy} disabled={!client || !title.trim()} onPress={save} /></View>

    <Section header="Session">
      <Row icon="sparkles-outline" title="Model" value={modelLabel || 'Default'} subtitle={provider || undefined} onPress={client ? () => setPicker(true) : undefined} />
      {model ? <Row icon="pricetag-outline" title="Model ID" subtitle={provider ? `${provider} / ${model}` : model} chevron={false} copy={provider ? `${provider}/${model}` : model} /> : null}
      {values.agentPreset ? <Row icon="person-circle-outline" title="Persona" value={titleCase(String(values.agentPreset))} chevron={false} /> : null}
      {values.permissions?.currentValue ? <Row icon="shield-checkmark-outline" title="Access" value={titleCase(String(values.permissions.currentValue))} chevron={false} /> : null}
      {session?.cwd ? <Row icon="folder-outline" title="Directory" subtitle={session.cwd} chevron={false} copy={session.cwd} /> : null}
    </Section>

    <Section header="Context" footer="How full the model's context window is, and what fills it.">
      <View style={{ padding: 14, gap: 12 }}>
        {loading ? <StatSkeleton /> : <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <T style="footnote" weight="700" styleOverride={{ fontSize: 14 }}>{`${Math.round(ctx.fraction * 100)}%`}<T style="footnote" color="secondary" styleOverride={{ fontSize: 14 }}> of context used</T></T>
            <T style="footnote" color="secondary" styleOverride={{ fontSize: 14 }}>{`~${compact(ctx.used)} / ${ctx.window ? compact(ctx.window) : '—'}`}</T>
          </View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ctx.fraction * 100) }} style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill, flexDirection: 'row', overflow: 'hidden' }}>
            {ctx.parts.map((p, i) => <View key={p.key} style={{ width: `${ctx.window ? (p.tokens / ctx.window) * 100 : 0}%`, backgroundColor: partColor[i], marginRight: 1 }} />)}
          </View>
          {ctx.parts.map((p, i) => <StatLine key={p.key} label={p.label} value={`~${compact(p.tokens)}`} swatch={partColor[i]} />)}
        </>}
      </View>
    </Section>

    <Section header="Token Usage" footer="All tokens this session has sent and received, including cached input.">
      <View style={{ padding: 14, gap: 10 }}>
        {loading ? <StatSkeleton /> : <>
          <StatLine icon="server-outline" label="Total" value={`${grouped(tokens.total)} tok`} strong />
          <Divider />
          <StatLine label="Cache hit" value={`${Math.round(tokens.cacheHit * 100)}%`} />
          <StatLine label="Uncached input" value={`${grouped(tokens.uncached)} tok`} />
          <StatLine label="Cached input" value={`${grouped(tokens.cached)} tok`} />
          <StatLine label="Output" value={`${grouped(tokens.output)} tok`} />
        </>}
      </View>
    </Section>

    <Section header="Session Statistics">
      <View style={{ padding: 14, gap: 10 }}>
        {loading ? <StatSkeleton /> : <>
          <StatLine icon="speedometer-outline" label={`${stats.turns} turns · ${stats.steps} steps`} value={stats.tokensPerSecond ? `${Math.round(stats.tokensPerSecond)} tok/s` : '—'} strong />
          <Divider />
          <StatLine label="LLM time" value={duration(stats.llmMs)} />
          <StatLine label="Tool time" value={duration(stats.toolMs)} />
          <StatLine label="Avg time to first token (TTFT)" value={stats.avgTtftMs ? duration(stats.avgTtftMs) : '—'} />
          <StatLine label="Tokens per second (TPS)" value={stats.tokensPerSecond ? `${Math.round(stats.tokensPerSecond)} tok/s` : '—'} />
        </>}
      </View>
    </Section>

    {todos.length || pendingQuestions || inboxCount || values.goal?.goal || values.plan?.active ? <Section header="Activity">
      {values.goal?.goal ? <Row icon="flag-outline" title={`Goal · ${titleCase(String(values.goal.goal.phase ?? ''))}`} subtitle={String(values.goal.goal.objective ?? '')} chevron={false} copy={String(values.goal.goal.objective ?? '')} /> : null}
      {values.plan?.active ? <Row icon="map-outline" title="Plan mode" value={values.plan.pending ? 'Awaiting approval' : 'On'} chevron={false} /> : null}
      {pendingQuestions ? <Row icon="help-circle-outline" title="Open questions" value={String(pendingQuestions)} chevron={false} /> : null}
      {inboxCount ? <Row icon="mail-unread-outline" title="Queued messages" value={String(inboxCount)} chevron={false} /> : null}
      {todos.length ? <Row icon="checkbox-outline" title="To-dos" value={`${todos.filter(t => t.status === 'completed').length}/${todos.length} done`} chevron={false} /> : null}
    </Section> : null}

    <Section header="Diagnostics" footer="What this device has cached for the session. Chats sync from the Harness when opened.">
      {journal ? <>
        <Row icon="albums-outline" title="Cached events" value={grouped(journal.total)} subtitle={journal.total ? `Event #${journal.first} – #${journal.last}${journal.other ? ` · ${journal.other} bookkeeping` : ''}` : undefined} chevron={false} />
        {journal.counts.map(c => <Row key={c.label} title={c.label} value={grouped(c.count)} chevron={false} />)}
        <Row icon="archive-outline" title="Stored on this phone" value={`${compact(journal.bytes)}B`} subtitle={journal.complete ? 'Whole conversation' : 'Older history still downloading'} chevron={false} />
      </> : <Row icon="albums-outline" title="Cached events" value="None yet" subtitle="Open the session to cache it on this device." chevron={false} />}
      <Row icon="finger-print-outline" title="Session ID" subtitle={id} chevron={false} copy={id} />
      {client ? <Row icon="link-outline" title="Harness" subtitle={client.connection.url} chevron={false} copy={client.connection.url} /> : null}
    </Section>
    <ErrorNotice message={error} />
  </ScrollView><ModelPicker sessionId={id} visible={picker} onClose={() => setPicker(false)} onSelected={() => {}} current={{ provider, model }} /></Screen>;
}

function StatLine({ label, value, strong, swatch, icon }: { label: string; value: string; strong?: boolean; swatch?: string; icon?: IconName }) {
  const { colors } = useApp();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 22 }}>
    {swatch ? <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: swatch }} /> : null}
    {icon ? <Ionicons name={icon} size={16} color={colors.text} /> : null}
    <View style={{ flex: 1 }}><T style="footnote" color={strong ? 'primary' : 'secondary'} weight={strong ? '600' : '400'} styleOverride={{ fontSize: 14 }}>{label}</T></View>
    <T style="footnote" weight={strong ? '600' : '500'} styleOverride={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>{value}</T>
  </View>;
}
function Divider() { const { colors } = useApp(); return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />; }
function StatSkeleton() { return <View style={{ gap: 10 }}>{[70, 55, 62, 48].map((w, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Skeleton width={`${w}%`} height={11} /><Skeleton width="18%" height={11} /></View>)}</View>; }
function titleCase(v: string) { return v.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
/** Cheap size estimate without serialising the whole journal on the UI session. */
