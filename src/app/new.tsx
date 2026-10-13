import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Row, Screen, Section, T, s } from '../components/ui';
import { errorMessage } from '../lib/harness';

/**
 * Fallback copy for built-in entries, taken verbatim from the DSH Web UI locale
 * (dsh-client-ui-permission-presets / dsh-client-ui-agent-preset). Any name or
 * description the Harness API returns always wins, so plugin-added personas show as in the Web UI.
 */
const ACCESS: Record<string, { title: string; detail: string }> = {
  'read-only': { title: 'Read Only', detail: 'Can read files; asks before changing anything' },
  'workspace-write': { title: 'Workspace Write', detail: 'Edits inside the workspace; asks for anything else' },
  'danger-full-access': { title: 'Full access', detail: 'No sandbox and no approval prompts' },
  auto: { title: 'Auto review', detail: 'Full access with automatic review (experimental)' },
};
const PERSONA: Record<string, { title: string; detail: string }> = {
  standard: { title: 'Standard mode', detail: 'Work with code, files, and information. Suitable for most tasks, with search, editing, terminal commands, and other tools available as needed.' },
  ptc: { title: 'PTC mode', detail: 'Includes all Standard mode capabilities. Better suited to tasks that call tools in batches and then filter, organize, deduplicate, count, or summarize the results.' },
  minimal: { title: 'Minimal mode', detail: 'The agent works using only a terminal tool. Useful for testing and comparing its basic performance.' },
  cordis: { title: 'Creator mode', detail: 'Customize DSH through conversation. Let the agent write plugins that add features or UI, or combine tools and prompts to create your own mode.' },
};
const titleCase = (v: string) => v.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

type Option = { value: string; isDefault: boolean; name?: string; description?: string; broken?: string };

export default function NewTask() {
  const { client, refresh } = useApp();
  const params = useLocalSearchParams<{ cwd?: string }>();
  const [cwd, setCwd] = useState(params.cwd ?? ''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [personas, setPersonas] = useState<Option[] | null>(null); const [access, setAccess] = useState<Option[] | null>(null);
  const [persona, setPersona] = useState(''); const [mode, setMode] = useState('');

  useEffect(() => {
    if (!client) return; let active = true;
    void client.call('agentPresets/list', {}).then((v: any) => {
      if (!active) return; const list: Option[] = (v?.presets ?? []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0)).map((p: any) => ({ value: p.id, isDefault: !!p.isDefault, name: p.name, description: p.description, broken: p.broken }));
      setPersonas(list); setPersona(p => p || list.find(x => x.isDefault && !x.broken)?.value || list.find(x => !x.broken)?.value || '');
    }).catch(() => { if (active) setPersonas([]); });
    void client.call('permissionPresets/catalog', {}).then((v: any) => {
      if (!active) return; const list: Option[] = (v?.options ?? []).map((o: any) => ({ value: String(o.value), isDefault: o.value === v?.defaultPreset, name: o.name !== o.value ? o.name : undefined, description: o.description }));
      setAccess(list); setMode(m => m || v?.defaultPreset || list[0]?.value || '');
    }).catch(() => { if (active) setAccess([]); });
    return () => { active = false; };
  }, [client]);

  const pickMode = (value: string) => {
    if (value !== 'danger-full-access' && value !== 'auto') { setMode(value); return; }
    // The Web UI asks for an explicit acknowledgement before full access.
    Alert.alert(`${access?.find(x => x.value === value)?.name || ACCESS[value]?.title || titleCase(value)}?`, 'The agent can run any command and change any file without asking. Use only in a trusted, disposable environment.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Allow', style: 'destructive', onPress: () => setMode(value) }]);
  };

  const create = async () => {
    if (!client || busy) return; setBusy(true); setError('');
    try {
      const args: Record<string, string> = {}; if (cwd.trim()) args.cwd = cwd.trim();
      const defaultPersona = personas?.find(x => x.isDefault)?.value;
      if (persona && persona !== defaultPersona) args.agentPreset = persona;
      const result = await client.request('session/create', args);
      const defaultMode = access?.find(x => x.isDefault)?.value;
      if (mode && mode !== defaultMode) {
        try { await client.call('commands/execute', { agentId: result.sessionId, line: `/permission ${mode}`, submittedAttachments: [] }); }
        catch (e) { Alert.alert('Access mode not applied', `${errorMessage(e)}\n\nThe thread was created with the default access mode.`); }
      }
      await refresh(); router.replace({ pathname: '/thread/[id]', params: { id: result.sessionId } });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return <Screen><Header title="New Thread" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
    <Field label="Working Directory" placeholder="Harness default" value={cwd} onChangeText={setCwd} autoCorrect={false} autoCapitalize="none" />
    <Section header="Access" footer="What the agent may do without asking. You can change it later with /permission.">
      {access === null ? <View style={{ padding: 14 }}><ActivityIndicator /></View> : access.length ? access.map(o => <Row key={o.value} title={o.name || ACCESS[o.value]?.title || titleCase(o.value)} subtitle={o.description || ACCESS[o.value]?.detail} value={o.isDefault ? 'Default' : undefined} selected={mode === o.value} chevron={false} onPress={() => pickMode(o.value)} />) : <Row title="Harness default" subtitle="This Harness doesn’t expose access modes." chevron={false} />}
    </Section>
    <Section header="Persona" footer="The agent preset: which tools and instructions the agent starts with.">
      {personas === null ? <View style={{ padding: 14 }}><ActivityIndicator /></View> : personas.length ? personas.map(o => <Row key={o.value} title={o.name || PERSONA[o.value]?.title || titleCase(o.value)} subtitle={o.broken ? `Unavailable: ${o.broken}` : o.description || PERSONA[o.value]?.detail} value={o.isDefault ? 'Default' : o.value} selected={persona === o.value} chevron={false} onPress={o.broken ? undefined : () => setPersona(o.value)} />) : <Row title="Harness default" subtitle="This Harness doesn’t expose personas." chevron={false} />}
    </Section>
    <ErrorNotice message={error} />
    <Button title="Create Thread" onPress={create} disabled={!client} loading={busy} />
    <T style="caption1" color="secondary" align="center">Leave the directory empty to use the Harness default.</T>
  </ScrollView></Screen>;
}
