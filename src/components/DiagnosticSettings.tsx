import { useState } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Section, Row } from './ui';
import { useDialog } from './Dialog';
import { eraseDiagnostics, exportDiagnostics } from '../lib/diagnostics';

export function DiagnosticSettings() {
  const dialog = useDialog(); const [busy, setBusy] = useState(false);
  const exportLog = async () => {
    if (busy) return; setBusy(true);
    try {
      const data = await exportDiagnostics();
      if (Platform.OS === 'web') {
        const uri = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = uri; a.download = 'dsh-beta-diagnostics.json'; a.click(); URL.revokeObjectURL(uri);
      } else {
        const file = new File(Paths.cache, 'dsh-beta-diagnostics.json'); file.create({ overwrite: true }); file.write(data);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Share beta diagnostics' });
        else await dialog.alert('Sharing unavailable', 'This device cannot share the diagnostics export.');
      }
    } catch { await dialog.alert('Export failed', 'Could not export diagnostics. Please retry.'); }
    finally { setBusy(false); }
  };
  return <Section header="Beta diagnostics" footer="Local metadata only: keyboard/layout, navigation, request timing and errors. No prompts, tokens or file contents. Keeps up to 10,000 events for 7 days. Export only when you choose to share it.">
    <Row icon="share-outline" title={busy ? 'Preparing export…' : 'Export diagnostic logs'} onPress={busy ? undefined : () => void exportLog()} />
    <Row icon="trash-outline" title="Clear diagnostic logs" destructive onPress={() => void dialog.confirm({ title: 'Clear diagnostic logs?', message: 'Delete this device’s beta diagnostics?', confirm: 'Clear Logs', destructive: true }).then(async yes => { if (yes) await eraseDiagnostics(); }).catch(() => {})} />
  </Section>;
}
