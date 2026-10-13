import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { errorMessage } from '../lib/harness';
import { ErrorNotice, SearchField, T } from './ui';
import { Sheet } from './Sheet';

/** "Choose model" sheet as in the approved prototype (screen 03): caps provider labels, outlined selected row. */
export function ModelPicker({ sessionId, visible, onClose, onSelected, current }: { sessionId: string; visible: boolean; onClose: () => void; onSelected: (label: string) => void; current?: string }) {
  const { client, colors, refresh } = useApp(); const [catalog, setCatalog] = useState<any>(null); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!visible || !client) return; let active = true; void client.call('session/modelCatalog', {}).then(c => { if (active) setCatalog(c); }).catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [client, visible]);
  const groups = useMemo(() => (catalog?.groups ?? catalog?.providers ?? []).map((g: any) => ({ ...g, models: (g.models ?? []).filter((m: any) => `${m.name ?? ''} ${m.id}`.toLowerCase().includes(query.toLowerCase())) })).filter((g: any) => g.models.length), [catalog, query]);
  const select = async (provider: string, model: any) => { if (!client) return; setBusy(true); try { await client.request('session/selectModel', { sessionId, provider, model: model.id }); await refresh(); onSelected(model.name ?? model.id); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Sheet visible={visible} onClose={onClose} title="Choose model">
    <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search models" /></View>
    <ErrorNotice message={error} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 }}>
      {!catalog && !error ? <ActivityIndicator color={colors.muted} style={{ marginTop: 24 }} /> : null}
      {catalog && !groups.length ? <View style={{ padding: 16 }}><T style="footnote" color="secondary" align="center">No models match your search.</T></View> : null}
      {groups.map((group: any) => <View key={group.id}>
        <View style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 }}><T style="caption2" color="secondary" weight="500" styleOverride={{ letterSpacing: 0.6 }}>{String(group.name ?? group.id).toUpperCase()}</T></View>
        {group.models.map((model: any) => { const label = model.name ?? model.id; const on = current === label || current === model.id; return <Pressable key={model.id} accessibilityRole="button" accessibilityState={{ selected: on, disabled: busy }} disabled={busy} onPress={() => void select(group.id, model)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on || pressed ? colors.fill : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on ? colors.glassEdge : 'transparent' })}>
          <View style={{ flex: 1 }}><T style="footnote" numberOfLines={1}>{label}</T>{model.name && model.name !== model.id ? <T style="caption2" color="secondary" numberOfLines={1}>{model.id}</T> : null}</View>
          {on ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
        </Pressable>; })}
      </View>)}
    </ScrollView>
  </Sheet>;
}
