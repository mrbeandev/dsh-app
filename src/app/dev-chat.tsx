import { useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { Header, Screen } from '../components/ui';
import { ChatRow } from '../components/ChatRows';
import { buildTranscript } from '../lib/protocol';
import { demoEvents } from '../lib/demoEvents';

/** Dev-only preview of every chat row kind with sample events (no Harness needed). */
export default function DevChat() {
  const rows = useMemo(() => buildTranscript(demoEvents), []);
  const quiet = (k?: string) => k === 'tool' || k === 'context' || k === 'system';
  return <Screen><Header title="Chat rows preview" back /><FlatList data={rows} keyExtractor={x => x.id} contentContainerStyle={{ padding: 14 }} renderItem={({ item, index }) => <View style={{ marginTop: index === 0 ? 0 : quiet(item.kind) && quiet(rows[index - 1]?.kind) ? 2 : 12 }}><ChatRow row={item} /></View>} /></Screen>;
}
