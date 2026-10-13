import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { useDialog } from './Dialog';
import { MessageMarkdown } from './MessageMarkdown';
import { T } from './ui';
import { Dots } from './Loader';
import { errorMessage } from '../lib/harness';
import type { Frame } from '../lib/protocol';

/** A user-questions request is a plan review when its question carries `intent.kind === 'plan-review'` (dsh-plan-mode). */
export function planReviewOf(frame: Frame): { id: string; plan: string; approve: string } | null {
  const q = (frame.request?.questions ?? []).find((x: any) => x?.intent?.kind === 'plan-review');
  return q ? { id: String(q.id), plan: String(q.detail ?? ''), approve: String(q.intent.approve ?? 'Approve') } : null;
}

/**
 * Plan review card (Web UI parity): the submitted plan rendered as Markdown, then
 * Approve (leave plan mode and carry it out) or Keep Planning with optional feedback
 * written in the multi-line editor.
 */
export function PlanReview({ frame }: { frame: Frame }) {
  const { client, dismiss, colors } = useApp(); const dialog = useDialog(); const { height } = useWindowDimensions();
  const review = planReviewOf(frame)!;
  const [busy, setBusy] = useState<'' | 'approve' | 'keep'>(''); const [error, setError] = useState(''); const [expanded, setExpanded] = useState(false);
  const title = /^#\s+(.+)$/m.exec(review.plan)?.[1]?.trim() ?? 'Plan';
  // The header already shows the plan's first heading; don't repeat it in the body.
  const body = review.plan.replace(/^\s*#\s+.+\n?/, '').trimStart();
  const send = async (kind: 'approve' | 'keep', feedback?: string) => {
    if (!client) return; setBusy(kind); setError('');
    const answer = kind === 'approve' ? { id: review.id, selected: [review.approve] } : { id: review.id, selected: ['Keep planning'], ...(feedback ? { custom: feedback } : {}) };
    try { await client.answer(frame.eventId, { answers: [answer] }, frame.clientId); dismiss(frame.eventId); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };
  const keep = async () => {
    const feedback = await dialog.prompt({ title: 'Keep Planning', message: 'Tell the agent what to change. Leave it as is to just ask for a revision.', placeholder: 'What should change in the plan?', confirm: 'Send Feedback', multiline: true, optional: true });
    if (feedback !== null) await send('keep', feedback);
  };
  return <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.grouped, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
      <Ionicons name="map-outline" size={16} color={colors.primary} />
      <View style={{ flex: 1 }}><T style="caption2" color="secondary">Plan review</T><T style="footnote" weight="600" numberOfLines={2} styleOverride={{ fontSize: 14 }}>{title}</T></View>
    </View>
    <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
    <ScrollView nestedScrollEnabled style={{ maxHeight: expanded ? height * 0.6 : height * 0.32 }} contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <MessageMarkdown text={body} />
    </ScrollView>
    <Pressable accessibilityRole="button" onPress={() => setExpanded(v => !v)} style={{ alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <T style="caption1" color="secondary">{expanded ? 'Show less' : 'Show more'}</T><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.tertiary} />
    </Pressable>
    {error ? <View style={{ paddingHorizontal: 14 }}><T style="caption1" color="danger">{error}</T></View> : null}
    <View style={{ flexDirection: 'row', gap: 8, padding: 12, paddingTop: 6 }}>
      <Action label="Keep Planning" icon="create-outline" busy={busy === 'keep'} disabled={!!busy || !client} onPress={() => void keep()} />
      <Action label="Approve" icon="checkmark" primary busy={busy === 'approve'} disabled={!!busy || !client} onPress={() => void send('approve')} />
    </View>
  </View>;
}

function Action({ label, icon, primary, busy, disabled, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; primary?: boolean; busy?: boolean; disabled?: boolean; onPress: () => void }) {
  const { colors } = useApp(); const fg = primary ? colors.bg : colors.text;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 20, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.text : colors.fill, borderWidth: primary ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border, opacity: disabled && !busy ? 0.45 : pressed ? 0.7 : 1 })}>
    {busy ? <Dots size="sm" color={fg} /> : <Ionicons name={icon} size={16} color={fg} />}
    <T style="footnote" weight="600" color={fg} styleOverride={{ fontSize: 14 }}>{label}</T>
  </Pressable>;
}
