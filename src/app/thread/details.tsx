import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/app';
import { Button, ErrorNotice, Field, Header, Row, Screen, Section, s } from '../../components/ui';
import { Disclosure } from '../../components/Disclosure';
import { ModelPicker } from '../../components/ModelPicker';
import { errorMessage } from '../../lib/harness';
import { sessionTitle } from '../../lib/protocol';
import { readHistory } from '../../lib/cache';

export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { client, sessions, refresh, savedUrl } = useApp();
  const session = sessions.find(x => x.sessionId === id);
  const [title, setTitle] = useState(session ? sessionTitle(session) : ''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [picker, setPicker] = useState(false);
  const [journal, setJournal] = useState('');
  useEffect(() => { void readHistory(client?.connection.url ?? savedUrl, id).then(h => setJournal(JSON.stringify(h?.records ?? [], null, 2))).catch(() => {}); }, [client, savedUrl, id]);
  const selection = session?.projections?.values.modelSelection as any;
  const model: string = (selection?.next ?? selection?.lastUsed)?.model ?? '';
  const save = async () => { if (!client) return; setBusy(true); setError(''); try { await client.request('session/rename', { sessionId: id, title }); await refresh(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="Thread Details" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
    <View style={{ gap: 10 }}><Field label="Title" value={title} onChangeText={setTitle} returnKeyType="done" onSubmitEditing={save} /><Button title="Save Title" secondary loading={busy} disabled={!client || !title.trim()} onPress={save} /></View>
    <Section header="Thread">
      <Row icon="sparkles-outline" title="Model" value={model || 'Default'} onPress={client ? () => setPicker(true) : undefined} />
      {session?.cwd ? <Row icon="folder-outline" title="Directory" subtitle={session.cwd} chevron={false} /> : null}
    </Section>
    <Section header="Diagnostics" footer="Raw Harness data, for troubleshooting.">
      <View style={{ padding: 8, gap: 4 }}><Disclosure title="Session projections" text={JSON.stringify(session?.projections?.values ?? {}, null, 2)} /><Disclosure title="Context and event journal" text={journal} /></View>
    </Section>
    <ErrorNotice message={error} />
  </ScrollView><ModelPicker sessionId={id} visible={picker} onClose={() => setPicker(false)} onSelected={() => {}} current={model} /></Screen>;
}
