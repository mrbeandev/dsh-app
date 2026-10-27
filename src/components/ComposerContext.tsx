import { useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { useDialog } from './Dialog';
import { T } from './ui';
import { errorMessage } from '../lib/harness';
import { paneFinish } from '../lib/solidGlass';


type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type QueueItem = { id: string; text: string; editable: boolean; content: any[] };

/** One inbox message (wire JSON) → its id and visible text. Non-text parts (images) block editing. */
export function toQueueItem(m: any): QueueItem | null {
  const id = typeof m?.id === 'string' ? m.id : '';
  if (!id) return null;
  const blocks: any[] = Array.isArray(m.content) ? m.content : [];
  const text = blocks.filter(b => b?.type === 'text').map(b => String(b.text ?? '')).join('\n').trim();
  const editable = blocks.length > 0 && blocks.every(b => b?.type === 'text');
  const others = blocks.length - blocks.filter(b => b?.type === 'text').length;
  return { id, text: text || (others ? `${others} attachment${others === 1 ? '' : 's'}` : '(empty)'), editable, content: blocks };
}
type Todo = { content?: string; status?: string; activeForm?: string };
type GoalProjection = { goal?: { id: string; revision: number; objective: string; phase: 'active' | 'paused' | 'blocked' | 'complete'; blockedReason?: { message?: string } }; roundsStarted?: number } | null;

/**
 * The Web UI's composer-context stack, in its order: Todo → Goal → Queue → Plan → Questions.
 * Each card is one slim row above the composer; Todo expands into a checklist (accordion).
 * Driven by `session/projections`; goal actions use the official goals/* RPCs (CAS by revision).
 */
export function ComposerContext({ sessionId, values, running = true, onRestore }: { sessionId: string; values: Record<string, any>; running?: boolean; onRestore?: (text: string) => void }) {
  const todos: Todo[] = Array.isArray(values.todos?.items) ? values.todos.items : Array.isArray(values.todos) ? values.todos : [];
  const goal = (values.goal as GoalProjection)?.goal;
  // Harness inbox: next-turn = queued (waits for the turn to end); next-step = steering (delivered at
  // the agent's next step boundary). Both are durable on the Harness, so they survive navigation.
  const queued: QueueItem[] = (values.inbox?.['next-turn'] ?? []).map(toQueueItem).filter(Boolean) as QueueItem[];
  const steering: QueueItem[] = (values.inbox?.['next-step'] ?? []).map(toQueueItem).filter(Boolean) as QueueItem[];
  const queue = [...queued, ...steering];
  const plan = values.plan as { active?: boolean; pending?: boolean } | undefined;
  const questions = values.userQuestions?.active?.length ?? 0;
  const showTodos = todos.length > 0 && todos.some(t => t.status !== 'completed');
  const showGoal = !!goal && goal.phase !== 'complete';
  if (!showTodos && !showGoal && !queue.length && !plan?.active && !questions) return null;
  return <View style={{ gap: 4, paddingHorizontal: 10, paddingBottom: 4 }}>
    {showTodos ? <TodoCard todos={todos} /> : null}
    {showGoal ? <GoalCard sessionId={sessionId} goal={goal!} rounds={(values.goal as GoalProjection)?.roundsStarted ?? 0} /> : null}
    {queue.length ? <QueueDock sessionId={sessionId} queued={queued} steering={steering} running={running} onRestore={onRestore} /> : null}
    {plan?.active ? <Card icon="map-outline" label="Plan mode" text={plan.pending ? 'A plan is waiting for your review' : 'The agent will propose a plan before acting'} /> : null}
    {questions ? <Card icon="help-circle-outline" label="Question" text={`The agent is waiting for ${questions === 1 ? 'your answer' : `${questions} answers`}`} tint="warning" /> : null}
  </View>;
}

/**
 * Run a queued message now while the agent is idle. The Harness keeps queued messages after Stop
 * (session/cancel keeps the inbox) but doesn't start a turn for them; prompting the head message
 * wakes the agent, and the Harness then runs the remaining queued messages as the following turns.
 * Removed first so it can't run twice; if the prompt fails the caller gets the text back.
 */
export async function runQueuedNow(client: { request: (m: string, p: any) => Promise<any> }, sessionId: string, item: { id: string; content: any[] }) {
  await client.request('session/updateQueue', { sessionId, itemId: item.id, action: { kind: 'remove' } });
  await client.request('session/prompt', { requestId: randomUUID(), sessionId, mode: 'queue', content: item.content, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

/**
 * Take a steering message back. The Harness has no "unsteer": a pending item (queued or steering) can be
 * removed, so it's removed and its exact content re-submitted as an ordinary queued prompt. Removal
 * fails with `session/queue-item-not-found` once the agent has already consumed it — then nothing changes.
 */
export async function unsteerToQueue(client: { request: (m: string, p: any) => Promise<any> }, sessionId: string, item: { id: string; content: any[] }) {
  await client.request('session/updateQueue', { sessionId, itemId: item.id, action: { kind: 'remove' } });
  await client.request('session/prompt', { requestId: randomUUID(), sessionId, mode: 'queue', content: item.content, clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
}

/**
 * Web UI QueueDock parity: lists messages waiting in the Harness inbox. Queued ones can be
 * steered (deliver at the agent's next step instead of after the turn), edited, or removed —
 * all through the official `session/updateQueue` RPC, so the web UI sees the same queue.
 */
function QueueDock({ sessionId, queued, steering, running, onRestore }: { sessionId: string; queued: QueueItem[]; steering: QueueItem[]; running: boolean; onRestore?: (text: string) => void }) {
  const { client, colors } = useApp(); const dialog = useDialog();
  const [open, setOpen] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const act = async (itemId: string, action: Record<string, unknown>) => {
    if (!client || busy) return; setBusy(itemId); setError('');
    try { await client.request('session/updateQueue', { sessionId, itemId, action }); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };
  const sendNow = async (q: QueueItem) => {
    if (!client || busy) return; setBusy(q.id); setError('');
    try { await runQueuedNow(client, sessionId, q); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };
  const gone = (e: unknown) => /no longer pending|queue-item-not-found/i.test(String((e as any)?.code ?? '') + ' ' + String((e as Error)?.message ?? ''));
  const toQueue = async (q: QueueItem) => {
    if (!client || busy) return; setBusy(q.id); setError('');
    try { await unsteerToQueue(client, sessionId, q); }
    catch (e) { setError(gone(e) ? 'Too late — the agent already received this message.' : errorMessage(e)); } finally { setBusy(''); }
  };
  const toInput = async (q: QueueItem) => {
    if (!client || busy || !onRestore) return; setBusy(q.id); setError('');
    try { await client.request('session/updateQueue', { sessionId, itemId: q.id, action: { kind: 'remove' } }); onRestore(q.text); }
    catch (e) { setError(gone(e) ? 'Too late — the agent already received this message.' : errorMessage(e)); } finally { setBusy(''); }
  };
  const edit = async (q: QueueItem) => {
    const text = await dialog.prompt({ title: 'Edit Queued Message', initial: q.text, placeholder: 'Message', confirm: 'Save', multiline: true });
    if (text && text.trim() && text !== q.text) await act(q.id, { kind: 'edit', content: [{ type: 'text', text: text.trim() }] });
  };
  const remove = async (q: QueueItem) => {
    if (await dialog.confirm({ title: 'Remove Queued Message?', message: q.text.length > 140 ? `${q.text.slice(0, 140)}…` : q.text, confirm: 'Remove', destructive: true, icon: 'trash-outline' })) await act(q.id, { kind: 'remove' });
  };
  const total = queued.length + steering.length;
  const summary = [queued.length ? `${queued.length} queued` : '', steering.length ? `${steering.length} steering` : ''].filter(Boolean).join(' · ');
  // Web UI QueueDock layout: header "N queued messages ⌄", then one line per message with
  // Edit · Delete · ↑ (steer) on the right.
  return <Shell>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${summary}. ${open ? 'Collapse' : 'Expand'}`} onPress={() => setOpen(o => !o)} style={s.row}>
      <Ionicons name="chatbox-ellipses-outline" size={15} color={colors.muted} />
      <View style={{ flex: 1 }}><T style="caption1" weight="600" numberOfLines={1} styleOverride={{ fontSize: 12.5 }}>{total === 1 ? '1 queued message' : `${total} queued messages`}{steering.length ? <T style="caption1" color={colors.primary} styleOverride={{ fontSize: 12.5 }}>{`  · ${steering.length} steering`}</T> : null}</T></View>
      <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={13} color={colors.tertiary} />
    </Pressable>
    {open ? <View>
      {[...steering.map(q => ({ q, steer: true })), ...queued.map(q => ({ q, steer: false }))].map(({ q, steer }) => <View key={q.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12, paddingRight: 4, minHeight: 38, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, opacity: busy === q.id ? 0.45 : 1 }}>
        {steer ? <Ionicons name="arrow-up" size={13} color={colors.primary} style={{ marginRight: 4 }} /> : null}
        <View style={{ flex: 1 }}><T style="caption1" numberOfLines={1} color={steer ? colors.primary : undefined} styleOverride={{ fontSize: 13 }}>{q.text}</T></View>
        {steer ? <>
          <T style="caption2" color={colors.primary} styleOverride={{ marginRight: 4 }}>Steering</T>
          {/* Still pending: take it back before the agent's next step picks it up. */}
          {onRestore && q.editable ? <QueueAction icon="create-outline" label="Back to message box" hint="Stop steering and put this text back in the message box to edit" onPress={() => void toInput(q)} disabled={!!busy} /> : null}
          <QueueAction icon="arrow-down" label="Back to queue" hint="Stop steering: deliver after this turn instead" onPress={() => void toQueue(q)} disabled={!!busy} />
        </> : <>
          {q.editable ? <QueueAction icon="create-outline" label="Edit" onPress={() => void edit(q)} disabled={!!busy} /> : null}
          <QueueAction icon="trash-outline" label="Delete" onPress={() => void remove(q)} disabled={!!busy} />
          {running ? <QueueAction icon="arrow-up" label="Steer now" hint="Deliver this message to the agent at its next step instead of after this turn" onPress={() => void act(q.id, { kind: 'steer' })} disabled={!!busy} />
            : <QueueAction icon="arrow-up" label="Send now" hint="The agent is idle: send this message as the next prompt" onPress={() => void sendNow(q)} disabled={!!busy} />}
        </>}
      </View>)}
      {error ? <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}><T style="caption2" color="danger">{error}</T></View> : null}
    </View> : null}
  </Shell>;
}

function QueueAction({ icon, label, hint, onPress, disabled, danger }: { icon: IconName; label: string; hint?: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} disabled={disabled} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}>
    <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.muted} />
  </Pressable>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { colors } = useApp();
  return <View style={[paneFinish(colors), { borderRadius: 14, overflow: 'hidden' }]}>{children}</View>;
}

function Card({ icon, label, text, tint }: { icon: IconName; label: string; text: string; tint?: 'warning' }) {
  const { colors } = useApp();
  return <Shell><View style={s.row}>
    <Ionicons name={icon} size={15} color={tint ? colors.warning : colors.muted} />
    <T style="caption1" weight="600" styleOverride={{ fontSize: 12.5 }}>{label}</T>
    <View style={{ flex: 1 }}><T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ fontSize: 12.5 }}>{text}</T></View>
  </View></Shell>;
}

function TodoCard({ todos }: { todos: Todo[] }) {
  const { colors } = useApp(); const [open, setOpen] = useState(false);
  const done = todos.filter(t => t.status === 'completed').length;
  const current = todos.find(t => t.status === 'in_progress') ?? todos.find(t => t.status !== 'completed');
  const toggle = () => { LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity')); setOpen(v => !v); };
  return <Shell>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`To-dos, ${done} of ${todos.length} done`} onPress={toggle} style={({ pressed }) => [s.row, { opacity: pressed ? 0.7 : 1 }]}>
      <Ionicons name="list-outline" size={15} color={colors.muted} />
      <T style="caption1" weight="600" styleOverride={{ fontSize: 12.5 }}>{`To-dos ${done}/${todos.length}`}</T>
      <View style={{ flex: 1 }}><T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ fontSize: 12.5 }}>{open ? '' : current?.activeForm || current?.content || ''}</T></View>
      <Ionicons name={open ? 'chevron-down' : 'chevron-up'} size={14} color={colors.tertiary} />
    </Pressable>
    {open ? <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 5 }}>
      {todos.map((t, i) => {
        const st = t.status === 'completed' ? 'done' : t.status === 'in_progress' ? 'doing' : 'todo';
        return <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name={st === 'done' ? 'checkmark-circle' : st === 'doing' ? 'ellipse' : 'ellipse-outline'} size={14} color={st === 'done' ? colors.live : st === 'doing' ? colors.primary : colors.tertiary} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}><T style="caption1" color={st === 'done' ? 'tertiary' : 'primary'} styleOverride={{ fontSize: 12.5, lineHeight: 17, textDecorationLine: st === 'done' ? 'line-through' : 'none' }}>{st === 'doing' && t.activeForm ? t.activeForm : t.content ?? ''}</T></View>
        </View>;
      })}
    </View> : null}
  </Shell>;
}

function GoalCard({ sessionId, goal, rounds }: { sessionId: string; goal: NonNullable<NonNullable<GoalProjection>['goal']>; rounds: number }) {
  const { client, colors } = useApp(); const dialog = useDialog();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const ref = { id: goal.id, revision: goal.revision };
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };
  const pause = () => run(() => client!.call('goals/pause', { agentId: sessionId, ref }));
  const resume = () => run(() => client!.call('goals/resume', { agentId: sessionId, ref }));
  const edit = async () => { const objective = await dialog.prompt({ title: 'Edit Goal', initial: goal.objective, placeholder: 'What should the agent achieve?', confirm: 'Save', multiline: true }); if (objective && objective !== goal.objective) await run(() => client!.call('goals/edit', { agentId: sessionId, ref, request: { objective } })); };
  const clear = async () => { if (await dialog.confirm({ title: 'Clear Goal?', message: 'The agent stops working toward this goal. The conversation is unchanged.', confirm: 'Clear', destructive: true, icon: 'flag-outline' })) await run(() => client!.call('goals/clear', { agentId: sessionId, ref })); };
  const active = goal.phase === 'active'; const blocked = goal.phase === 'blocked';
  const label = active ? 'Goal' : blocked ? 'Blocked Goal' : 'Paused Goal';
  return <Shell>
    <View style={s.row}>
      <Ionicons name={blocked ? 'alert-circle-outline' : 'flag-outline'} size={15} color={blocked ? colors.danger : active ? colors.primary : colors.muted} />
      <T style="caption1" weight="600" styleOverride={{ fontSize: 12.5 }}>{label}</T>
      <View style={{ flex: 1 }}><T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ fontSize: 12.5 }}>{goal.objective}</T></View>
      {client ? <>
        {active ? <Mini icon="pause" label="Pause goal" onPress={() => void pause()} disabled={busy} /> : <Mini icon="play" label="Resume goal" onPress={() => void resume()} disabled={busy} />}
        <Mini icon="create-outline" label="Edit goal" onPress={() => void edit()} disabled={busy} />
        <Mini icon="trash-outline" label="Clear goal" onPress={() => void clear()} disabled={busy} />
      </> : null}
    </View>
    {error || (blocked && goal.blockedReason?.message) ? <View style={{ paddingHorizontal: 12, paddingBottom: 7 }}><T style="caption2" color="danger">{error || goal.blockedReason?.message}</T></View> : rounds && active ? null : null}
  </Shell>;
}

function Mini({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}>
    <Ionicons name={icon} size={15} color={colors.muted} />
  </Pressable>;
}

const s = StyleSheet.create({ row: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 12, paddingRight: 6 } });
