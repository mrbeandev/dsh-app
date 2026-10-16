import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type ViewToken } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { Sheet } from './Sheet';
import { SearchField, T } from './ui';
import { Skeleton } from './Loader';
import { fetchTime, knownTime, promptTime, type OutlineEntry } from '../lib/promptIndex';

/**
 * Pinch-to-open list of every prompt in the thread (turnOutline): turn number, date/time,
 * prompt preview and a dimmed reply preview. Newest at the bottom, like the chat.
 * Times load only for rows on screen (one tiny page request each, memoised).
 */
export function PromptIndex({ sessionId, outline, visible, onClose, onJump }: { sessionId: string; outline: OutlineEntry[]; visible: boolean; onClose: () => void; onJump: (entry: OutlineEntry) => void }) {
  const { client } = useApp(); const [query, setQuery] = useState('');
  const [, bump] = useState(0);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? outline.filter(e => e.prompt.toLowerCase().includes(q) || e.response.toLowerCase().includes(q)) : outline;
  }, [outline, query]);
  const list = useRef<FlatList<OutlineEntry>>(null);
  const loadTimes = useCallback(({ viewableItems }: { viewableItems: ViewToken<OutlineEntry>[] }) => {
    if (!client) return;
    for (const v of viewableItems) { const e = v.item; if (e && knownTime(sessionId, e.seq) === undefined) void fetchTime(client, sessionId, e.seq).then(t => { if (t) bump(x => x + 1); }); }
  }, [client, sessionId]);
  // FlatList requires a stable onViewableItemsChanged; route through a ref updated in an effect.
  const latest = useRef(loadTimes);
  useEffect(() => { latest.current = loadTimes; }, [loadTimes]);
  const [onViewable] = useState(() => (info: { viewableItems: ViewToken<OutlineEntry>[] }) => latest.current(info));
  // Open on the newest prompt.
  useEffect(() => { if (visible && rows.length) setTimeout(() => list.current?.scrollToEnd({ animated: false }), 30); }, [visible, rows.length]);

  return <Sheet visible={visible} onClose={onClose} title="Prompts" height={0.82}>
    <View style={{ paddingHorizontal: 12, paddingBottom: 6, gap: 6 }}>
      <T style="caption1" color="secondary">{`${outline.length} prompt${outline.length === 1 ? '' : 's'} · tap one to jump to it`}</T>
      <SearchField value={query} onChangeText={setQuery} placeholder="Filter prompts" />
    </View>
    <FlatList ref={list} data={rows} keyExtractor={e => String(e.seq)}
      onViewableItemsChanged={onViewable} viewabilityConfig={{ itemVisiblePercentThreshold: 10, minimumViewTime: 120 }}
      initialNumToRender={20} windowSize={9}
      contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 24 }}
      ListEmptyComponent={<View style={{ padding: 24, alignItems: 'center' }}><T style="footnote" color="secondary">{query ? 'No prompts match.' : 'No prompts in this session yet.'}</T></View>}
      renderItem={({ item, index }) => <PromptRow entry={item} time={knownTime(sessionId, item.seq)} first={index === 0} onPress={() => { onClose(); setTimeout(() => onJump(item), 200); }} />} />
  </Sheet>;
}

const PromptRow = memo(function PromptRow({ entry, time, first, onPress }: { entry: OutlineEntry; time?: number; first: boolean; onPress: () => void }) {
  const { colors } = useApp();
  return <>
    {first ? null : <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 40 }} />}
    <Pressable accessibilityRole="button" accessibilityLabel={`Turn ${entry.turn}${time ? `, ${promptTime(time)}` : ''}: ${entry.prompt || 'no typed prompt (automatic turn or attachment)'}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10, backgroundColor: pressed ? colors.fill : 'transparent' })}>
      <View style={{ width: 24, alignItems: 'center', paddingTop: 1 }}><T style="caption2" color="tertiary" styleOverride={{ fontVariant: ['tabular-nums'] }}>{String(entry.turn)}</T></View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1 }}><T style="footnote" weight="500" numberOfLines={2} color={entry.prompt ? 'primary' : 'tertiary'} styleOverride={{ fontSize: 14, fontStyle: entry.prompt ? 'normal' : 'italic' }}>{entry.prompt || 'No typed prompt'}</T></View>
          {time ? <T style="caption2" color="tertiary">{promptTime(time)}</T> : <Skeleton width={58} height={8} />}
        </View>
        {entry.response ? <T style="caption1" color="tertiary" numberOfLines={1}>{entry.response}</T> : null}
      </View>
      <Ionicons name="chevron-forward" size={13} color={colors.tertiary} style={{ marginTop: 3 }} />
    </Pressable>
  </>;
});
