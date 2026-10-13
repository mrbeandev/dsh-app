import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Label, Screen, s } from '../components/ui';
import { errorMessage } from '../lib/harness';
export default function Connect() {
  const { connect, savedUrl, colors } = useApp();
  const [url, setUrl] = useState(savedUrl); const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async () => { setBusy(true); setError(''); try { await connect({ url, token }); router.replace('/'); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  return <Screen><Header title="Connection" back /><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingTop: 48 }]}><View style={{ width: 64, height: 64, backgroundColor: colors.grouped, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="terminal-outline" size={30} color={colors.text} /></View><View style={{ gap: 8 }}><Label size={30} weight="600">Connect your Harness</Label><Label muted>Your workspace, wherever you are.</Label></View><View style={{ gap: 22, marginTop: 16 }}><Field label="Harness URL" value={url} onChangeText={setUrl} placeholder="http://localhost:3080" autoCapitalize="none" autoCorrect={false} keyboardType="url" textContentType="URL" /><Field label="Auth token" value={token} onChangeText={setToken} placeholder="Paste your Harness token" secureTextEntry autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} /></View><ErrorNotice message={error} /><Button title="Connect" onPress={submit} loading={busy} disabled={!url.trim()} /><Label muted size={13}>Use a local address or any tunnel URL. On a phone, localhost refers to the phone itself; use your computer’s LAN address when Harness runs there.</Label>{Platform.OS === 'web' && <Label muted size={13}>Web preview requires your Harness to allow this browser origin and credentialed requests. Tokens are not saved in browser storage.</Label>}</ScrollView></KeyboardAvoidingView></Screen>;
}
