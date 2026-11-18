import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Header, Row, Screen, Section, T, s } from '../components/ui';
import { useActionMenu } from '../components/ActionMenu';
import { useDialog } from '../components/Dialog';
import { DshLocal, type LocalStatus } from '../../modules/dsh-local';
import { HARNESS_VERSIONS, LOCAL_PORT, LOCAL_URL, REQUIRED_FREE_BYTES, ROOTFS, formatBytes, harnessInstallScript, progressLabel, startState, tokenFromLog } from '../lib/localHarness';
import { HarnessClient, errorMessage } from '../lib/harness';
import { runLocalTask } from '../lib/localTask';
import { hasUsableModel } from '../lib/providers';
import { background } from '../../modules/dsh-background';

type Step = 'idle' | 'environment' | 'harness' | 'starting' | 'connecting';

/**
 * "Run on this device": set up and run the DeepSeek Harness on this phone/tablet, then connect.
 * Android 64-bit ARM only. Nothing here touches the regular URL + token connection.
 */
export default function LocalSetup() {
  const { connect, colors } = useApp(); const menu = useActionMenu(); const dialog = useDialog();
  const [status, setStatus] = useState<LocalStatus | null>(() => DshLocal?.status() ?? null);
  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState<string>(HARNESS_VERSIONS[0]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const refresh = useCallback(() => setStatus(DshLocal?.status() ?? null), []);

  // An install started earlier keeps running in the service; pick it up again on return.
  useEffect(() => {
    if (!DshLocal?.taskRunning()) return;
    void (async () => {
      setStep('harness'); setProgress('Installing DeepSeek Harness… (continuing in the background)');
      try { const r = await runLocalTask('', setLines); if (!r.ok) throw new Error(`Installing the Harness failed:\n${r.tail.slice(-10).join('\n')}`); }
      catch (e) { if (alive.current) setError(errorMessage(e)); }
      finally { if (alive.current) { setStep('idle'); refresh(); } }
    })();
  }, [refresh]);

  useEffect(() => {
    if (!DshLocal) return;
    const a = DshLocal.addListener('progress', p => setProgress(progressLabel(p)));
    const b = DshLocal.addListener('output', e => setLines(l => [...l.slice(-60), e.line]));
    return () => { a.remove(); b.remove(); };
  }, []);

  const harnessInstalled = async () => {
    const r = await DshLocal!.run('command -v dsh >/dev/null && dsh --version', 60).catch(() => null);
    return !!r && r.code === 0;
  };

  /** Start `dsh web`, wait for its token, connect. */
  const startAndConnect = async () => {
    // Phone makers' battery savers kill background processes (seen on HyperOS with Termux).
    // Ask once for the exemption so the Harness keeps running with the screen off.
    if (background.available && !background.isIgnoringBatteryOptimizations()) {
      const ok = await dialog.confirm({ title: 'Keep the Harness Running?', message: 'Android may stop the Harness to save battery while the screen is off. Allow DSH Mobile to run in the background so agents keep working.', confirm: 'Allow', icon: 'battery-charging-outline' });
      if (ok) background.requestIgnoreBatteryOptimizations();
    }
    setStep('starting'); setProgress('Starting the Harness… (the first start can take a minute)');
    DshLocal!.start(LOCAL_PORT);
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      if (!alive.current) return;
      const log = DshLocal!.readLog(64_000);
      const state = startState(log);
      if (state === 'exited') throw new Error(`The Harness stopped while starting. Last output:\n${log.split('\n').slice(-8).join('\n')}`);
      const token = tokenFromLog(log);
      if (state === 'listening' && token) {
        setStep('connecting'); setProgress('Connecting…');
        await connect({ url: LOCAL_URL, token });
        refresh();
        // A fresh Harness has no AI provider yet: ask for one right away (checked with a short-lived
        // client, since the app's client updates on the next render).
        const probe = new HarnessClient({ url: LOCAL_URL, token });
        const usable = await probe.authenticate().then(() => hasUsableModel(probe)).catch(() => true);
        router.replace(usable ? '/' : { pathname: '/add-provider', params: { setup: '1' } });
        return;
      }
    }
    throw new Error('The Harness took too long to start. Open Settings › Local Harness › Logs to see why.');
  };

  const setup = async () => {
    if (!DshLocal || !status) return;
    setError(''); setLines([]);
    try {
      if (!status.installed) {
        if (status.freeBytes < REQUIRED_FREE_BYTES) throw new Error(`Not enough free space: ${formatBytes(status.freeBytes)} free, about ${formatBytes(REQUIRED_FREE_BYTES)} needed.`);
        setStep('environment'); setProgress('Downloading Linux environment…');
        await DshLocal.install(ROOTFS.url, ROOTFS.sha256, ROOTFS.sizeBytes);
        refresh();
      }
      if (!(await harnessInstalled())) {
        setStep('harness'); setProgress(`Installing DeepSeek Harness (${version})… this downloads about 300 MB and can take several minutes.`);
        const r = await runLocalTask(harnessInstallScript(version), setLines);
        if (!r.ok) throw new Error(`Installing the Harness failed:\n${r.tail.slice(-10).join('\n')}`);
      }
      await startAndConnect();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setStep('idle');
    }
  };

  const chooseVersion = () => menu({
    title: 'Harness Version', subtitle: 'Which DeepSeek Harness version to install. "Latest" follows the newest release on npm.',
    actions: HARNESS_VERSIONS.map(v => ({ label: v === 'latest' ? 'Latest' : v, icon: (v === version ? 'checkmark-circle' : 'ellipse-outline') as 'checkmark-circle', onPress: () => setVersion(v) })),
  });

  const remove = async () => {
    if (!(await dialog.confirm({ title: 'Remove Local Harness?', message: 'Deletes the Linux environment, the Harness and everything in its projects folder from this device.', confirm: 'Remove', destructive: true, icon: 'trash-outline' }))) return;
    try { await DshLocal?.remove(); refresh(); } catch (e) { setError(errorMessage(e)); }
  };

  const busy = step !== 'idle';
  const supported = !!status?.supported;
  return <Screen readable><Header title="Run on This Device" back /><ScrollView contentContainerStyle={[s.body, { paddingTop: 20 }]}>
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={{ width: 60, height: 60, backgroundColor: colors.card, borderWidth: 0.5, borderColor: colors.glassEdge, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="phone-portrait-outline" size={28} color={colors.text} /></View>
      <T style="title2" align="center">Run the Harness on This Device</T>
      <T style="subhead" color="secondary" align="center">No computer needed. The app sets up a small Linux environment, installs the DeepSeek Harness in it, and connects to it.</T>
    </View>
    {!DshLocal || !supported ? <Section footer="Running the Harness on the device needs Android on a 64-bit ARM processor (most phones and tablets from the last few years).">
      <Row icon="alert-circle-outline" title="Not available on this device" chevron={false} />
    </Section> : <>
      <Section header="What setup does" footer={`Needs about ${formatBytes(REQUIRED_FREE_BYTES)} free (you have ${formatBytes(status!.freeBytes)}) and an internet connection during setup. The Harness then runs in the background with a notification; stop it any time.`}>
        <Row icon="cloud-download-outline" title="Download Linux environment" subtitle={`Debian 12 + Node.js 24, ${formatBytes(ROOTFS.sizeBytes)}`} value={status!.installed ? 'Done' : undefined} chevron={false} />
        <Row icon="cube-outline" title="Install DeepSeek Harness" subtitle="With npm, inside the environment" chevron={false} />
        <Row icon="flash-outline" title="Start and connect" subtitle={`Runs at ${LOCAL_URL}; the app connects for you`} chevron={false} />
      </Section>
      <Section>
        <Row icon="pricetag-outline" title="Harness Version" value={version === 'latest' ? 'Latest' : version} onPress={busy ? undefined : chooseVersion} />
      </Section>
      {busy ? <View style={{ gap: 8 }}>
        <T style="subhead" weight="600">{progress}</T>
        {lines.length ? <View style={{ padding: 10, borderRadius: 10, backgroundColor: colors.fill }}><T style="caption2" color="secondary" numberOfLines={6}>{lines.slice(-6).join('\n')}</T></View> : null}
      </View> : null}
      <ErrorNotice message={error} />
      <Button title={status!.running ? 'Connect' : status!.installed ? 'Finish Setup and Start' : 'Set Up and Start'} onPress={() => void (status!.running ? startAndConnect().catch(e => setError(errorMessage(e))) : setup())} loading={busy} />
      {status!.installed && !busy ? <Section>
        <Row icon="trash-outline" title="Remove Local Harness" destructive chevron={false} onPress={() => void remove()} />
      </Section> : null}
    </>}
  </ScrollView></Screen>;
}
