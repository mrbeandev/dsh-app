import { createContext, useCallback, useContext, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useApp } from '../state/app';
import { Button, T, type } from './ui';
import { Sheet } from './Sheet';

type PromptSpec = { title: string; message?: string; initial?: string; placeholder?: string; confirm: string; onSubmit: (value: string) => void };
const Ctx = createContext<(spec: PromptSpec) => void>(() => {});
/** Cross-platform text prompt (Alert.prompt is iOS-only). */
export function PromptProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useApp(); const [spec, setSpec] = useState<PromptSpec | null>(null); const [value, setValue] = useState('');
  const show = useCallback((s: PromptSpec) => { setValue(s.initial ?? ''); setSpec(s); }, []);
  const submit = () => { if (!spec || !value.trim()) return; const s = spec; setSpec(null); setTimeout(() => s.onSubmit(value.trim()), 250); };
  return <Ctx.Provider value={show}>
    {children}
    {spec ? <Sheet visible onClose={() => setSpec(null)} title={spec.title} height={0.42}>
      <View style={{ paddingHorizontal: 14, gap: 12 }}>
        {spec.message ? <T style="caption1" color="secondary">{spec.message}</T> : null}
        <TextInput autoFocus value={value} onChangeText={setValue} onSubmitEditing={submit} returnKeyType="done" selectTextOnFocus placeholder={spec.placeholder} placeholderTextColor={colors.tertiary} style={[type.subhead, { fontSize: 14, height: 42, borderRadius: 12, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.fill, borderWidth: 1, borderColor: colors.border }]} />
        <Button title={spec.confirm} onPress={submit} disabled={!value.trim()} />
      </View>
    </Sheet> : null}
  </Ctx.Provider>;
}
export const usePrompt = () => useContext(Ctx);
