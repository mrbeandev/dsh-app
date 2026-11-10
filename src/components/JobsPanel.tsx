import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { useDialog } from './Dialog';
import { Sheet } from './Sheet';
import { T } from './ui';
import { CopyButton } from './CopyButton';
import { errorMessage } from '../lib/harness';
import { appendOutput, isLive, jobStatusText, shortLabel, sortJobs, stripAnsi, type JobChunk, type JobView } from '../lib/jobs';
import { relativeTime } from '../lib/time';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** Live list of this session's background jobs (job/list stream). Empty on Harnesses without jobs. */
export function useJobs(sessionId: string) {
  const { client } = useApp();
  const [state, setState] = useState<{ key: string; jobs: JobView[] }>({ key: '', jobs: [] });
  const key = `${client?.connection.url ?? ''}:${sessionId}`;
  useEffect(() => {
    if (!client || !sessionId) return;
    const stop = client.follow('job/list', { request: { sessionId } }, f => {
      if ((f as any).type === 'rows' && Array.isArray((f as any).jobs)) setState({ key, jobs: sortJobs((f as any).jobs) });
      // stream-error (e.g. endpoint missing on Harness 0.2.0): just no jobs.
    });
    return () => stop();
  }, [client, sessionId, key]);
  return state.key === key ? state.jobs : [];
}

/** Compact chip above the message box: "2 background jobs running" (hidden when there are none). */
export function JobsChip({ sessionId }: { sessionId: string }) {
  const { colors } = useApp();
  const jobs = useJobs(sessionId);
  const [open, setOpen] = useState(false);
  const live = jobs.filter(isLive).length;
  if (!jobs.length) return null;
  const label = live ? `${live} background ${live === 1 ? 'job' : 'jobs'} running` : `${jobs.length} background ${jobs.length === 1 ? 'job' : 'jobs'} finished`;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Show jobs`} onPress={() => setOpen(true)}
      style={({ pressed }) => ({ marginHorizontal: 12, marginBottom: 6, height: 34, paddingHorizontal: 12, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border })}>
      <Ionicons name="pulse-outline" size={15} color={live ? colors.live : colors.muted} />
      <T style="caption1" weight="600" styleOverride={{ flex: 1 }} numberOfLines={1}>{label}</T>
      <Ionicons name="chevron-up" size={14} color={colors.muted} />
    </Pressable>
    <JobsSheet sessionId={sessionId} jobs={jobs} visible={open} onClose={() => setOpen(false)} />
  </>;
}

function JobsSheet({ sessionId, jobs, visible, onClose }: { sessionId: string; jobs: JobView[]; visible: boolean; onClose: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = useMemo(() => jobs.find(j => j.id === openId) ?? null, [jobs, openId]);
  return <Sheet visible={visible} onClose={() => { setOpenId(null); onClose(); }} title={selected ? shortLabel(selected.label, selected.id, 60) : 'Background Jobs'} height={0.85}>
    {selected ? <JobDetail sessionId={sessionId} job={selected} onBack={() => setOpenId(null)} />
      : <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24, gap: 6 }}>
          {jobs.map(j => <JobRow key={j.id} job={j} onPress={() => setOpenId(j.id)} />)}
        </ScrollView>}
  </Sheet>;
}

function JobRow({ job, onPress }: { job: JobView; onPress: () => void }) {
  const { colors } = useApp();
  const live = isLive(job);
  const tint = live ? colors.live : job.status === 'failed' ? colors.danger : colors.muted;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${shortLabel(job.label, job.id)}, ${jobStatusText(job)}`} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border })}>
    <Ionicons name={live ? 'radio-button-on' : job.status === 'failed' ? 'close-circle' : job.status === 'killed' ? 'stop-circle' : 'checkmark-circle'} size={16} color={tint} />
    <View style={{ flex: 1 }}>
      <T style="footnote" weight="600" numberOfLines={1}>{shortLabel(job.label, job.id)}</T>
      <T style="caption2" color="secondary" numberOfLines={1}>{`${jobStatusText(job)} · ${relativeTime(live ? job.startedAt : job.finishedAt ?? job.startedAt)}`}</T>
    </View>
    <Ionicons name="chevron-forward" size={15} color={colors.muted} />
  </Pressable>;
}

/** One job: live output (job/follow) with a Stop button while it runs. */
function JobDetail({ sessionId, job, onBack }: { sessionId: string; job: JobView; onBack: () => void }) {
  const { client, colors } = useApp(); const dialog = useDialog();
  const [stream, setStream] = useState<{ id: string; out: string }>({ id: '', out: '' }); const [error, setError] = useState(''); const [stopping, setStopping] = useState(false);
  const out = stream.id === job.id ? stream.out : '';
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (!client) return;
    const stop = client.follow('job/follow', { request: { sessionId, jobId: job.id } }, f => {
      const fr = f as any;
      if (fr.type === 'output' && Array.isArray(fr.chunks)) setStream(prev => ({ id: job.id, out: appendOutput(prev.id === job.id ? prev.out : '', fr.chunks as JobChunk[]) }));
      else if (fr.type === 'stream-error') setError(fr.error?.message ?? 'Output stream ended.');
    });
    return () => stop();
  }, [client, sessionId, job.id]);
  const kill = async () => {
    if (!client) return;
    if (!(await dialog.confirm({ title: 'Stop This Job?', message: shortLabel(job.label, job.id, 140), confirm: 'Stop', destructive: true, icon: 'stop-circle-outline' }))) return;
    setStopping(true); setError('');
    try { await client.request('job/kill', { sessionId, jobId: job.id }); } catch (e) { setError(errorMessage(e)); } finally { setStopping(false); }
  };
  const text = stripAnsi(out);
  return <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to jobs" onPress={onBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        <Ionicons name="chevron-back" size={16} color={colors.muted} /><T style="caption1" color="secondary">All jobs</T>
      </Pressable>
      <T style="caption1" color={isLive(job) ? colors.live : 'secondary'} styleOverride={{ flex: 1 }} align="right" numberOfLines={1}>{jobStatusText(job)}</T>
      {text ? <CopyButton value={text} label="Copy output" /> : null}
    </View>
    {job.label && job.label.trim() !== shortLabel(job.label, job.id).replace(/ …$/, '') ? <CommandBlock text={job.label} /> : null}
    <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} style={{ flex: 1, borderRadius: 10, backgroundColor: colors.dark ? '#000' : colors.grouped }} contentContainerStyle={{ padding: 10 }}>
      <T selectable styleOverride={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 16 }} color="secondary">{text || (isLive(job) ? 'Waiting for output…' : 'No output.')}</T>
    </ScrollView>
    {error ? <T style="caption1" color="danger">{error}</T> : null}
    {isLive(job) ? <Pressable accessibilityRole="button" accessibilityLabel="Stop job" disabled={stopping || job.status === 'stopping'} onPress={() => void kill()}
      style={({ pressed }) => ({ height: 44, borderRadius: 11, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.danger, opacity: stopping || job.status === 'stopping' ? 0.5 : pressed ? 0.7 : 1 })}>
      <Ionicons name="stop-circle-outline" size={18} color={colors.danger} /><T style="footnote" weight="600" color="danger">{job.status === 'stopping' || stopping ? 'Stopping…' : 'Stop Job'}</T>
    </Pressable> : null}
  </View>;
}

/** The job's full command, collapsed to 2 lines; tap to expand (scrolls when long) and copy it. */
function CommandBlock({ text }: { text: string }) {
  const { colors } = useApp(); const [open, setOpen] = useState(false);
  return <View style={{ borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.panel, maxHeight: open ? 220 : undefined }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 4, paddingTop: 4 }}>
      <T style="caption2" color="secondary" weight="600" styleOverride={{ flex: 1, letterSpacing: 0.4 }}>COMMAND</T>
      <CopyButton value={text} label="Copy command" />
    </View>
    {open ? <ScrollView nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8 }}>
        <T selectable styleOverride={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 16 }} color="secondary">{text}</T>
      </ScrollView>
      : <Pressable accessibilityRole="button" accessibilityLabel="Show full command" onPress={() => setOpen(true)} style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
          <T numberOfLines={2} styleOverride={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 16 }} color="secondary">{text}</T>
          <T style="caption2" color="tertiary">Tap to show all</T>
        </Pressable>}
    {open ? <Pressable accessibilityRole="button" accessibilityLabel="Collapse command" onPress={() => setOpen(false)} style={{ paddingHorizontal: 10, paddingBottom: 6 }}><T style="caption2" color="tertiary">Show less</T></Pressable> : null}
  </View>;
}
