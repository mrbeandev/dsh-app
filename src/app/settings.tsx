import { Linking, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { clearCache, formatBytes, listCaches } from '../lib/cache';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { Header, Row, Screen, Section, T, s } from '../components/ui';

/** Settings as an iOS grouped-inset list (HIG › Lists and tables). */
export default function Settings() {
  const { colors, theme, setTheme, client, disconnect, status } = useApp();
  const dialog = useDialog();
  const [caches, setCaches] = useState<{ url: string; bytes: number }[]>([]);
  useFocusEffect(useCallback(() => { void listCaches().then(setCaches).catch(() => {}); }, []));
  const remove = async (url: string) => {
    if (!await dialog.confirm({ title: 'Clear Local Cache?', message: 'Saved workspaces and chats for this Harness are removed from this device. Nothing on the Harness is deleted.', confirm: 'Clear Cache', destructive: true, icon: 'trash-outline' })) return;
    try { await clearCache(url); setCaches(await listCaches()); } catch { await dialog.alert('Couldn’t Clear Cache', 'Please try again.', 'danger'); }
  };
  const host = client ? new URL(client.connection.url).host : '';
  return <Screen><Header title="Settings" back /><ScrollView contentContainerStyle={s.body}>
    <Section header="Harness">
      <Row icon="server-outline" title={host || 'Connect Harness'} subtitle={host ? (status === 'connected' ? 'Connected' : status[0].toUpperCase() + status.slice(1)) : 'URL and auth token'} onPress={() => router.push('/connect')} />
      {client ? <Row icon="log-out-outline" title="Disconnect" destructive chevron={false} onPress={() => void dialog.confirm({ title: 'Disconnect?', message: 'Your saved token is removed from this device. Cached chats stay until you clear them.', confirm: 'Disconnect', destructive: true, icon: 'log-out-outline' }).then(ok => { if (ok) void disconnect().then(() => router.replace('/')); })} /> : null}
    </Section>
    <Section header="Appearance" footer="System follows your device’s Light or Dark setting.">
      {(['system', 'light', 'dark'] as const).map(t => <Row key={t} title={t[0].toUpperCase() + t.slice(1)} selected={theme === t} chevron={false} onPress={() => setTheme(t)} />)}
    </Section>
    <Section header="Storage" footer="Chats are saved on this device only after you open them. Clearing never deletes anything on the Harness.">
      {caches.length ? caches.map(cache => <Row key={cache.url} icon="archive-outline" iconTint={colors.muted} title={new URL(cache.url).host} value={formatBytes(cache.bytes)} chevron={false} onPress={() => void remove(cache.url)} accessory={<T style="subhead" color="danger">Clear</T>} />) : <Row title="No cached data" chevron={false} />}
    </Section>
    <Section header="About" footer="UI adapted from T3 Code mobile; Harness protocol informed by DeepSeek Harness Mobile. Both MIT licensed.">
      <Row title="Version" value="0.1.0" chevron={false} />
      <Row title="T3 Code Mobile" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/pingdotgg/t3code/tree/main/apps/mobile')} />
      <Row title="DeepSeek Harness Mobile" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/sorsama/deepseek-harness-mobile')} />
    </Section>
    <View style={{ height: 16 }} />
  </ScrollView></Screen>;
}
