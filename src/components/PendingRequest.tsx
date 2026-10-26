import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Frame } from '../lib/protocol';
import { errorMessage } from '../lib/harness';
import { Button, ErrorNotice, Field, Label } from './ui';
import { Disclosure } from './Disclosure';

/**
 * Agent questions and approvals. Answers go back on the live connection's `$events/result`, tied to the
 * connection id that received the request. If that connection drops (common on a tunnel) the Harness
 * re-sends the same request on the new connection; the answer must then be sent again with the new id.
 * So a submit never just waits (client.answer gives up after 15 s), the choices are kept, and the answer
 * is re-sent automatically when the request is replayed.
 */

export function PendingRequest({ frame }: { frame: Frame }) {
  const { client, dismiss, colors, status } = useApp();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, string[]>>({}); const [custom, setCustom] = useState<Record<string, string>>({});
  const questions: any[] = frame.request?.questions ?? [];
  const approval = frame.event === 'approval/request';
  // The last answer the user chose: re-sent automatically if the request is replayed on a new connection.
  const intended = useRef<unknown>(undefined);

  const send = async (value: unknown) => {
    if (!client) { setError('Not connected. Your answer will be sent when the connection is back.'); return; }
    intended.current = value; setBusy(true); setError('');
    try {
      await client.answer(frame.eventId, value, frame.clientId);
      intended.current = undefined;
      dismiss(frame.eventId);
    } catch (e) {
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };

  // Replayed on a new connection (new clientId) or reconnected: deliver the answer the user already chose.
  const sentFor = useRef('');
  useEffect(() => {
    if (intended.current === undefined || status !== 'connected' || !frame.clientId || sentFor.current === frame.clientId) return;
    sentFor.current = frame.clientId;
    void send(intended.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.clientId, status]);

  const toggle = (q: any, label: string) => {
    setCustom(c => ({ ...c, [q.id]: '' }));
    setSelected(p => {
      const cur = p[q.id] ?? [];
      return { ...p, [q.id]: q.multi_select ? (cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label]) : [label] };
    });
  };
  const complete = questions.every(q => (selected[q.id]?.length ?? 0) > 0 || !!custom[q.id]?.trim());
  const submit = () => void send({ answers: questions.map(q => ({ id: q.id, selected: selected[q.id] ?? [], ...(custom[q.id]?.trim() ? { custom: custom[q.id].trim() } : {}) })) });

  return <View style={{ padding: 16, gap: 12, borderRadius: 14, borderWidth: 0.5, borderColor: colors.glassEdge, boxShadow: `inset 0 1px 0 ${colors.rim}`, backgroundColor: colors.card }}>
    <Label size={17} weight="600">{approval ? 'Allow This Action?' : 'Input Needed'}</Label>
    {approval ? <>
      <Disclosure title="Review request" text={JSON.stringify(frame.request, null, 2)} />
      <Button title="Allow Once" loading={busy} onPress={() => void send('allowed-once')} />
      <Button title="Don’t Allow" secondary destructive disabled={busy} onPress={() => void send('rejected')} />
    </> : questions.length ? <>
      {questions.map(q => <View key={q.id} style={{ gap: 8 }}>
        <Label>{q.question}</Label>
        {q.multi_select ? <Label size={12} muted>Choose one or more</Label> : null}
        {(q.options ?? []).map((o: any) => {
          const on = (selected[q.id] ?? []).includes(o.label);
          return <Pressable key={o.label} disabled={busy} onPress={() => toggle(q, o.label)}
            accessibilityRole={q.multi_select ? 'checkbox' : 'radio'} accessibilityState={{ checked: on, disabled: busy }}
            style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
              borderWidth: on ? 2 : 1, borderColor: on ? colors.text : colors.border,
              backgroundColor: on ? colors.state : pressed ? colors.fill : colors.panel, opacity: busy && !on ? 0.5 : 1 })}>
            {/* A clear radio / checkbox mark: filled with a tick when chosen. */}
            <View style={{ width: 22, height: 22, borderRadius: q.multi_select ? 6 : 11, borderWidth: 2, borderColor: on ? colors.text : colors.tertiary, backgroundColor: on ? colors.text : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <Ionicons name="checkmark" size={15} color={colors.bg} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Label size={15} weight={on ? '600' : undefined}>{o.label}</Label>
              {o.description ? <Label size={13} muted>{o.description}</Label> : null}
            </View>
          </Pressable>;
        })}
        <Field label="Other answer" value={custom[q.id] ?? ''} editable={!busy} onChangeText={v => { setCustom(c => ({ ...c, [q.id]: v })); if (!q.multi_select) setSelected(p => ({ ...p, [q.id]: [] })); }} />
      </View>)}
      <Button title={busy ? 'Sending…' : 'Submit'} loading={busy} disabled={!complete} onPress={submit} />
    </> : <Disclosure title={frame.event} text={JSON.stringify(frame.request, null, 2)} />}
    <ErrorNotice message={error} />
  </View>;
}
