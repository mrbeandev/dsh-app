import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Screen, T, s } from '../components/ui';
import { errorMessage } from '../lib/harness';

/** One simple connection: Harness URL (localhost or any tunnel) + auth token. */
export default function Connect() {
  const { connect, savedUrl, colors } = useApp();
  const [url, setUrl] = useState(savedUrl); const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => { if (!url.trim() || busy) return; setBusy(true); setError(''); try { await connect({ url: url.trim(), token: token.trim() }); router.replace('/'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="Connect" back /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingTop: 24 }]}>
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={{ width: 60, height: 60, backgroundColor: colors.grouped, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="terminal-outline" size={28} color={colors.text} /></View>
      <T style="title1" align="center">Connect Your Harness</T>
      <T style="subhead" color="secondary" align="center">Use a local address or any tunnel URL.</T>
    </View>
    <View style={{ gap: 18 }}>
      <Field label="Harness URL" value={url} onChangeText={setUrl} placeholder="http://192.168.1.10:3080" autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" returnKeyType="next" />
      <Field label="Auth Token" value={token} onChangeText={setToken} placeholder="Paste token" secureTextEntry autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={submit} />
    </View>
    <ErrorNotice message={error} />
    <Button title="Connect" onPress={submit} loading={busy} disabled={!url.trim()} />
    <T style="footnote" color="secondary" align="center">On a phone, localhost means the phone itself. If the Harness runs on your computer, use its LAN or tunnel address.</T>
    {Platform.OS === 'web' ? <T style="footnote" color="secondary" align="center">The web preview needs your Harness to allow this browser origin. Tokens aren’t saved in the browser.</T> : null}
  </ScrollView></KeyboardAvoidingView></Screen>;
}
