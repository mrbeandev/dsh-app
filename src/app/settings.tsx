import { Linking, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { clearCache, formatBytes, listCaches } from '../lib/cache';
import { CACHE_LIMIT_OPTIONS, enforceCacheLimit, getCacheLimitMb, limitLabel, setCacheLimitMb } from '../lib/cacheLimit';
import { useActionMenu } from '../components/ActionMenu';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { Header, Row, Screen, Section, T, s } from '../components/ui';
import { UpdateSection } from '../components/UpdateCard';
import { NotificationSection } from '../components/NotificationSettings';
import { DiagnosticSettings } from '../components/DiagnosticSettings';

/** Settings as an iOS grouped-inset list (HIG › Lists and tables). */
export default function Settings() {
  const { colors, theme, setTheme, client, disconnect, status } = useApp();
  const dialog = useDialog();
  const [caches, setCaches] = useState<{ url: string; bytes: number }[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const menu = useActionMenu();
  useFocusEffect(useCallback(() => { void listCaches().then(setCaches).catch(() => {}); void getCacheLimitMb().then(setLimit); }, []));
  const total = caches.reduce((sum, c) => sum + c.bytes, 0);
  const chooseLimit = () => menu({
    title: 'Cache Limit', subtitle: 'When the cache grows past this, it is cleared and rebuilt from the Harness as you open chats. Unsent messages are kept.',
    actions: CACHE_LIMIT_OPTIONS.map(mb => ({ label: limitLabel(mb), icon: (mb === limit ? 'checkmark-circle' : 'ellipse-outline') as 'checkmark-circle', onPress: async () => {
      await setCacheLimitMb(mb); setLimit(mb);
      const r = await enforceCacheLimit({ force: true });
      setCaches(await listCaches().catch(() => []));
      if (r.purged) await dialog.alert('Cache Cleared', `The cache was over ${limitLabel(mb)}, so ${formatBytes(r.freedBytes)} was cleared. Chats reload from the Harness when you open them.`, 'success');
    } })),
  });
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
    <Section header="Storage" footer="Chats are saved on this device only after you open them. Clearing never deletes anything on the Harness. When the cache passes the limit it is cleared automatically to keep the app fast; unsent messages are kept.">
      <Row icon="speedometer-outline" iconTint={colors.muted} title="Cache Limit" value={limit === null ? '' : limitLabel(limit)} subtitle={`${formatBytes(total)} used${limit ? ` of ${limitLabel(limit)}` : ''}`} onPress={chooseLimit} />
      {caches.length ? caches.map(cache => <Row key={cache.url} icon="archive-outline" iconTint={colors.muted} title={new URL(cache.url).host} value={formatBytes(cache.bytes)} chevron={false} onPress={() => void remove(cache.url)} accessory={<T style="subhead" color="danger">Clear</T>} />) : <Row title="No cached data" chevron={false} />}
    </Section>
    <NotificationSection />
    <UpdateSection />
    <DiagnosticSettings />
    <Section header="About" footer="Native Solid Glass theme adapted from DeepLethe. Original screen patterns inspired by T3 Code Mobile; Harness protocol informed by DeepSeek Harness Mobile. MIT licensed.">
      <Row title="DSH Mobile on GitHub" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/mrbeandev/dsh-app')} />
      <Row title="Solid Glass by DeepLethe" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/deeplethe/solid-glass')} />
      <Row title="T3 Code Mobile" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/pingdotgg/t3code/tree/main/apps/mobile')} />
      <Row title="DeepSeek Harness Mobile" icon="logo-github" iconTint={colors.text} onPress={() => void Linking.openURL('https://github.com/sorsama/deepseek-harness-mobile')} />
    </Section>
    <View style={{ height: 16 }} />
  </ScrollView></Screen>;
}
