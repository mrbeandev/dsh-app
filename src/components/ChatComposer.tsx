import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { ModelPicker } from './ModelPicker';
import { Glass } from './Glass';
import { T, slop, type } from './ui';

/**
 * Floating glass composer (HIG: controls on the glass layer, 44 pt targets).
 * One slim capsule: model chip · growing text field · circular send/stop.
 */
export function ChatComposer({ sessionId, draft, onChange, onSend, onStop, running, busy, disabled }: { sessionId: string; draft: string; onChange: (v: string) => void; onSend: () => void; onStop: () => void; running: boolean; busy: boolean; disabled: boolean }) {
  const { colors, sessions } = useApp(); const [picker, setPicker] = useState(false); const [chosen, setChosen] = useState('');
  const selection = sessions.find(s => s.sessionId === sessionId)?.projections?.values.modelSelection as any;
  const model: string = chosen || (selection?.next ?? selection?.lastUsed)?.model || '';
  const stop = running && !draft.trim();
  const canSend = !busy && !disabled && (stop || !!draft.trim());
  return <>
    <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 6 }}>
      <Glass radius={24} interactive style={{ minHeight: 48, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 4, paddingRight: 6, paddingVertical: 6 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={model ? `Model: ${model}. Change model` : 'Choose model'} onPress={() => setPicker(true)} hitSlop={slop(36)} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}><Ionicons name="sparkles-outline" size={20} color={colors.text} /></Pressable>
        <TextInput accessibilityLabel="Message" value={draft} onChangeText={onChange} multiline placeholder={disabled ? 'Reconnect to send…' : 'Ask anything…'} placeholderTextColor={colors.muted} editable={!disabled} style={[type.body, { flex: 1, color: colors.text, minHeight: 36, maxHeight: 132, paddingHorizontal: 6, paddingTop: 7, paddingBottom: 7, textAlignVertical: 'top' }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={stop ? 'Stop' : 'Send'} disabled={!canSend} onPress={stop ? onStop : onSend} hitSlop={slop(36)} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend ? colors.primary : colors.fill, opacity: pressed ? 0.7 : 1 })}><Ionicons name={stop ? 'stop' : 'arrow-up'} size={stop ? 15 : 20} color={canSend ? '#ffffff' : colors.tertiary} /></Pressable>
      </Glass>
      {model ? <Pressable accessibilityRole="button" accessibilityLabel={`Model: ${model}. Change model`} onPress={() => setPicker(true)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={({ pressed }) => ({ alignSelf: 'flex-start', marginLeft: 14, flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.5 : 1 })}><T style="caption1" color="secondary" numberOfLines={1}>{model}</T><Ionicons name="chevron-down" size={10} color={colors.muted} /></Pressable> : null}
    </View>
    <ModelPicker sessionId={sessionId} visible={picker} onClose={() => setPicker(false)} onSelected={setChosen} current={model} />
  </>;
}
