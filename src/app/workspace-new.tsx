import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Header, IconButton, Screen, T } from '../components/ui';
import { errorMessage } from '../lib/harness';
import { usePrompt } from '../components/PromptSheet';

type Listing = { path: string; home: string; crumbs: { name: string; path: string }[]; entries: { name: string; path: string; hidden: boolean }[] };

/** Add a workspace by browsing Harness folders with the Web UI's own directoryPicker API. */
export default function NewWorkspace() {
  const { client, colors, refresh } = useApp();
  const [path, setPath] = useState<string | undefined>(undefined); const [listing, setListing] = useState<Listing | null>(null);
  const [showHidden, setShowHidden] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!client) return; let active = true;
    client.call<Listing>('directoryPicker/list', path ? { path } : {}).then(l => { if (active) { setListing(l); setError(''); } }).catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [client, path]);

  const go = (p: string) => { setListing(null); setPath(p); };
  const create = async () => {
    if (!client || !listing) return; setBusy(true);
    try { const r = await client.call('workspace/create', { request: { path: listing.path } }); await refresh(); if (!r?.created) Alert.alert('Already a Workspace', `${r?.workspace?.title ?? listing.path} is already in your workspace list.`); router.back(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const prompt = usePrompt();
  const newFolder = () => prompt({ title: 'New Folder', message: `Create inside ${listing?.path}`, placeholder: 'Folder name', confirm: 'Create', onSubmit: name => { if (!client || !listing) return; void client.call<string>('directoryPicker/createDirectory', { path: listing.path, name }).then(go).catch(e => setError(errorMessage(e))); } });

  const entries = (listing?.entries ?? []).filter(e => showHidden || !e.hidden);
  return <Screen>
    <Header title="Add Workspace" back>
      <IconButton icon={showHidden ? 'eye-outline' : 'eye-off-outline'} size={18} label={showHidden ? 'Hide hidden folders' : 'Show hidden folders'} onPress={() => setShowHidden(v => !v)} />
      <IconButton icon="add" size={20} label="New folder" onPress={newFolder} />
    </Header>
    <View style={{ paddingHorizontal: 14, paddingBottom: 6, gap: 4 }}>
      <T style="caption1" color="secondary">Pick a folder on the Harness. New threads can then start there.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
        {(listing?.crumbs ?? []).map((c, i, all) => <View key={c.path} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => go(c.path)} style={{ paddingVertical: 4, paddingHorizontal: 3 }}><T style="footnote" weight={i === all.length - 1 ? '600' : '400'} color={i === all.length - 1 ? 'primary' : 'secondary'}>{c.name}</T></Pressable>
          {i < all.length - 1 ? <Ionicons name="chevron-forward" size={11} color={colors.tertiary} /> : null}
        </View>)}
      </View>
    </View>
    <ErrorNotice message={error} />
    {!listing ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.muted} /> : <FlatList data={entries} keyExtractor={e => e.path} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
      ListHeaderComponent={listing.path !== listing.home ? <Pressable accessibilityRole="button" onPress={() => go(listing.home)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.5 : 1 }]}><Ionicons name="home-outline" size={17} color={colors.muted} /><T style="footnote" color="secondary">Home</T></Pressable> : null}
      ListEmptyComponent={<T style="footnote" color="secondary" align="center">No subfolders.</T>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => go(item.path)} style={({ pressed }) => [s.row, { backgroundColor: pressed ? colors.fill : 'transparent' }]}><Ionicons name="folder" size={18} color={colors.primary} /><T style="footnote" numberOfLines={1} styleOverride={{ flex: 1, fontSize: 14 }}>{item.name}</T><Ionicons name="chevron-forward" size={13} color={colors.tertiary} /></Pressable>} />}
    <View style={{ padding: 14, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator }}>
      <T style="caption1" color="secondary" numberOfLines={1}>{listing?.path ?? ' '}</T>
      <Button title="Use This Folder" onPress={() => void create()} loading={busy} disabled={!listing} />
    </View>
  </Screen>;
}
const s = StyleSheet.create({ row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 10 } });
