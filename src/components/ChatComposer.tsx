import { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { ModelPicker } from './ModelPicker';
import { Glass } from './Glass';
import { T, type } from './ui';
import { ImportPicker } from './ImportPicker';
import type { ImportCategory, ImportItem } from '../lib/imports';
import { useModelLabel } from '../lib/modelNames';
import type { ModelChoice } from './ModelPicker';
import { diagnostic } from '../lib/diagnostics';
import { useLayoutDiagnostics } from '../lib/useLayoutDiagnostics';

/**
 * Floating glass composer, as in the approved prototype (screen 02):
 * slim pill · growing text field · off-white circular send, with a quiet ✧ model selector beneath.
 */
/** Toolbar targets grow sideways/downwards only, never up into the text field above them. */
const DOWN_SLOP = { top: 0, bottom: 8, left: 4, right: 4 };

export function ChatComposer({ sessionId, draft, onChange, onSend, onStop, running, busy, disabled, offline = false, imports = [], onImport, onRemoveImport, onRetryImport }: { sessionId: string; draft: string; onChange: (v: string) => void; onSend: (mode?: 'queue' | 'steer') => void; onStop: () => void; running: boolean; busy: boolean; disabled: boolean; offline?: boolean; imports?: ImportItem[]; onImport?: (category: ImportCategory) => void; onRemoveImport?: (id: string) => void; onRetryImport?: (id: string) => void }) {
  const { colors, sessions, client } = useApp(); const [picker, setPicker] = useState(false); const [chosen, setChosen] = useState<ModelChoice | null>(null);
  const diagnosticRef = useLayoutDiagnostics('composer.bounds');
  const selection = sessions.find(s => s.sessionId === sessionId)?.projections?.values.modelSelection as any;
  const active = (selection?.next ?? selection?.lastUsed) as { provider?: string; model?: string; reasoningEffort?: string } | undefined;
  const current = chosen ? { provider: chosen.provider, model: chosen.model, reasoningEffort: chosen.reasoningEffort } : active;
  // Always the model's display name (from the Harness catalog), never its id, plus its reasoning level.
  const { name: model, level } = useModelLabel(client, current?.model, current?.provider, current?.reasoningEffort);
  const [importOpen, setImportOpen] = useState(false);
  const stop = running && !offline && !draft.trim() && !imports.length;
  const canSend = !busy && !disabled && (stop || (imports.every(i => i.state === 'ready') && (!!draft.trim() || !!imports.length)));
  return <>
    <View ref={diagnosticRef} collapsable={false} onLayout={e => diagnostic('composer.layout', { ...e.nativeEvent.layout })} style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>
      {imports.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 6 }}>{imports.map(i => <View key={i.id} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, padding: 7, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 0.5, borderColor: i.state === 'error' ? colors.danger : colors.border }}>
        {i.image ? <Image source={{ uri: i.uri }} accessibilityLabel={`Preview of ${i.name}`} resizeMode="cover" style={{ width: 64, height: 64, borderRadius: 6, backgroundColor: colors.fill }} /> : <Ionicons name="document-outline" size={14} color={colors.muted} />}
        <T style="caption1" numberOfLines={1} styleOverride={{ maxWidth: 160 }}>{i.name}</T>
        {i.state === 'uploading' ? <T style="caption2" color="secondary">{`Uploading ${Math.round(i.progress * 100)}%`}</T> : null}
        {i.state === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${i.name}: ${i.error}`} onPress={() => onRetryImport?.(i.id)} hitSlop={6}><T style="caption1" color="danger">Retry</T></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`} onPress={() => onRemoveImport?.(i.id)} hitSlop={6}><Ionicons name="close" size={15} color={colors.muted} /></Pressable>
      </View>)}</View> : null}
      {/* Option A: text on top, a toolbar row (+ · model · Send) inside the same card. The toolbar's
          touch targets never extend upwards, so taps on the text never open the model picker. */}
      <Glass radius={16} depth="card" style={{ paddingTop: 4, paddingBottom: 6, paddingHorizontal: 6 }}>
        <TextInput onFocus={() => diagnostic('composer.focus', { focused: true })} onBlur={() => diagnostic('composer.focus', { focused: false })} accessibilityLabel="Message" value={draft} onChangeText={onChange} multiline placeholder={disabled ? 'Reconnect to send…' : offline ? 'Offline — messages send when reconnected' : 'Ask anything…'} placeholderTextColor={colors.muted} editable={!disabled} style={[type.subhead, { fontSize: 13, lineHeight: 18, color: colors.text, minHeight: 38, maxHeight: 132, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, textAlignVertical: 'top' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}>
          {onImport ? <Pressable accessibilityRole="button" accessibilityLabel={offline ? "Import files (needs a connection)" : "Import files"} disabled={disabled || offline} onPress={() => setImportOpen(true)} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.state : 'transparent', opacity: disabled || offline ? 0.4 : 1 })}><Ionicons name="add" size={22} color={colors.muted} /></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={model ? `Model: ${model}${level ? `, reasoning ${level}` : ''}. Change model` : 'Choose model'} onPress={() => setPicker(true)} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ flexShrink: 1, minWidth: 0, height: 30, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border })}>
            <Ionicons name="sparkles-outline" size={13} color={colors.text} />
            <T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{model || 'Choose model'}</T>
            {level ? <T style="caption2" color="tertiary" numberOfLines={1}>{`· ${level}`}</T> : null}
            <Ionicons name="chevron-down" size={10} color={colors.muted} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel={stop ? 'Stop' : offline ? 'Save to send when online' : running ? 'Queue message' : 'Send'} accessibilityHint={running && !stop ? 'Long-press to steer: deliver at the agent’s next step instead of after this turn' : undefined} disabled={!canSend} onPress={stop ? onStop : () => onSend('queue')} onLongPress={running && !stop && !offline ? () => onSend('steer') : undefined} delayLongPress={350} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend && !stop ? colors.text : pressed ? colors.state : 'transparent', opacity: pressed ? 0.7 : 1 })}><Ionicons name={stop ? 'stop' : 'arrow-up'} size={stop ? 12 : 19} color={canSend && !stop ? colors.bg : canSend ? colors.muted : colors.tertiary} /></Pressable>
        </View>
      </Glass>
      {offline && (draft.trim() || imports.length) ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 4 }}>Offline · Send keeps it on this phone and delivers it when you reconnect</T> : running && draft.trim() ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 4 }}>Send queues after this turn · hold Send to steer now</T> : null}
    </View>
    <ImportPicker visible={importOpen} onClose={() => setImportOpen(false)} onSelect={c => onImport?.(c)} />
    <ModelPicker sessionId={sessionId} visible={picker} onClose={() => setPicker(false)} onSelected={setChosen} current={current} />
  </>;
}
