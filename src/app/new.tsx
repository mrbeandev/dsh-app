import { useState } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Label, Screen, s } from '../components/ui';
import { errorMessage } from '../lib/harness';
export default function NewTask() {
  const { client, refresh } = useApp(); const [cwd, setCwd] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const create = async () => { if (!client) return; setBusy(true); try { const result = await client.request('session/create', cwd.trim() ? { cwd: cwd.trim() } : {}); await refresh(); router.replace({ pathname: '/thread/[id]', params: { id: result.sessionId } }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="New task" back /><ScrollView contentContainerStyle={s.body}><Label size={28} weight="600">What’s next?</Label><Label muted>Start a fresh thread in your Harness workspace.</Label><Field label="Working directory" placeholder="Harness default directory" value={cwd} onChangeText={setCwd} autoCorrect={false} autoCapitalize="none" /><ErrorNotice message={error} /><Button title="Create thread" onPress={create} disabled={!client} loading={busy} /></ScrollView></Screen>;
}
