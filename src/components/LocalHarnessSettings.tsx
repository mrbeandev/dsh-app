import { useCallback, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../state/app';
import { Row, Section, T } from './ui';
import { Sheet } from './Sheet';
import { useActionMenu } from './ActionMenu';
import { useDialog } from './Dialog';
import { DshLocal, type LocalStatus } from '../../modules/dsh-local';
import { HARNESS_VERSIONS, LOCAL_PORT, LOCAL_URL, harnessInstallScript } from '../lib/localHarness';
import { errorMessage } from '../lib/harness';
import { runLocalTask } from '../lib/localTask';
import { Loading } from './Loader';

/**
 * Settings › Local Harness (only once it's set up on this device): running state, start/stop,
 * logs, update the Harness, remove. Setup itself lives on Connect › Run on This Device.
 */
export function LocalHarnessSettings() {
  const { colors, client } = useApp(); const menu = useActionMenu(); const dialog = useDialog();
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [log, setLog] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const refresh = useCallback(() => setStatus(DshLocal?.status() ?? null), []);
  useFocusEffect(useCallback(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [refresh]));
  // An update still running in the background (app was left or restarted): show it again.
  useFocusEffect(useCallback(() => {
    if (!DshLocal?.taskRunning()) return;
    let live = true; setBusy('Updating the Harness…');
    void runLocalTask('', l => { if (live) setLines(l); }).finally(() => { if (live) { setBusy(''); refresh(); } });
    return () => { live = false; };
  }, [refresh]));

  if (Platform.OS !== 'android' || !DshLocal || !status?.installed) return null;
  const usingIt = client?.connection.url === LOCAL_URL;

  const toggle = async () => {
    if (status.running) {
      if (usingIt && !(await dialog.confirm({ title: 'Stop Local Harness?', message: 'The app is connected to it; agents running on this device will stop.', confirm: 'Stop', destructive: true, icon: 'stop-circle-outline' }))) return;
      DshLocal!.stop();
    } else router.push('/local-setup'); // starts it and reconnects with the fresh token
    setTimeout(refresh, 800);
  };

  const update = () => menu({
    title: 'Update DeepSeek Harness', subtitle: 'Reinstalls the Harness with npm inside the local environment. Your projects and sessions are kept.',
    actions: HARNESS_VERSIONS.map(v => ({ label: v === 'latest' ? 'Latest' : v, icon: 'cloud-download-outline' as const, onPress: () => void (async () => {
      setBusy(`Updating to ${v === 'latest' ? 'the latest version' : v}…`); setLines([]);
      try {
        const wasRunning = DshLocal!.status().running; if (wasRunning) DshLocal!.stop();
        const r = await runLocalTask(harnessInstallScript(v), setLines);
        if (!r.ok) throw new Error(r.tail.slice(-8).join('\n'));
        const ver = r.tail.filter(l => /^\d+\.\d+\.\d+/.test(l)).pop() ?? '';
        await dialog.alert('Harness Updated', `${ver ? `Now ${ver}. ` : ''}Start it again from Connect › Run on This Device.`, 'success');
        if (wasRunning) router.push('/local-setup');
      } catch (e) { await dialog.alert('Update Failed', errorMessage(e), 'danger'); }
      finally { setBusy(''); refresh(); }
    })() })),
  });

  const remove = async () => {
    if (!(await dialog.confirm({ title: 'Remove Local Harness?', message: 'Deletes the Linux environment, the Harness and its projects folder from this device. This can\u2019t be undone.', confirm: 'Remove', destructive: true, icon: 'trash-outline' }))) return;
    try { setBusy('Removing…'); await DshLocal!.remove(); } catch (e) { await dialog.alert('Couldn\u2019t Remove', errorMessage(e), 'danger'); } finally { setBusy(''); refresh(); }
  };

  return <>
    {busy ? <View style={{ marginHorizontal: 14, padding: 12, gap: 8, borderRadius: 12, backgroundColor: colors.fill }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Loading fill={false} size="sm" /><T style="subhead" weight="600">{busy}</T></View>
      <T style="caption1" color="secondary">This takes a few minutes. It keeps going if you leave the app.</T>
      {lines.length ? <T style="caption2" color="tertiary" numberOfLines={4}>{lines.slice(-4).join('\n')}</T> : null}
    </View> : null}
    <Section header="Local Harness" footer={`Runs on this device at ${LOCAL_URL}${usingIt ? ' \u2014 the app is connected to it.' : '.'} It keeps running in the background with a notification until you stop it.`}>
      <Row icon={status.running ? 'stop-circle-outline' : 'play-circle-outline'} iconTint={status.running ? colors.live : colors.muted} title={status.running ? 'Running' : 'Stopped'} value={status.running ? 'Stop' : 'Start'} onPress={busy ? undefined : () => void toggle()} />
      <Row icon="document-text-outline" iconTint={colors.muted} title="Logs" onPress={() => { const task = DshLocal!.readTaskLog(16_000).trim(); const web = DshLocal!.readLog(32_000).trim(); setLog([task ? `Setup / update\n${task}` : '', web ? `Harness\n${web}` : ''].filter(Boolean).join('\n\n')); }} />
      <Row icon="cloud-download-outline" iconTint={colors.muted} title="Update Harness" onPress={busy ? undefined : update} />
      <Row icon="trash-outline" title="Remove Local Harness" destructive chevron={false} onPress={busy ? undefined : () => void remove()} />
    </Section>
    <Sheet visible={log !== null} onClose={() => setLog(null)} title="Local Harness Log" height={0.8}>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <View style={{ padding: 10, borderRadius: 10, backgroundColor: colors.fill }}>
          <T style="caption2" selectable>{(log || 'No output yet.').replace(/([?&]token=)[A-Za-z0-9_-]+/g, '$1\u2022\u2022\u2022\u2022')}</T>
        </View>
        <T style="caption2" color="tertiary">{`Port ${LOCAL_PORT}. Tokens are hidden here.`}</T>
      </ScrollView>
    </Sheet>
  </>;
}
