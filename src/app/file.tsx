import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useApp } from '../state/app';
import { useDialog } from '../components/Dialog';
import { Empty, Header, Screen, T } from '../components/ui';
import { Loading } from '../components/Loader';
import { LiquidProgress } from '../components/LiquidProgress';
import { PdfViewer, SheetViewer, toBase64 } from '../components/WebViewers';
import { CopyButton } from '../components/CopyButton';
import { errorMessage } from '../lib/harness';
import { downloadBytes, formatSize, isImage, isTextLike, mimeOf, readText, statFile } from '../lib/workspaceFiles';
import { openFile, saveDownload, shareFile, type SavedFile } from '../lib/downloads';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
type Kind = 'image' | 'pdf' | 'sheet' | 'text' | 'other';
const PREVIEW_LIMIT = { image: 20 * 1048576, pdf: 25 * 1048576, sheet: 15 * 1048576 };

function kindOf(name: string): Kind {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (isImage(name)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(ext)) return 'sheet';
  if (isTextLike(name)) return 'text';
  return 'other';
}

/** Full-screen file viewer (read-only): images, PDF, spreadsheets/CSV, text; download with Open/Share. */
export default function FileScreen() {
  const { sessionId, path, size } = useLocalSearchParams<{ sessionId: string; path: string; size?: string }>();
  const { client, colors } = useApp(); const dialog = useDialog();
  const name = path.split('/').pop() ?? path;
  const kind = kindOf(name);
  const [bytes, setBytes] = useState<number | undefined>(size ? Number(size) || undefined : undefined);
  const [content, setContent] = useState<Uint8Array | null>(null);
  const [text, setText] = useState<{ lines: string[]; more: boolean } | null>(null);
  const [error, setError] = useState(''); const [loadPct, setLoadPct] = useState(0);
  const [download, setDownload] = useState<number | null>(null); const [dlError, setDlError] = useState(''); const [saved, setSaved] = useState<SavedFile | null>(null);
  const [absolute, setAbsolute] = useState('');

  useEffect(() => {
    if (!client) return; let active = true;
    void statFile(client, sessionId, path).then(st => { if (!active) return; setBytes(st.bytes); setAbsolute(st.absolutePath); }).catch(() => {});
    if (kind === 'text') {
      readText(client, sessionId, path, 1, 2000).then(p => { if (active) setText({ lines: p.text.split('\n'), more: !p.eof }); }).catch(e => { if (active) setError(errorMessage(e)); });
    } else if (kind !== 'other') {
      const limit = PREVIEW_LIMIT[kind];
      statFile(client, sessionId, path).then(st => {
        if ((st.bytes ?? 0) > limit) throw new Error(`Too large to preview (${formatSize(st.bytes)}). Download it to open in another app.`);
        return downloadBytes(client, sessionId, path, (d, t) => { if (active) setLoadPct(t ? d / t : 0); });
      }).then(r => { if (active) setContent(r.bytes); }).catch(e => { if (active) setError(errorMessage(e)); });
    }
    return () => { active = false; };
  }, [client, sessionId, path, kind]);

  const doDownload = async () => {
    if (!client || download !== null) return; setDownload(0); setDlError('');
    try {
      const data = content ?? (await downloadBytes(client, sessionId, path, (d, t) => setDownload(t ? d / t : 0))).bytes;
      setDownload(1); setSaved(await saveDownload(name, data));
    } catch (e) { setDlError(errorMessage(e)); } finally { setDownload(null); }
  };

  const imageUri = useMemo(() => (kind === 'image' && content ? `data:${mimeOf(name)};base64,${toBase64(content)}` : ''), [kind, content, name]);

  return <Screen>
    <Header title={name} subtitle={[formatSize(bytes), kind === 'other' ? '' : kind === 'sheet' ? 'Spreadsheet' : kind === 'pdf' ? 'PDF' : kind === 'image' ? 'Image' : 'Text'].filter(Boolean).join(' · ')} back>
      {absolute ? <CopyButton value={absolute} label="Copy file path" /> : null}
    </Header>
    <View style={{ flex: 1 }}>
      {error ? <View style={{ flex: 1, justifyContent: 'center' }}><Empty icon="alert-circle-outline" title="Can’t Preview" detail={error} /></View>
        : kind === 'image' ? (imageUri ? <ScrollView maximumZoomScale={6} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }} style={{ backgroundColor: colors.dark ? '#000' : colors.grouped }}>
            <Image source={{ uri: imageUri }} resizeMode="contain" style={{ width: '100%', height: '100%', minHeight: 300, aspectRatio: undefined }} accessibilityLabel={name} />
          </ScrollView> : <Loading label={`Loading image… ${Math.round(loadPct * 100)}%`} />)
        : kind === 'pdf' ? (content ? <PdfViewer bytes={content} /> : <Loading label={`Loading PDF… ${Math.round(loadPct * 100)}%`} />)
        : kind === 'sheet' ? (content ? <SheetViewer bytes={content} name={name} /> : <Loading label={`Loading spreadsheet… ${Math.round(loadPct * 100)}%`} />)
        : kind === 'text' ? (text ? <TextView lines={text.lines} more={text.more} /> : <Loading label="Loading…" />)
        : <View style={{ flex: 1, justifyContent: 'center' }}><Empty icon="document-outline" title="No Preview" detail={`${mimeOf(name)} files can’t be shown here. Download it to open in another app.`} /></View>}
    </View>
    <View style={{ padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, backgroundColor: colors.bg }}>
      {dlError ? <T style="caption1" color="danger">{dlError}</T> : null}
      {saved ? <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="checkmark-circle" size={18} color={colors.live} /><T style="caption1" color="secondary" numberOfLines={2} styleOverride={{ flex: 1 }}>{saved.publicUri ? `Saved to ${saved.folderName ?? 'your chosen folder'} as ${saved.name}` : `Saved in the app as ${saved.name}`}</T></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Action icon="open-outline" label="Open" onPress={() => void openFile(saved).catch(e => dialog.alert('No App to Open This File', errorMessage(e), 'warning'))} />
          <Action icon="share-outline" label="Share" onPress={() => void shareFile(saved).catch(e => dialog.alert('Couldn’t Share', errorMessage(e), 'danger'))} />
        </View>
      </View>
        : download !== null ? <LiquidProgress progress={download} label={download >= 1 ? 'Saving…' : `Downloading ${Math.round(download * 100)}%`} />
        : <Pressable accessibilityRole="button" accessibilityLabel={`Download ${name} to this device`} disabled={!client} onPress={() => void doDownload()} style={({ pressed }) => ({ height: 46, borderRadius: 23, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text, opacity: pressed ? 0.75 : 1 })}>
          <Ionicons name="download-outline" size={18} color={colors.bg} /><T style="footnote" weight="600" color={colors.bg} styleOverride={{ fontSize: 14 }}>{`Download${bytes ? ` · ${formatSize(bytes)}` : ''}`}</T>
        </Pressable>}
    </View>
  </Screen>;
}

/** Virtualised read-only text with line numbers (handles thousands of lines without lag). */
function TextView({ lines, more }: { lines: string[]; more: boolean }) {
  const { colors } = useApp(); const gutter = String(lines.length).length * 7 + 14;
  return <FlatList data={lines} keyExtractor={(_, i) => String(i)} initialNumToRender={60} windowSize={15} style={{ backgroundColor: colors.dark ? '#111214' : '#fafbfc' }}
    contentContainerStyle={{ paddingVertical: 8 }}
    ListFooterComponent={more ? <T style="caption1" color="secondary" align="center">Showing the first 2,000 lines. Download for the full file.</T> : null}
    renderItem={({ item, index }) => <View style={{ flexDirection: 'row' }}>
      <Text style={{ width: gutter, textAlign: 'right', paddingRight: 8, color: colors.tertiary, fontFamily: MONO, fontSize: 11, lineHeight: 17 }}>{index + 1}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}><Text selectable style={{ color: colors.text, fontFamily: MONO, fontSize: 11.5, lineHeight: 17, paddingRight: 16 }}>{item || ' '}</Text></ScrollView>
    </View>} />;
}

function Action({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 42, borderRadius: 21, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, opacity: pressed ? 0.6 : 1 })}><Ionicons name={icon} size={16} color={colors.text} /><T style="footnote" weight="600" styleOverride={{ fontSize: 14 }}>{label}</T></Pressable>;
}
