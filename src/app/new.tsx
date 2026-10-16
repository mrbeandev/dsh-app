import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Loading } from '../components/Loader';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { Button, ErrorNotice, Header, Row, Screen, Section, s } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { FolderBrowser } from '../components/FolderBrowser';
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
  const dialog = useDialog();
  const params = useLocalSearchParams<{ cwd?: string }>();
  const [cwd, setCwd] = useState(params.cwd ?? ''); const [picker, setPicker] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [personas, setPersonas] = useState<Option[] | null>(null); const [access, setAccess] = useState<Option[] | null>(null);
  const [persona, setPersona] = useState(''); const [mode, setMode] = useState('');
  const [selection, setSelection] = useState<'access' | 'persona' | null>(null);
  const accessName = (o?: Option) => o ? o.name || ACCESS[o.value]?.title || titleCase(o.value) : 'Harness default';
  const personaName = (o?: Option) => o ? o.name || PERSONA[o.value]?.title || titleCase(o.value) : 'Harness default';

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
    void dialog.confirm({ title: `${access?.find(x => x.value === value)?.name || ACCESS[value]?.title || titleCase(value)}?`, message: 'The agent can run any command and change any file without asking. Use only in a trusted, disposable environment.', confirm: 'Allow', destructive: true, icon: 'shield-outline' }).then(ok => { if (ok) setMode(value); });
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
        catch (e) { await dialog.alert('Access mode not applied', `${errorMessage(e)}\n\nThe session was created with the default access mode.`, 'warning'); }
      }
      await refresh(); router.replace({ pathname: '/thread/[id]', params: { id: result.sessionId } });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return <Screen><Header title="New Session" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
    <Section header="Working Directory" footer="Where the agent starts. Leave it on the Harness default, or browse the Harness for a folder.">
      <Row icon="folder-outline" title={cwd ? cwd.split('/').filter(Boolean).pop() ?? cwd : 'Harness default'} subtitle={cwd || undefined} onPress={busy ? undefined : () => setPicker(true)} />
      {cwd ? <Row icon="close-circle-outline" title="Use Harness Default" chevron={false} onPress={() => setCwd('')} /> : null}
    </Section>
    <Section>
      <Row icon="shield-checkmark-outline" title="Access level" value={access === null ? 'Loading…' : accessName(access.find(o => o.value === mode))} onPress={busy ? undefined : () => setSelection('access')} />
      <Row icon="person-circle-outline" title="Persona" value={personas === null ? 'Loading…' : personaName(personas.find(o => o.value === persona))} onPress={busy ? undefined : () => setSelection('persona')} />
    </Section>
    <ErrorNotice message={error} />
    <Button title="Create Session" onPress={create} disabled={!client || access === null || personas === null} loading={busy} />
  </ScrollView>
    <Sheet visible={picker} onClose={() => setPicker(false)} title="Choose Folder" height={0.88}><FolderBrowser initial={cwd || undefined} confirmLabel="Use This Folder" onPick={p => { setCwd(p); setPicker(false); }} /></Sheet>
    <Sheet visible={selection !== null} onClose={() => setSelection(null)} title={selection === 'access' ? 'Access level' : 'Persona'} height={0.7}>
      <ScrollView contentContainerStyle={s.body}>
        {(selection === 'access' ? access : personas) === null ? <Loading fill={false} size="md" label="Loading options…" /> : <Section>
          {(selection === 'access' ? access : personas)?.length ? (selection === 'access' ? access : personas)!.map(o => <Row key={o.value}
            title={selection === 'access' ? accessName(o) : personaName(o)}
            subtitle={o.broken ? `Unavailable: ${o.broken}` : o.description || (selection === 'access' ? ACCESS[o.value]?.detail : PERSONA[o.value]?.detail)}
            value={o.isDefault ? 'Default' : undefined} selected={(selection === 'access' ? mode : persona) === o.value} chevron={false}
            onPress={o.broken ? undefined : () => { const kind = selection; setSelection(null); if (kind === 'access') setTimeout(() => pickMode(o.value), 250); else setPersona(o.value); }} />)
            : <Row title="Harness default" subtitle="No additional options are available." chevron={false} />}
        </Section>}
      </ScrollView>
    </Sheet>
  </Screen>;
}
