import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';
import { relativeTime } from '../lib/time';
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
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: colors.fill, opacity: pressed ? 0.6 : 1 })}>
    <Ionicons name="git-branch-outline" size={11} color={working ? colors.live : colors.muted} />
    <T style="caption2" color={working ? colors.live : 'secondary'} styleOverride={{ fontVariant: ['tabular-nums'] }}>{String(countTree(nodes))}</T>
    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={10} color={colors.tertiary} />
  </Pressable>;
});

export function SubagentBranches({ nodes, live, onOpen }: { nodes: SubagentNode[]; live: boolean; onOpen: (node: SubagentNode) => void }) {
  return <View>{nodes.map(n => <Branch key={n.session.sessionId} node={n} live={live} onOpen={onOpen} />)}</View>;
}

function Branch({ node, live, onOpen }: { node: SubagentNode; live: boolean; onOpen: (node: SubagentNode) => void }) {
  const { colors } = useApp(); const [open, setOpen] = useState(false);
  const active = node.session.running && live;
  return <View style={{ marginLeft: 12, paddingLeft: 8, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: colors.separator }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Subagent ${node.label}${node.mode === 'one-shot' ? ', one-shot' : ''}${active ? ', working' : ''}`} onPress={() => onOpen(node)}
      style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 9, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? colors.live : 'transparent' }} />
      <Ionicons name={node.mode === 'continuable' ? 'chatbubbles-outline' : 'flash-outline'} size={12} color={colors.muted} />
      <T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 12.5 }}>{node.label}</T>
      <SubagentToggle nodes={node.children} open={open} onToggle={() => setOpen(v => !v)} />
      <T style="caption2" color="tertiary">{relativeTime(node.session.updatedAt)}</T>
    </Pressable>
    {open && node.children.length ? <SubagentBranches nodes={node.children} live={live} onOpen={onOpen} /> : null}
  </View>;
}
