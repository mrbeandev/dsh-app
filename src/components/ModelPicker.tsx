import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Loading } from './Loader';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { errorMessage } from '../lib/harness';
import { ErrorNotice, SearchField, T } from './ui';
import { loadCatalog } from '../lib/modelNames';
import { effortChoices, effortLabel, type Reasoning } from '../lib/reasoning';
import { Sheet } from './Sheet';

/** The selected row is identified by provider + model id: the same model id (or display name) can be offered by several providers. */
export function isCurrentModel(current: { provider?: string; model?: string } | undefined, providerId: string, model: { id: string; name?: string }) {
  if (!current?.model) return false;
  if (current.model !== model.id && current.model !== model.name) return false;
  // Without a provider (older Harness / not yet known) fall back to the first provider offering that model.
  return !current.provider || current.provider === providerId;
}

type Current = { provider?: string; model?: string; reasoningEffort?: string };
function findCurrentRow(groups: any[], current: Current | undefined): { group: any; model: any } | null {
  for (const g of groups) for (const m of g.models ?? []) if (isCurrentModel(current, g.id, m)) return { group: g, model: m };
  return null;
}
export type ModelChoice = { provider: string; model: string; label: string; reasoningEffort?: string };

/**
 * "Choose model" sheet. Like the Web UI, models that advertise reasoning levels (off/low/medium/high/max…)
 * get a "Reasoning" row of chips for the selected model; picking one re-sends session/selectModel with
 * `reasoningEffort`. Choosing a different model keeps the current level if that model supports it,
 * otherwise uses the model's default.
 */
export function ModelPicker({ sessionId, visible, onClose, onSelected, current }: { sessionId: string; visible: boolean; onClose: () => void; onSelected: (choice: ModelChoice) => void; current?: Current }) {
  const { client, colors, refresh } = useApp(); const [catalog, setCatalog] = useState<any>(null); const [query, setQuery] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  // Refresh the shared catalog each time the picker opens (new providers/plugins), which also updates names shown elsewhere.
  useEffect(() => { if (!visible || !client) return; let active = true; void loadCatalog(client, true).then(c => { if (!active) return; if (c) setCatalog(c); else setError('Could not load the model list.'); }); return () => { active = false; }; }, [client, visible]);
  const allGroups: any[] = useMemo(() => catalog?.groups ?? catalog?.providers ?? [], [catalog]);
  // Exactly one row is checked, even when several providers list the same model id or name.
  const currentRow = findCurrentRow(allGroups, current);
  const currentKey = currentRow ? `${currentRow.group.id}\u0000${currentRow.model.id}` : '';
  const groups = useMemo(() => allGroups.map((g: any) => ({ ...g, models: (g.models ?? []).filter((m: any) => `${m.name ?? ''} ${m.id}`.toLowerCase().includes(query.toLowerCase())) })).filter((g: any) => g.models.length), [allGroups, query]);

  const apply = async (provider: string, model: any, effort: string | undefined, key: string, close: boolean) => {
    if (!client) return; setBusy(key); setError('');
    try {
      await client.request('session/selectModel', { sessionId, provider, model: model.id, ...(effort ? { reasoningEffort: effort } : {}) });
      await refresh();
      onSelected({ provider, model: model.id, label: model.name ?? model.id, ...(effort ? { reasoningEffort: effort } : {}) });
      if (close) onClose();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };
  const selectModel = (provider: string, model: any) => {
    const reasoning: Reasoning | undefined = model.reasoning;
    // Keep the level you had if this model offers it too; otherwise the model's own default.
    const keep = current?.reasoningEffort && reasoning?.efforts.some(e => e.id === current.reasoningEffort) ? current.reasoningEffort : reasoning?.defaultEffort;
    void apply(provider, model, keep, `${provider}\u0000${model.id}`, true);
  };

  const reasoning: Reasoning | undefined = currentRow?.model.reasoning;
  const effective = current?.reasoningEffort ?? reasoning?.defaultEffort;
  const levels = effortChoices(reasoning);

  return <Sheet visible={visible} onClose={onClose} title="Choose model">
    <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}><SearchField value={query} onChangeText={setQuery} placeholder="Search models" /></View>
    <ErrorNotice message={error} />
    {currentRow && levels.length ? <View style={{ marginHorizontal: 12, marginTop: 6, marginBottom: 2, padding: 10, gap: 8, borderRadius: 12, backgroundColor: colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="bulb-outline" size={14} color={colors.muted} />
        <T style="caption1" weight="600">Reasoning</T>
        <T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ flex: 1 }}>{`· ${currentRow.model.name ?? currentRow.model.id}`}</T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {levels.map(level => {
          const on = level.effort === effective;
          const key = `effort:${level.key}`;
          return <Pressable key={level.key} accessibilityRole="radio" accessibilityLabel={`Reasoning ${level.label}`} accessibilityState={{ checked: on, disabled: !!busy }} disabled={!!busy}
            onPress={() => { if (!on) void apply(currentRow.group.id, currentRow.model, level.effort, key, false); }}
            style={({ pressed }) => ({ height: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 5,
              borderWidth: on ? 2 : StyleSheet.hairlineWidth, borderColor: on ? colors.text : colors.border,
              backgroundColor: on ? colors.state : pressed ? colors.fill : 'transparent', opacity: busy && busy !== key ? 0.5 : 1 })}>
            {busy === key ? <Ionicons name="ellipsis-horizontal" size={13} color={colors.muted} /> : on ? <Ionicons name="checkmark" size={13} color={colors.text} /> : null}
            <T style="caption1" weight={on ? '600' : undefined} color={on ? undefined : 'secondary'}>{level.label}</T>
          </Pressable>;
        })}
      </View>
    </View> : null}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 24 }}>
      {!catalog && !error ? <Loading fill={false} size="md" label="Loading models…" /> : null}
      {catalog && !groups.length ? <View style={{ padding: 16 }}><T style="footnote" color="secondary" align="center">No models match your search.</T></View> : null}
      {groups.map((group: any) => <View key={group.id}>
        <View style={{ paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 }}><T style="caption2" color="secondary" weight="500" styleOverride={{ letterSpacing: 0.6 }}>{String(group.name ?? group.id).toUpperCase()}</T></View>
        {group.models.map((model: any) => {
          const label = model.name ?? model.id; const key = `${group.id}\u0000${model.id}`; const on = currentKey === key;
          const level = on ? effortLabel(model.reasoning, effective) : undefined;
          return <Pressable key={`${group.id}/${model.id}`} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !!busy }} disabled={!!busy} onPress={() => selectModel(group.id, model)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: on || pressed ? colors.state : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: on || pressed ? colors.glassEdge : 'transparent', boxShadow: on || pressed ? `inset 0 1px 0 ${colors.rim}` : undefined })}>
            <View style={{ flex: 1 }}><T style="footnote" numberOfLines={1}>{label}</T>{model.name && model.name !== model.id ? <T style="caption2" color="secondary" numberOfLines={1}>{model.id}</T> : null}</View>
            {model.reasoning?.efforts?.length ? <Ionicons name="bulb-outline" size={13} color={colors.tertiary} accessibilityLabel="Supports reasoning levels" /> : null}
            {level ? <T style="caption2" color="secondary">{level}</T> : null}
            {busy === key ? <Ionicons name="ellipsis-horizontal" size={16} color={colors.muted} /> : on ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
          </Pressable>;
        })}
      </View>)}
    </ScrollView>
  </Sheet>;
}
