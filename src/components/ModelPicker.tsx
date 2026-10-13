import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useApp } from '../state/app';
import { errorMessage } from '../lib/harness';
import { ErrorNotice, Row, SearchField, Section } from './ui';
import { Sheet } from './Sheet';

/** Model selection sheet: searchable, grouped by provider, current model checked (HIG lists + sheets). */
export function ModelPicker({ sessionId, visible, onClose, onSelected, current }: { sessionId: string; visible: boolean; onClose: () => void; onSelected: (label: string) => void; current?: string }) {
  const { client, colors, refresh } = useApp(); const [catalog, setCatalog] = useState<any>(null); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!visible || !client) return; let active = true; void client.call('session/modelCatalog', {}).then(c => { if (active) setCatalog(c); }).catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [client, visible]);
  const groups = useMemo(() => (catalog?.groups ?? catalog?.providers ?? []).map((g: any) => ({ ...g, models: (g.models ?? []).filter((m: any) => `${m.name ?? ''} ${m.id}`.toLowerCase().includes(query.toLowerCase())) })).filter((g: any) => g.models.length), [catalog, query]);
  const select = async (provider: string, model: any) => { if (!client) return; setBusy(true); try { await client.request('session/selectModel', { sessionId, provider, model: model.id }); await refresh(); onSelected(model.name ?? model.id); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Sheet visible={visible} onClose={onClose} title="Model">
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search Models" /></View>
    <ErrorNotice message={error} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 22 }}>
      {!catalog && !error ? <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} /> : null}
      {catalog && !groups.length ? <Pressable onPress={() => setQuery('')}><Row title="No Models Found" subtitle="Clear the search to see all models." /></Pressable> : null}
      {groups.map((group: any) => <Section key={group.id} header={group.name ?? group.id}>
        {group.models.map((model: any) => { const label = model.name ?? model.id; return <Row key={model.id} title={label} subtitle={model.name && model.name !== model.id ? model.id : undefined} selected={current === label || current === model.id} chevron={false} onPress={busy ? undefined : () => void select(group.id, model)} />; })}
      </Section>)}
    </ScrollView>
  </Sheet>;
}
