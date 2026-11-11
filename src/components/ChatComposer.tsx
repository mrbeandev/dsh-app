import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { ModelPicker } from './ModelPicker';
import { Glass } from './Glass';
import { T, type } from './ui';
import { ImportPicker } from './ImportPicker';
import type { ImportCategory, ImportItem } from '../lib/imports';
import { useModelLabel } from '../lib/modelNames';
import { AttachmentTray } from './AttachmentTray';
import type { ModelChoice } from './ModelPicker';
import type * as DocumentPicker from 'expo-document-picker';
import { diagnostic } from '../lib/diagnostics';
import { useLayoutDiagnostics } from '../lib/useLayoutDiagnostics';

/**
 * Floating glass composer, as in the approved prototype (screen 02):
 * slim pill · growing text field · off-white circular send, with a quiet ✧ model selector beneath.
 */
/** Toolbar targets grow sideways/downwards only, never up into the text field above them. */
const DOWN_SLOP = { top: 0, bottom: 8, left: 4, right: 4 };

export function ChatComposer({ sessionId, draft, onChange, onSend, onStop, running, busy, disabled, offline = false, imports = [], onImport, onAttachMedia, onRemoveImport, onRetryImport }: { sessionId: string; draft: string; onChange: (v: string) => void; onSend: (mode?: 'queue' | 'steer') => void; onStop: () => void; running: boolean; busy: boolean; disabled: boolean; offline?: boolean; imports?: ImportItem[]; onImport?: (category: ImportCategory) => void; onAttachMedia?: (assets: DocumentPicker.DocumentPickerAsset[]) => void; onRemoveImport?: (id: string) => void; onRetryImport?: (id: string) => void }) {
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
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  // Stay expanded while typing, with unsent text/attachments, or while a picker opened from the toolbar is up.
  const expanded = focused || !!draft.trim() || imports.length > 0 || picker || importOpen;
  const [reveal] = useState(() => new Animated.Value(expanded ? 1 : 0));
  const compactOpacity = reveal.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
  const reduceMotion = useRef(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(v => { reduceMotion.current = v; }).catch(() => {}); }, []);
  useEffect(() => {
    // A short delay on collapse so tapping a toolbar button (which blurs the input first) still lands.
    const t = setTimeout(() => {
      Animated.timing(reveal, { toValue: expanded ? 1 : 0, duration: reduceMotion.current ? 0 : expanded ? 220 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, expanded ? 0 : 120);
    return () => clearTimeout(t);
  }, [expanded, reveal]);
  const sendButton = <Pressable accessibilityRole="button" accessibilityLabel={stop ? 'Stop' : offline ? 'Save to send when online' : running ? 'Queue message' : 'Send'} accessibilityHint={running && !stop ? 'Long-press to steer: deliver at the agent’s next step instead of after this turn' : undefined} disabled={!canSend} onPress={stop ? onStop : () => onSend('queue')} onLongPress={running && !stop && !offline ? () => onSend('steer') : undefined} delayLongPress={350} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend && !stop ? colors.text : pressed ? colors.state : 'transparent', opacity: pressed ? 0.7 : 1 })}><Ionicons name={stop ? 'stop' : 'arrow-up'} size={stop ? 12 : 19} color={canSend && !stop ? colors.bg : canSend ? colors.muted : colors.tertiary} /></Pressable>;
  return <>
    <View ref={diagnosticRef} collapsable={false} onLayout={e => diagnostic('composer.layout', { ...e.nativeEvent.layout })} style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>
      <AttachmentTray items={imports} onRemove={onRemoveImport} onRetry={onRetryImport} />
      {/* Compact until used: [+] [input] [send]. Focusing the input (or typing, or attaching) expands it
          with an animation to reveal the full text area and the model toolbar; it shrinks back on blur
          unless there is unsent text or an attachment. The TextInput is the same element in both states,
          so the keyboard and cursor never reset. */}
      <Glass radius={16} depth="card" style={{ paddingTop: 4, paddingBottom: 4, paddingHorizontal: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          <Animated.View style={{ width: reveal.interpolate({ inputRange: [0, 1], outputRange: [onImport ? 34 : 0, 0] }), opacity: compactOpacity, overflow: 'hidden', marginBottom: 1 }} pointerEvents={expanded ? 'none' : 'auto'}>
            {onImport ? <Pressable key="plus-compact" accessibilityRole="button" accessibilityLabel={offline ? "Import files (needs a connection)" : "Import files"} disabled={disabled || offline} onPress={() => setImportOpen(true)} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.state : 'transparent', opacity: disabled || offline ? 0.4 : 1 })}><Ionicons name="add" size={22} color={colors.muted} /></Pressable> : null}
          </Animated.View>
          <TextInput ref={inputRef} onFocus={() => { diagnostic('composer.focus', { focused: true }); setFocused(true); }} onBlur={() => { diagnostic('composer.focus', { focused: false }); setFocused(false); }} accessibilityLabel="Message" value={draft} onChangeText={onChange} multiline placeholder={disabled ? 'Reconnect to send…' : offline ? 'Offline — messages send when reconnected' : 'Ask anything…'} placeholderTextColor={colors.muted} editable={!disabled} style={[type.subhead, { flex: 1 }, { fontSize: 13, lineHeight: 18, color: colors.text, minHeight: 36, maxHeight: expanded ? 132 : 36, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, textAlignVertical: 'top' }]} />
          <Animated.View style={{ width: reveal.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }), opacity: compactOpacity, overflow: 'hidden', marginBottom: 1 }} pointerEvents={expanded ? 'none' : 'auto'}>
            {sendButton}
          </Animated.View>
        </View>
        <Animated.View style={{ height: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, 38] }), opacity: reveal, overflow: 'hidden' }} pointerEvents={expanded ? 'auto' : 'none'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingTop: 2 }}>
            {onImport ? <Pressable accessibilityRole="button" accessibilityLabel={offline ? "Import files (needs a connection)" : "Import files"} disabled={disabled || offline} onPress={() => setImportOpen(true)} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.state : 'transparent', opacity: disabled || offline ? 0.4 : 1 })}><Ionicons name="add" size={22} color={colors.muted} /></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={model ? `Model: ${model}${level ? `, reasoning ${level}` : ''}. Change model` : 'Choose model'} onPress={() => setPicker(true)} hitSlop={DOWN_SLOP} style={({ pressed }) => ({ flexShrink: 1, minWidth: 0, height: 30, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: pressed ? colors.state : colors.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border })}>
            <Ionicons name="sparkles-outline" size={13} color={colors.text} />
            <T style="caption1" color="secondary" numberOfLines={1} styleOverride={{ flexShrink: 1 }}>{model || 'Choose model'}</T>
            {level ? <T style="caption2" color="tertiary" numberOfLines={1}>{`· ${level}`}</T> : null}
            <Ionicons name="chevron-down" size={10} color={colors.muted} />
          </Pressable>
            <View style={{ flex: 1 }} />
            {sendButton}
          </View>
        </Animated.View>
      </Glass>
      {offline && (draft.trim() || imports.length) ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 4 }}>Offline · Send keeps it on this phone and delivers it when you reconnect</T> : running && draft.trim() ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 4 }}>Send queues after this turn · hold Send to steer now</T> : null}
    </View>
    <ImportPicker visible={importOpen} onClose={() => setImportOpen(false)} onSelect={c => onImport?.(c)} onAttachMedia={onAttachMedia} />
    <ModelPicker sessionId={sessionId} visible={picker} onClose={() => setPicker(false)} onSelected={setChosen} current={current} />
  </>;
}
