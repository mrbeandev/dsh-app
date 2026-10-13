import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useApp } from '../state/app';
import { Frame } from '../lib/protocol';
import { errorMessage } from '../lib/harness';
import { Button, ErrorNotice, Field, Label } from './ui';
import { Disclosure } from './Disclosure';
export function PendingRequest({ frame }: { frame: Frame }) {
  const { client, dismiss, colors } = useApp(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({}); const [custom, setCustom] = useState<Record<string, string>>({});
  const questions = frame.request?.questions ?? [];
  const answer = async (value: unknown) => { if (!client) return; setBusy(true); try { await client.answer(frame.eventId, value, frame.clientId); dismiss(frame.eventId); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const approval = frame.event === 'approval/request';
  return <View style={{ padding: 16, gap: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}><Label weight="600">{approval ? 'Approval needed' : 'Your input is needed'}</Label>{approval ? <><Disclosure title="Review request" text={JSON.stringify(frame.request, null, 2)} /><Button title="Allow once" loading={busy} onPress={() => void answer('allowed-once')} /><Button title="Reject" secondary disabled={busy} onPress={() => void answer('rejected')} /></> : questions.length ? <>{questions.map((q: any) => <View key={q.id} style={{ gap: 8 }}><Label>{q.question}</Label>{(q.options ?? []).map((o: any) => <Pressable key={o.label} onPress={() => { setCustom(c => ({ ...c, [q.id]: '' })); setSelected(p => ({ ...p, [q.id]: q.multi_select ? (p[q.id] ?? []).includes(o.label) ? p[q.id].filter(x => x !== o.label) : [...p[q.id] ?? [], o.label] : [o.label] })); }} style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: (selected[q.id] ?? []).includes(o.label) ? colors.primary : colors.border }}><Label size={14}>{o.label}</Label>{o.description && <Label size={12} muted>{o.description}</Label>}</Pressable>)}<Field label="Your answer" value={custom[q.id] ?? ''} onChangeText={v => { setCustom(c => ({ ...c, [q.id]: v })); if (!q.multi_select) setSelected(p => ({ ...p, [q.id]: [] })); }} /></View>)}<Button title="Submit answers" loading={busy} onPress={() => void answer({ answers: questions.map((q: any) => ({ id: q.id, selected: selected[q.id] ?? [], ...(custom[q.id]?.trim() ? { custom: custom[q.id].trim() } : {}) })) })} /></> : <Disclosure title={frame.event} text={JSON.stringify(frame.request, null, 2)} />}<ErrorNotice message={error} /></View>;
}
