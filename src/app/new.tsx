import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Screen, T, s } from '../components/ui';
import { errorMessage } from '../lib/harness';

export default function NewTask() {
  const { client, refresh } = useApp(); const [cwd, setCwd] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const create = async () => { if (!client || busy) return; setBusy(true); setError(''); try { const result = await client.request('session/create', cwd.trim() ? { cwd: cwd.trim() } : {}); await refresh(); router.replace({ pathname: '/thread/[id]', params: { id: result.sessionId } }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="New Thread" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
    <T style="subhead" color="secondary">Start a fresh thread on your Harness. Leave the directory empty to use the Harness default.</T>
    <Field label="Working Directory" placeholder="Harness default" value={cwd} onChangeText={setCwd} autoCorrect={false} autoCapitalize="none" returnKeyType="go" onSubmitEditing={create} />
    <ErrorNotice message={error} />
    <Button title="Create Thread" onPress={create} disabled={!client} loading={busy} />
  </ScrollView></Screen>;
}
