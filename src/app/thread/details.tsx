import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../../state/app';
import { Button, ErrorNotice, Field, Header, Label, Screen, s } from '../../components/ui';
import { Disclosure } from '../../components/Disclosure';
import { errorMessage } from '../../lib/harness';
import { sessionTitle } from '../../lib/protocol';
export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { client, sessions, refresh, colors } = useApp();
  const session = sessions.find(x => x.sessionId === id); const [title, setTitle] = useState(session ? sessionTitle(session) : ''); const [catalog, setCatalog] = useState<any>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void client?.call('session/modelCatalog', {}).then(setCatalog).catch(e => setError(errorMessage(e))); }, [client]);
  const run = async (operation: () => Promise<unknown>) => { setBusy(true); setError(''); try { await operation(); await refresh(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="Thread settings" back /><ScrollView contentContainerStyle={s.body}><Field label="Title" value={title} onChangeText={setTitle} /><Button title="Save title" loading={busy} onPress={() => void run(() => client!.request('session/rename', { sessionId: id, title }))} /><Label muted size={12}>MODEL</Label>{(catalog?.groups ?? catalog?.providers ?? []).map((group: any) => <View key={group.id} style={{ gap: 8 }}><Label muted size={13}>{group.name}</Label>{(group.models ?? []).map((model: any) => <Pressable key={model.id} disabled={busy} onPress={() => void run(() => client!.request('session/selectModel', { sessionId: id, provider: group.id, model: model.id }))} style={{ padding: 14, backgroundColor: colors.grouped, borderRadius: 12 }}><Label size={14}>{model.name ?? model.id}</Label></Pressable>)}</View>)}<Label muted size={12}>SESSION</Label><Disclosure title="Session projections" text={JSON.stringify(session?.projections?.values ?? {}, null, 2)} /><ErrorNotice message={error} /></ScrollView></Screen>;
}
