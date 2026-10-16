import { useState } from 'react';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { ErrorNotice, Header, Screen, T } from '../components/ui';
import { FolderBrowser } from '../components/FolderBrowser';
import { errorMessage } from '../lib/harness';
import { View } from 'react-native';

/** Add a workspace by browsing Harness folders (browse picker, or inside existing workspaces). */
export default function NewWorkspace() {
  const { client, refresh } = useApp(); const dialog = useDialog();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const create = async (path: string) => {
    if (!client) return; setBusy(true); setError('');
    try { const r = await client.call('workspace/create', { request: { path } }); await refresh(); if (!r?.created) await dialog.alert('Already a Workspace', `${r?.workspace?.title ?? path} is already in your workspace list.`); router.back(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <Screen>
    <Header title="Add Workspace" back />
    <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}><T style="caption1" color="secondary">Pick a folder on the Harness. New sessions can then start there.</T></View>
    <ErrorNotice message={error} />
    <FolderBrowser confirmLabel="Use This Folder" busy={busy} onPick={p => void create(p)} />
  </Screen>;
}
