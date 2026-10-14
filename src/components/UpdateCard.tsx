import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { useUpdates } from '../state/updates';
import { Row, Section, T } from './ui';
import { Dots } from './Loader';
import { LiquidProgress } from './LiquidProgress';
import { currentVersion } from '../lib/updater';
import { relativeTime } from '../lib/time';

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
/** "just now" / "5m ago" / "Yesterday" — relativeTime returns bare 'now', '5m', or day names. */
const ago = (t: number) => { const r = relativeTime(t); return r === 'now' ? 'just now' : /^\d+[mh]$/.test(r) ? `${r} ago` : r; };

/** Settings › App Updates. */
export function UpdateSection() {
  const { colors } = useApp(); const u = useUpdates(); const st = u.state;
  const release = 'release' in st ? st.release : undefined;
  const footer = st.kind === 'current' ? `You’re on the latest version · checked ${ago(st.checkedAt)}` : 'Updates come from GitHub releases. You confirm the install in Android’s installer.';
  return <Section header="App Updates" footer={footer}>
    <Row icon="phone-portrait-outline" title="Installed" value={`v${currentVersion()}`} chevron={false} />
    {release ? <View style={{ padding: 14, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="sparkles" size={16} color={colors.primary} />
        <View style={{ flex: 1 }}><T style="footnote" weight="600" styleOverride={{ fontSize: 14 }}>{`Version ${release.version} available`}</T><T style="caption1" color="secondary">{`${mb(release.size)}${release.publishedAt ? ` · released ${ago(Date.parse(release.publishedAt))}` : ''}`}</T></View>
      </View>
      {release.notes ? <T style="caption1" color="secondary" numberOfLines={6}>{release.notes.replace(/[#*`]/g, '').trim()}</T> : null}
      {st.kind === 'downloading' ? <View style={{ gap: 6 }}>
        <LiquidProgress progress={st.progress} label={`Downloading ${Math.round(st.progress * 100)}% · ${mb(st.progress * release.size)} of ${mb(release.size)}`} height={40} />
        <Pressable accessibilityRole="button" onPress={u.cancel} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 2 }}><T style="caption1" color="danger">Cancel</T></Pressable>
      </View> : null}
      {st.kind === 'error' ? <T style="caption1" color="danger">{st.message}</T> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Release Notes" icon="logo-github" onPress={() => void Linking.openURL(release.url)} />
        {st.kind === 'ready' ? <Btn primary label="Install" icon="download-outline" onPress={() => void u.install()} />
          : st.kind === 'downloading' ? null
          : <Btn primary label="Download Update" icon="cloud-download-outline" onPress={u.download} />}
      </View>
      {st.kind === 'ready' ? <T style="caption2" color="tertiary">Android may ask you to allow installs from DSH Mobile the first time. Your chats and connection are kept.</T> : null}
    </View> : null}
    {st.kind === 'checking' ? <View style={{ padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Dots size="sm" /><T style="footnote" color="secondary">Checking for updates…</T></View>
      : !release ? <Row icon="refresh-outline" title="Check for Updates" onPress={() => void u.check(true)} /> : null}
    {st.kind === 'error' && !release ? <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}><T style="caption1" color="danger">{st.message}</T></View> : null}
  </Section>;
}

/** Slim banner on the home screen when a new version is available (dismissable per version). */
export function UpdateBanner() {
  const { colors } = useApp(); const u = useUpdates(); const st = u.state;
  if (st.kind !== 'available' || st.release.version === u.skipped) return null;
  return <View style={{ marginHorizontal: 12, marginBottom: 6, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, minHeight: 40, backgroundColor: colors.dark ? '#1d2a3d' : '#e6efff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassEdge }}>
    <Ionicons name="sparkles" size={15} color={colors.primary} />
    <Pressable accessibilityRole="button" style={{ flex: 1, paddingVertical: 9 }} onPress={() => router.push('/settings')}><T style="caption1" weight="600" styleOverride={{ fontSize: 12.5 }}>{`Update to v${st.release.version} available · tap to update`}</T></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Hide this update" hitSlop={8} onPress={u.skip} style={{ padding: 8 }}><Ionicons name="close" size={14} color={colors.muted} /></Pressable>
  </View>;
}

function Btn({ label, icon, primary, onPress }: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; primary?: boolean; onPress: () => void }) {
  const { colors } = useApp(); const fg = primary ? colors.bg : colors.text;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 38, borderRadius: 19, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.text : colors.fill, borderWidth: primary ? 0 : StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.7 : 1 })}>
    <Ionicons name={icon} size={15} color={fg} /><T style="footnote" weight="600" color={fg} styleOverride={{ fontSize: 13.5 }}>{label}</T>
  </Pressable>;
}
