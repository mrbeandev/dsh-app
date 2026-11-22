import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state/app';
import { T } from './ui';
import { relativeTime } from '../lib/time';
import { StatusBadge } from './StatusBadge';
import { anyRunning, countTree, type SubagentNode } from '../lib/subagents';

/**
 * Collapsed-by-default subagent tree under a thread row (up to 3 levels, see lib/subagents.ts).
 * The toggle shows how many subagents sit below and turns green while any of them is working.
 */
export const SubagentToggle = memo(function SubagentToggle({ nodes, open, onToggle }: { nodes: SubagentNode[]; open: boolean; onToggle: () => void }) {
  const { colors } = useApp();
  if (!nodes.length) return null;
  const working = anyRunning(nodes);
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${countTree(nodes)} subagents${working ? ', working' : ''}. ${open ? 'Hide' : 'Show'}`} hitSlop={8} onPress={onToggle}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, height: 22, borderRadius: 6, borderWidth: 0.5, borderColor: colors.glassEdge, boxShadow: `inset 0 1px 0 ${colors.rim}`, backgroundColor: open ? colors.state : colors.fill, opacity: pressed ? 0.6 : 1 })}>
    <Ionicons name="git-branch-outline" size={11} color={working ? colors.live : colors.muted} />
    <T style="caption2" color={working ? colors.live : 'secondary'} styleOverride={{ fontVariant: ['tabular-nums'] }}>{String(countTree(nodes))}</T>
    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={10} color={colors.tertiary} />
  </Pressable>;
});

/** Status of a subagent beyond "working": needs your answer / finished-unseen (same rules as sessions). */
export type BranchStatus = (sessionId: string) => { input: boolean; unseen: boolean };
const NO_STATUS: BranchStatus = () => ({ input: false, unseen: false });

export function SubagentBranches({ nodes, live, onOpen, status = NO_STATUS }: { nodes: SubagentNode[]; live: boolean; onOpen: (node: SubagentNode) => void; status?: BranchStatus }) {
  return <View>{nodes.map(n => <Branch key={n.session.sessionId} node={n} live={live} onOpen={onOpen} status={status} />)}</View>;
}

function Branch({ node, live, onOpen, status }: { node: SubagentNode; live: boolean; onOpen: (node: SubagentNode) => void; status: BranchStatus }) {
  const { colors } = useApp(); const [open, setOpen] = useState(false);
  const active = node.session.running && live;
  const { input, unseen } = status(node.session.sessionId);
  const kind = input ? 'input' : active ? 'working' : unseen ? 'unseen' : null;
  return <View style={{ marginLeft: 12, paddingLeft: 8, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Subagent ${node.label}${node.mode === 'one-shot' ? ', one-shot' : ''}${input ? ', needs input' : active ? ', working' : unseen ? ', finished, not seen yet' : ''}`} onPress={() => onOpen(node)}
      style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 9, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      {/* One slot: the animated status replaces the chat/one-shot icon when there is one. */}
      {kind ? <View style={{ width: 12, alignItems: 'center' }}><StatusBadge kind={kind} size={11} /></View>
        : <Ionicons name={node.mode === 'continuable' ? 'chatbubbles-outline' : 'flash-outline'} size={12} color={colors.muted} />}
      <T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 12.5 }}>{node.label}</T>
      <SubagentToggle nodes={node.children} open={open} onToggle={() => setOpen(v => !v)} />
      <T style="caption2" color="tertiary">{relativeTime(node.session.updatedAt)}</T>
    </Pressable>
    {open && node.children.length ? <SubagentBranches nodes={node.children} live={live} onOpen={onOpen} status={status} /> : null}
  </View>;
}
