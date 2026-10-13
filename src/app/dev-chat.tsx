import { useMemo } from 'react';
import { Redirect } from 'expo-router';
import { FlatList, View } from 'react-native';
import { Header, Screen } from '../components/ui';
import { ChatRow } from '../components/ChatRows';
import { PlanReview } from '../components/PlanReview';
import { buildTranscript, foldTurns } from '../lib/protocol';
import { demoEvents } from '../lib/demoEvents';

/** Sample plan-review request in the exact shape dsh-plan-mode sends (exit_plan_mode → userQuestions). */
const demoPlan = { type: 'waterfall', eventId: 'demo-plan', clientId: '', event: 'userQuestions/ask', request: { questions: [{ id: 'plan-review', header: 'Plan review', question: 'Approve this plan and leave plan mode?', options: [{ label: 'Approve' }, { label: 'Keep planning' }], intent: { kind: 'plan-review', approve: 'Approve', callId: 'demo' }, detail: '# Add a README that says hello\n\n## Steps\n1. Create `README.md` in the workspace root.\n2. Add a `# Hello` heading and one line of text.\n3. Show the file content to confirm.\n\n## Risks\n- None; it only creates one new file.' }] } } as any;

/** Dev-only preview of every chat row kind with sample events (no Harness needed). */
/** Release builds never show the dev preview. */
export default function DevChatRoute() { return __DEV__ ? <DevChat /> : <Redirect href="/" />; }

function DevChat() {
  const rows = useMemo(() => foldTurns(demoEvents, buildTranscript(demoEvents)), []);
  const quiet = (k?: string) => k === 'tool' || k === 'context' || k === 'system';
  return <Screen><Header title="Chat rows preview" back /><FlatList data={rows} keyExtractor={x => x.id} contentContainerStyle={{ padding: 14 }} ListFooterComponent={<View style={{ marginTop: 14 }}><PlanReview frame={demoPlan} /></View>} renderItem={({ item, index }) => <View style={{ marginTop: index === 0 ? 0 : quiet(item.kind) && quiet(rows[index - 1]?.kind) ? 2 : 12 }}><ChatRow row={item} /></View>} /></Screen>;
}
