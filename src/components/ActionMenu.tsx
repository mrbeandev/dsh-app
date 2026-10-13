import { createContext, useCallback, useContext, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../state/app';
import { T } from './ui';
import { Sheet } from './Sheet';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
export type MenuAction = { label: string; icon: IconName; onPress: () => void; destructive?: boolean; detail?: string };
type MenuSpec = { title: string; subtitle?: string; actions: MenuAction[] };

const Ctx = createContext<(spec: MenuSpec) => void>(() => {});
/** iOS-style action sheet (HIG › Action sheets) on top of the shared gesture Sheet. Works with any number of actions. */
export function ActionMenuProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useApp(); const [spec, setSpec] = useState<MenuSpec | null>(null);
  const show = useCallback((s: MenuSpec) => setSpec(s), []);
  return <Ctx.Provider value={show}>
    {children}
    {spec ? <Sheet visible onClose={() => setSpec(null)} title={spec.title} height={Math.min(0.85, 0.2 + spec.actions.length * 0.065)}>
      <View style={{ paddingHorizontal: 12, gap: 8 }}>
        {spec.subtitle ? <View style={{ paddingHorizontal: 4 }}><T style="caption1" color="secondary" numberOfLines={2}>{spec.subtitle}</T></View> : null}
        <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
          {spec.actions.map((a, i) => <View key={a.label}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginLeft: 44 }} /> : null}
            <Pressable accessibilityRole="button" onPress={() => { setSpec(null); setTimeout(a.onPress, 250); }} style={({ pressed }) => ({ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: pressed ? colors.bubble : 'transparent' })}>
              <Ionicons name={a.icon} size={18} color={a.destructive ? colors.danger : colors.text} />
              <View style={{ flex: 1 }}><T style="footnote" weight="500" color={a.destructive ? 'danger' : 'primary'} styleOverride={{ fontSize: 14 }}>{a.label}</T>{a.detail ? <T style="caption2" color="secondary">{a.detail}</T> : null}</View>
            </Pressable>
          </View>)}
        </View>
      </View>
    </Sheet> : null}
  </Ctx.Provider>;
}
export const useActionMenu = () => useContext(Ctx);
