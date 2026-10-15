import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { ModelPicker } from './ModelPicker';
import { Glass } from './Glass';
import { T, slop, type } from './ui';

/**
 * Floating glass composer, as in the approved prototype (screen 02):
 * slim pill · growing text field · off-white circular send, with a quiet ✧ model selector beneath.
 */
export function ChatComposer({ sessionId, draft, onChange, onSend, onStop, running, busy, disabled }: { sessionId: string; draft: string; onChange: (v: string) => void; onSend: (mode?: 'queue' | 'steer') => void; onStop: () => void; running: boolean; busy: boolean; disabled: boolean }) {
  const { colors, sessions } = useApp(); const [picker, setPicker] = useState(false); const [chosen, setChosen] = useState('');
  const selection = sessions.find(s => s.sessionId === sessionId)?.projections?.values.modelSelection as any;
  const model: string = chosen || (selection?.next ?? selection?.lastUsed)?.model || '';
  const stop = running && !draft.trim();
  const canSend = !busy && !disabled && (stop || !!draft.trim());
  return <>
    <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 }}>
      <Glass radius={23} interactive style={{ minHeight: 44, flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 14, paddingRight: 4, paddingVertical: 4 }}>
        <TextInput accessibilityLabel="Message" value={draft} onChangeText={onChange} multiline placeholder={disabled ? 'Reconnect to send…' : 'Ask anything…'} placeholderTextColor={colors.muted} editable={!disabled} style={[type.subhead, { fontSize: 13, lineHeight: 18, flex: 1, color: colors.text, minHeight: 36, maxHeight: 132, paddingHorizontal: 0, paddingTop: 8, paddingBottom: 8, textAlignVertical: 'top' }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={stop ? 'Stop' : running ? 'Queue message' : 'Send'} accessibilityHint={running && !stop ? 'Long-press to steer: deliver at the agent’s next step instead of after this turn' : undefined} disabled={!canSend} onPress={stop ? onStop : () => onSend('queue')} onLongPress={running && !stop ? () => onSend('steer') : undefined} delayLongPress={350} hitSlop={slop(34)} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, marginLeft: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend ? colors.text : colors.fill, opacity: pressed ? 0.7 : 1 })}><Ionicons name={stop ? 'stop' : 'arrow-up'} size={stop ? 14 : 19} color={canSend ? colors.bg : colors.tertiary} /></Pressable>
      </Glass>
      {running && draft.trim() ? <T style="caption2" color="tertiary" styleOverride={{ marginLeft: 12, marginTop: 3 }}>Send queues after this turn · hold Send to steer now</T> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={model ? `Model: ${model}. Change model` : 'Choose model'} onPress={() => setPicker(true)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 30, marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.5 : 1 })}>
        <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
        <T style="caption1" color="secondary" numberOfLines={1}>{model || 'Choose model'}</T>
        <Ionicons name="chevron-down" size={10} color={colors.muted} />
      </Pressable>
    </View>
    <ModelPicker sessionId={sessionId} visible={picker} onClose={() => setPicker(false)} onSelected={setChosen} current={model} />
  </>;
}
