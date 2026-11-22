import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../state/app';
import type { Mods } from '../lib/termKeys';

type KeyIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export type TermKey = { id: string; label: string; icon?: KeyIcon; text?: string };
/** Always visible: modifiers are separate (sticky) buttons; then Esc and the arrows. */
export const SHORT_KEYS: TermKey[] = [
  { id: 'esc', label: 'Escape', icon: 'keyboard-esc' },
  { id: 'left', label: 'Left arrow', icon: 'arrow-left' }, { id: 'up', label: 'Up arrow', icon: 'arrow-up' },
  { id: 'down', label: 'Down arrow', icon: 'arrow-down' }, { id: 'right', label: 'Right arrow', icon: 'arrow-right' },
];
/** Shown when the bar is expanded (or always, on wide screens). */
export const MORE_KEYS: TermKey[] = [
  { id: 'tab', label: 'Tab', icon: 'keyboard-tab' },
  { id: 'home', label: 'Home', icon: 'arrow-collapse-left' }, { id: 'end', label: 'End', icon: 'arrow-collapse-right' },
  { id: 'pgup', label: 'Page up', icon: 'chevron-double-up' }, { id: 'pgdn', label: 'Page down', icon: 'chevron-double-down' },
  { id: 'pipe', label: '|', text: '|' }, { id: 'tilde', label: '~', text: '~' }, { id: 'slash', label: '/', text: '/' }, { id: 'dash', label: '-', text: '-' },
];
export const MOD_KEYS: { id: keyof Mods; label: string; icon?: KeyIcon; short: string }[] = [
  { id: 'ctrl', label: 'Control', icon: 'apple-keyboard-control', short: 'Ctrl' },
  { id: 'shift', label: 'Shift', icon: 'apple-keyboard-shift', short: 'Shift' },
  { id: 'alt', label: 'Alt', icon: 'apple-keyboard-option', short: 'Alt' },
];
export const EXPANDED_KEY = 'dsh.terminal.keysExpanded';

/**
 * The terminal's extra keys: sticky Ctrl / Shift / Alt, then Esc and the arrows. On narrow screens the
 * rest (Tab, Home/End, Page up/down, | ~ / -) sits behind a chevron; rows wrap instead of scrolling.
 */
export function TerminalKeys({ mods, setMods, onKey, expanded, onToggleExpanded }: { mods: Mods; setMods: (f: (m: Mods) => Mods) => void; onKey: (k: TermKey) => void; expanded: boolean; onToggleExpanded: () => void }) {
  const { width } = useWindowDimensions(); const wide = width >= 600;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingVertical: 8 }}>
    {MOD_KEYS.map(k => <KeyBtn key={k.id} label={k.label} icon={k.icon} caption={k.short} active={mods[k.id]} sticky onPress={() => setMods(m => ({ ...m, [k.id]: !m[k.id] }))} />)}
    {SHORT_KEYS.map(k => <KeyBtn key={k.id} label={k.label} icon={k.icon} onPress={() => onKey(k)} />)}
    {wide || expanded ? MORE_KEYS.map(k => <KeyBtn key={k.id} label={k.label} icon={k.icon} onPress={() => onKey(k)} />) : null}
    {!wide ? <KeyBtn label={expanded ? 'Fewer keys' : 'More keys'} icon={expanded ? 'chevron-up' : 'chevron-down'} toggle onPress={onToggleExpanded} /> : null}
  </View>;
}

function KeyBtn({ label, onPress, active, icon, caption, sticky, toggle }: { label: string; onPress: () => void; active?: boolean; icon?: KeyIcon; caption?: string; sticky?: boolean; toggle?: boolean }) {
  const { colors } = useApp();
  const fg = active ? colors.bg : colors.text;
  return <Pressable accessibilityRole={sticky ? 'switch' : 'button'} accessibilityLabel={sticky ? `${label} key` : toggle ? label : `Send ${label}`} accessibilityState={sticky ? { checked: !!active } : undefined}
    accessibilityHint={sticky ? 'Applies to the next key, then releases' : undefined} onPress={onPress}
    style={({ pressed }) => ({ height: 32, minWidth: 42, paddingHorizontal: 10, borderRadius: 9, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? colors.text : pressed ? colors.state : colors.fill, boxShadow: `inset 0 1px 0 ${colors.rim}`, opacity: toggle ? 0.85 : 1 })}>
    {icon ? <MaterialCommunityIcons name={icon} size={caption ? 15 : 18} color={fg} /> : null}
    {caption ? <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{caption}</Text> : !icon ? <Text style={{ color: fg, fontFamily: MONO, fontSize: 14 }}>{label}</Text> : null}
  </Pressable>;
}
