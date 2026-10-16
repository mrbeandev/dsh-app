import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { ModelPicker } from './ModelPicker';
import { Glass } from './Glass';
import { T, slop, type } from './ui';
import { ImportPicker } from './ImportPicker';
import type { ImportCategory, ImportItem } from '../lib/imports';

/**
 * Floating glass composer, as in the approved prototype (screen 02):
 * slim pill · growing text field · off-white circular send, with a quiet ✧ model selector beneath.
 */
export function ChatComposer({ sessionId, draft, onChange, onSend, onStop, running, busy, disabled, imports = [], onImport, onRemoveImport, onRetryImport }: { sessionId: string; draft: string; onChange: (v: string) => void; onSend: (mode?: 'queue' | 'steer') => void; onStop: () => void; running: boolean; busy: boolean; disabled: boolean; imports?: ImportItem[]; onImport?: (category: ImportCategory) => void; onRemoveImport?: (id: string) => void; onRetryImport?: (id: string) => void }) {
  const { colors, sessions } = useApp(); const [picker, setPicker] = useState(false); const [chosen, setChosen] = useState('');
  const selection = sessions.find(s => s.sessionId === sessionId)?.projections?.values.modelSelection as any;
  const model: string = chosen || (selection?.next ?? selection?.lastUsed)?.model || '';
  const [importOpen, setImportOpen] = useState(false);
  const stop = running && !draft.trim() && !imports.length;
  const canSend = !busy && !disabled && (stop || (imports.every(i => i.state === 'ready') && (!!draft.trim() || !!imports.length)));
  return <>
    <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>
      {imports.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 6 }}>{imports.map(i => <View key={i.id} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, padding: 7, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 0.5, borderColor: i.state === 'error' ? colors.danger : colors.border }}>
        <Ionicons name={i.image ? 'image-outline' : 'document-outline'} size={14} color={colors.muted} />
        <T style="caption1" numberOfLines={1} styleOverride={{ maxWidth: 160 }}>{i.name}</T>
        {i.state === 'uploading' ? <T style="caption2" color="secondary">{`Uploading ${Math.round(i.progress * 100)}%`}</T> : null}
        {i.state === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${i.name}: ${i.error}`} onPress={() => onRetryImport?.(i.id)} hitSlop={6}><T style="caption1" color="danger">Retry</T></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`} onPress={() => onRemoveImport?.(i.id)} hitSlop={6}><Ionicons name="close" size={15} color={colors.muted} /></Pressable>
      </View>)}</View> : null}
      <Glass radius={14} depth="card" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 14, paddingRight: 4, paddingVertical: 4 }}>
        {onImport ? <Pressable accessibilityRole="button" accessibilityLabel="Import files" disabled={disabled} onPress={() => setImportOpen(true)} hitSlop={slop(34)} style={{ width: 30, height: 34, marginRight: 6, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}><Ionicons name="add" size={22} color={colors.muted} /></Pressable> : null}
        <TextInput accessibilityLabel="Message" value={draft} onChangeText={onChange} multiline placeholder={disabled ? 'Reconnect to send…' : 'Ask anything…'} placeholderTextColor={colors.muted} editable={!disabled} style={[type.subhead, { fontSize: 13, lineHeight: 18, flex: 1, color: colors.text, minHeight: 36, maxHeight: 132, paddingHorizontal: 0, paddingTop: 8, paddingBottom: 8, textAlignVertical: 'top' }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={stop ? 'Stop' : running ? 'Queue message' : 'Send'} accessibilityHint={running && !stop ? 'Long-press to steer: deliver at the agent’s next step instead of after this turn' : undefined} disabled={!canSend} onPress={stop ? onStop : () => onSend('queue')} onLongPress={running && !stop ? () => onSend('steer') : undefined} delayLongPress={350} hitSlop={slop(34)} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 8, marginLeft: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.state : 'transparent', opacity: pressed ? 0.7 : 1 })}><Ionicons name={stop ? 'stop' : 'arrow-up'} size={stop ? 12 : 19} color={canSend ? (stop ? colors.muted : colors.text) : colors.tertiary} /></Pressable>
      </Glass>
      {running && draft.trim() ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 3 }}>Send queues after this turn · hold Send to steer now</T> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={model ? `Model: ${model}. Change model` : 'Choose model'} onPress={() => setPicker(true)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 30, marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.5 : 1 })}>
        <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
        <T style="caption1" color="secondary" numberOfLines={1}>{model || 'Choose model'}</T>
        <Ionicons name="chevron-down" size={10} color={colors.muted} />
      </Pressable>
    </View>
    <ImportPicker visible={importOpen} onClose={() => setImportOpen(false)} onSelect={c => onImport?.(c)} />
    <ModelPicker sessionId={sessionId} visible={picker} onClose={() => setPicker(false)} onSelected={setChosen} current={model} />
  </>;
}
