import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T, type } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type DialogButton = { label: string; style?: 'default' | 'cancel' | 'destructive' | 'primary'; value?: string };
export type DialogSpec = {
  title: string;
  message?: string;
  icon?: IconName;
  tone?: 'default' | 'danger' | 'warning' | 'success';
  buttons?: DialogButton[];
  /** Adds a text field; its value is returned as `text`. */
  input?: { initial?: string; placeholder?: string; secure?: boolean; required?: boolean; /** Multi-line text area that grows up to half the screen height. */ multiline?: boolean };
};
export type DialogResult = { button: string; value?: string; text: string };

type Api = {
  show: (spec: DialogSpec) => Promise<DialogResult>;
  /** Yes/no confirmation. Resolves true only when the confirm button is pressed. */
  confirm: (o: { title: string; message?: string; confirm?: string; cancel?: string; destructive?: boolean; icon?: IconName }) => Promise<boolean>;
  /** Single-button notice. */
  alert: (title: string, message?: string, tone?: DialogSpec['tone']) => Promise<void>;
  /** Text prompt. Resolves the trimmed text, or null when cancelled. */
  prompt: (o: { title: string; message?: string; initial?: string; placeholder?: string; confirm?: string; multiline?: boolean }) => Promise<string | null>;
};
const Ctx = createContext<Api | null>(null);

/**
 * App-styled replacement for native Alert / Alert.prompt (HIG › Alerts):
 * centered glass card, title + message, up to several buttons (stacked when >2),
 * destructive styling, optional text field, Back closes as Cancel, motion respects Reduce Motion.
 */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<{ spec: DialogSpec; resolve: (r: DialogResult) => void }[]>([]);
  const show = useCallback((spec: DialogSpec) => new Promise<DialogResult>(resolve => setQueue(q => [...q, { spec, resolve }])), []);
  const api = useMemo<Api>(() => ({
    show,
    confirm: async o => (await show({ title: o.title, message: o.message, icon: o.icon ?? (o.destructive ? 'warning-outline' : undefined), tone: o.destructive ? 'danger' : 'default', buttons: [{ label: o.cancel ?? 'Cancel', style: 'cancel' }, { label: o.confirm ?? 'OK', style: o.destructive ? 'destructive' : 'primary', value: 'ok' }] })).value === 'ok',
    alert: async (title, message, tone = 'default') => { await show({ title, message, tone, icon: tone === 'danger' ? 'alert-circle-outline' : tone === 'success' ? 'checkmark-circle-outline' : tone === 'warning' ? 'warning-outline' : undefined, buttons: [{ label: 'OK', style: 'primary', value: 'ok' }] }); },
    prompt: async o => { const r = await show({ title: o.title, message: o.message, input: { initial: o.initial, placeholder: o.placeholder, required: true, multiline: o.multiline }, buttons: [{ label: 'Cancel', style: 'cancel' }, { label: o.confirm ?? 'OK', style: 'primary', value: 'ok' }] }); return r.value === 'ok' ? r.text.trim() : null; },
  }), [show]);
  const current = queue[0];
  const done = (r: DialogResult) => { current?.resolve(r); setQueue(q => q.slice(1)); };
  return <Ctx.Provider value={api}>
    {children}
    {current ? <DialogView key={queue.length + current.spec.title} spec={current.spec} onDone={done} /> : null}
  </Ctx.Provider>;
}

export function useDialog() { const v = useContext(Ctx); if (!v) throw new Error('DialogProvider missing'); return v; }

function DialogView({ spec, onDone }: { spec: DialogSpec; onDone: (r: DialogResult) => void }) {
  const { colors } = useApp(); const { height } = useWindowDimensions();
  const buttons = useMemo<DialogButton[]>(() => (spec.buttons?.length ? spec.buttons : [{ label: 'OK', style: 'primary', value: 'ok' }]), [spec.buttons]);
  const cancel = buttons.find(b => b.style === 'cancel');
  const [text, setText] = useState(spec.input?.initial ?? '');
  const [anim] = useState(() => new Animated.Value(0));
  const closing = useRef(false);

  useEffect(() => {
    let reduce = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { reduce = v; }).catch(() => {}).finally(() => {
      if (reduce) anim.setValue(1); else Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
  }, [anim]);

  const finish = useCallback((b: DialogButton) => {
    if (closing.current) return; closing.current = true;
    Animated.timing(anim, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onDone({ button: b.label, value: b.value, text }));
  }, [anim, onDone, text]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { finish(cancel ?? buttons[0]); return true; });
    return () => sub.remove();
  }, [finish, cancel, buttons]);

  const blocked = (b: DialogButton) => !!spec.input?.required && b.style !== 'cancel' && !text.trim();
  const toneColor = spec.tone === 'danger' ? colors.danger : spec.tone === 'warning' ? '#ffb74d' : spec.tone === 'success' ? colors.live : colors.primary;
  const stacked = buttons.length > 2;
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const btn = (b: DialogButton, i: number) => {
    const destructive = b.style === 'destructive'; const primary = b.style === 'primary'; const disabled = blocked(b);
    const fg = destructive ? colors.danger : primary ? colors.bg : colors.text;
    return <Pressable key={b.label + i} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => finish(b)} style={({ pressed }) => ({ flex: stacked ? undefined : 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: primary ? colors.text : destructive ? (colors.dark ? '#ff8a8022' : '#c6282814') : colors.fill, borderWidth: primary ? 0 : StyleSheet.hairlineWidth, borderColor: destructive ? (colors.dark ? '#ff8a8055' : '#c6282840') : colors.border, opacity: disabled ? 0.4 : pressed ? 0.65 : 1 })}>
      <T style="footnote" weight={b.style === 'cancel' ? '500' : '600'} color={fg} styleOverride={{ fontSize: 14 }}>{b.label}</T>
    </Pressable>;
  };

  return <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => finish(cancel ?? buttons[0])}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <Animated.View style={{ flex: 1, backgroundColor: '#00000080', opacity: anim, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Pressable accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={cancel ? () => finish(cancel) : undefined} />
        <Animated.View accessibilityViewIsModal accessibilityRole="alert" style={{ width: '100%', maxWidth: spec.input?.multiline ? 520 : 340, transform: [{ scale }], borderRadius: 24, padding: 18, gap: 14, backgroundColor: colors.dark ? '#242426' : '#fbfcfd', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge, boxShadow: '0 16px 40px #00000066' }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            {spec.icon ? <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: `${toneColor}22` }}><Ionicons name={spec.icon} size={22} color={toneColor} /></View> : null}
            <T style="headline" align="center" styleOverride={{ fontSize: 16 }}>{spec.title}</T>
            {spec.message ? <T style="footnote" color="secondary" align="center" selectable>{spec.message}</T> : null}
          </View>
          {spec.input?.multiline ? <TextInput autoFocus multiline scrollEnabled textAlignVertical="top" value={text} onChangeText={setText} placeholder={spec.input.placeholder} placeholderTextColor={colors.tertiary} style={[type.subhead, { fontSize: 14, lineHeight: 20, minHeight: 104, maxHeight: Math.round(height * 0.5), borderRadius: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, color: colors.text, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} />
            : spec.input ? <TextInput autoFocus value={text} onChangeText={setText} secureTextEntry={spec.input.secure} selectTextOnFocus placeholder={spec.input.placeholder} placeholderTextColor={colors.tertiary} returnKeyType="done" onSubmitEditing={() => { const p = buttons.find(b => b.style === 'primary'); if (p && !blocked(p)) finish(p); }} style={[type.subhead, { fontSize: 14, height: 42, borderRadius: 12, paddingHorizontal: 14, color: colors.text, backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} /> : null}
          <View style={{ flexDirection: stacked ? 'column' : 'row', gap: 8 }}>{(stacked ? [...buttons.filter(b => b.style !== 'cancel'), ...buttons.filter(b => b.style === 'cancel')] : buttons).map(btn)}</View>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
}
