import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state/app';
import { T } from './ui';
import type { SendStatus } from '../lib/sendStatus';

/** A message still on its way: its status line, and a thin upload bar while photos go up. */
export function SendingBubble({ text, status, progress }: { text: string; status: SendStatus; progress?: number }) {
  const { colors } = useApp();
  const color = status.tone === 'primary' ? colors.primary : colors.muted;
  const uploading = progress !== undefined && progress < 1;
  return <View accessibilityLiveRegion="polite" accessibilityLabel={`${status.label}: ${text}`} style={{ marginTop: 12, marginLeft: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 17, backgroundColor: colors.bubble, opacity: 0.85 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
      <Ionicons name={status.icon} size={12} color={color} />
      <T style="caption2" color={status.tone === 'primary' ? colors.primary : 'secondary'}>{status.label}</T>
    </View>
    <T style="footnote" numberOfLines={6}>{text}</T>
    {uploading ? <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(3, Math.round(progress! * 100))}%`, height: 3, backgroundColor: colors.primary }} />
    </View> : null}
  </View>;
}
