import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/app';
import { useDialog } from './Dialog';
import { useActionMenu } from './ActionMenu';
import { Row, Section, T } from './ui';
import { errorMessage } from '../lib/harness';
import { deleteSchedule, listSchedules, scheduleRule, updateSchedule, type Schedule } from '../lib/schedules';
import { untilTime } from '../lib/time';

/**
 * "Reminders" in Session Details: the session's scheduled tasks, with Rename / Edit instruction /
 * Delete. Hidden when there are none or the Harness has no scheduler (0.2.0).
 */
export function ScheduleSection({ sessionId }: { sessionId: string }) {
  const { client } = useApp(); const dialog = useDialog(); const menu = useActionMenu();
  const [list, setList] = useState<Schedule[] | null>(null); const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!client) return;
    try { setList(await listSchedules(client, sessionId)); setError(''); }
    catch { setList([]); } // Harness without the reminders feature
  }, [client, sessionId]);
  useEffect(() => {
    if (!client) return; let live = true;
    listSchedules(client, sessionId)
      .then(r => { if (live) setList(r); })
      .catch(() => { if (live) setList([]); }); // Harness without the reminders feature
    return () => { live = false; };
  }, [client, sessionId]);

  const update = async (s: Schedule, patch: { title?: string; prompt?: string }) => {
    if (!client) return;
    try { await updateSchedule(client, sessionId, s, patch); await load(); }
    catch (e) { setError(errorMessage(e)); await load(); }
  };
  const actions = (s: Schedule) => menu({
    title: s.title,
    actions: [
      { label: 'Rename', icon: 'create-outline', onPress: async () => { const t = await dialog.prompt({ title: 'Rename Reminder', initial: s.title, placeholder: 'Name', confirm: 'Save' }); if (t && t.trim() && t.trim() !== s.title) await update(s, { title: t.trim().slice(0, 120) }); } },
      { label: 'Edit Instruction', icon: 'document-text-outline', onPress: async () => { const p = await dialog.prompt({ title: 'Reminder Instruction', initial: s.prompt, placeholder: 'What the agent should do', confirm: 'Save', multiline: true }); if (p && p.trim() && p.trim() !== s.prompt) await update(s, { prompt: p.trim() }); } },
      { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: async () => {
        if (!client || !(await dialog.confirm({ title: 'Delete Reminder?', message: s.title, confirm: 'Delete', destructive: true, icon: 'trash-outline' }))) return;
        try { await deleteSchedule(client, sessionId, s); await load(); } catch (e) { setError(errorMessage(e)); }
      } },
    ],
  });

  if (!list?.length && !error) return null;
  return <Section header="Reminders" footer="Tasks the agent scheduled for itself in this session. They run even while the app is closed.">
    {(list ?? []).map(s => <Row key={s.id} icon="alarm-outline" title={s.title} subtitle={`${scheduleRule(s)} · ${untilTime(s.scheduledAt)}`} onPress={() => actions(s)} />)}
    {error ? <T style="caption1" color="danger">{error}</T> : null}
  </Section>;
}
