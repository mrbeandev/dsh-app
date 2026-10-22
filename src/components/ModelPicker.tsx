import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Loading } from './Loader';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { errorMessage } from '../lib/harness';
import { ErrorNotice, SearchField, T } from './ui';
import { loadCatalog } from '../lib/modelNames';
import { Sheet } from './Sheet';

/** "Choose model" sheet as in the approved prototype (screen 03): caps provider labels, outlined selected row. */
/** The selected row is identified by provider + model id: the same model id (or display name) can be offered by several providers. */
export function isCurrentModel(current: { provider?: string; model?: string } | undefined, providerId: string, model: { id: string; name?: string }) {
  if (!current?.model) return false;
  if (current.model !== model.id && current.model !== model.name) return false;
  // Without a provider (older Harness / not yet known) fall back to the first provider offering that model.
  return !current.provider || current.provider === providerId;
}

export function ModelPicker({ sessionId, visible, onClose, onSelected, current }: { sessionId: string; visible: boolean; onClose: () => void; onSelected: (choice: { provider: string; model: string; label: string }) => void; current?: { provider?: string; model?: string } }) {
  const { client, colors, refresh } = useApp(); const [catalog, setCatalog] = useState<any>(null); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  // Refresh the shared catalog each time the picker opens (new providers/plugins), which also updates names shown elsewhere.
  useEffect(() => { if (!visible || !client) return; let active = true; void loadCatalog(client, true).then(c => { if (!active) return; if (c) setCatalog(c); else setError('Could not load the model list.'); }); return () => { active = false; }; }, [client, visible]);
  const allGroups: any[] = useMemo(() => catalog?.groups ?? catalog?.providers ?? [], [catalog]);
  // Exactly one row is checked, even when several providers list the same model id or name.
  const currentKey = useMemo(() => { for (const g of allGroups) for (const m of g.models ?? []) if (isCurrentModel(current, g.id, m)) return `${g.id}\u0000${m.id}`; return ''; }, [allGroups, current]);
  const groups = useMemo(() => allGroups.map((g: any) => ({ ...g, models: (g.models ?? []).filter((m: any) => `${m.name ?? ''} ${m.id}`.toLowerCase().includes(query.toLowerCase())) })).filter((g: any) => g.models.length), [allGroups, query]);
  const select = async (provider: string, model: any) => { if (!client) return; setBusy(true); try { await client.request('session/selectModel', { sessionId, provider, model: model.id }); await refresh(); onSelected({ provider, model: model.id, label: model.name ?? model.id }); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Sheet visible={visible} onClose={onClose} title="Choose model">
    <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search models" /></View>
    <ErrorNotice message={error} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 }}>
      {!catalog && !error ? <Loading fill={false} size="md" label="Loading models…" /> : null}
      {catalog && !groups.length ? <View style={{ padding: 16 }}><T style="footnote" color="secondary" align="center">No models match your search.</T></View> : null}
      {groups.map((group: any) => <View key={group.id}>
        <View style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 }}><T style="caption2" color="secondary" weight="500" styleOverride={{ letterSpacing: 0.6 }}>{String(group.name ?? group.id).toUpperCase()}</T></View>
        {group.models.map((model: any) => { const label = model.name ?? model.id; const on = currentKey === `${group.id}\u0000${model.id}`; return <Pressable key={`${group.id}/${model.id}`} accessibilityRole="button" accessibilityState={{ selected: on, disabled: busy }} disabled={busy} onPress={() => void select(group.id, model)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on || pressed ? colors.state : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on || pressed ? colors.glassEdge : 'transparent', boxShadow: on || pressed ? `inset 0 1px 0 ${colors.rim}` : undefined })}>
          <View style={{ flex: 1 }}><T style="footnote" numberOfLines={1}>{label}</T>{model.name && model.name !== model.id ? <T style="caption2" color="secondary" numberOfLines={1}>{model.id}</T> : null}</View>
          {on ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
        </Pressable>; })}
      </View>)}
    </ScrollView>
  </Sheet>;
}
