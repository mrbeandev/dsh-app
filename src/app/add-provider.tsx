import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useApp } from '../state/app';
import { Button, ErrorNotice, Field, Header, Row, Screen, Section, T, s } from '../components/ui';
import { useActionMenu } from '../components/ActionMenu';
import { Loading } from '../components/Loader';
import { errorMessage } from '../lib/harness';
import { loadCatalog } from '../lib/modelNames';
import { PROTOCOLS, addBuiltInProvider, addCustomProvider, adoptModel, discoverModels, listProviders, routeFromName, type ConfigurableProvider, type DiscoveredModel } from '../lib/providers';

const CUSTOM = '@custom';

/**
 * Add an AI provider to the connected Harness (same steps as the Harness web UI › Settings › Models).
 * Opened after local setup (`?setup=1`) and from Settings. The API key is stored in the Harness's
 * credential store, never in its config file.
 */
export default function AddProvider() {
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const { client, colors } = useApp(); const menu = useActionMenu();
  const [providers, setProviders] = useState<ConfigurableProvider[] | null>(null);
  const [kind, setKind] = useState<string>(CUSTOM);
  const [name, setName] = useState(''); const [baseURL, setBaseURL] = useState(''); const [apiKey, setApiKey] = useState('');
  const [api, setApi] = useState<string>(PROTOCOLS[0].id);
  const [models, setModels] = useState<DiscoveredModel[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');

  useEffect(() => { if (client) void listProviders(client).then(setProviders).catch(e => setError(errorMessage(e))); }, [client]);
  const builtIn = providers?.find(p => p.provider === kind) ?? null;
  const isCustom = kind === CUSTOM;

  const chooseKind = () => menu({
    title: 'Provider', subtitle: 'Your own endpoint (any OpenAI-compatible API, a router or a local server), or one of the providers the Harness knows.',
    actions: [
      { label: 'Custom / OpenAI-compatible', icon: (isCustom ? 'checkmark-circle' : 'ellipse-outline') as 'checkmark-circle', onPress: () => { setKind(CUSTOM); setModels(null); setPicked([]); } },
      ...(providers ?? []).filter(p => !p.declared && p.settingsPath.length).sort((a, b) => a.displayName.localeCompare(b.displayName)).map(p => ({
        label: p.displayName, icon: (p.provider === kind ? 'checkmark-circle' : 'ellipse-outline') as 'checkmark-circle',
        onPress: () => { setKind(p.provider); setModels(null); setPicked([]); },
      })),
    ],
  });
  const chooseApi = () => menu({ title: 'API Format', actions: PROTOCOLS.map(p => ({ label: p.label, icon: (p.id === api ? 'checkmark-circle' : 'ellipse-outline') as 'checkmark-circle', onPress: () => { setApi(p.id); setModels(null); } })) });

  const find = async () => {
    if (!client) return;
    setError(''); setBusy('Fetching models…');
    try {
      const list = isCustom ? await discoverModels(client, { api, baseURL, apiKey }) : await discoverModels(client, { api: '', apiKey, provider: kind });
      const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
      setModels(sorted); setPicked(p => p.filter(id => sorted.some(m => m.id === id)));
      if (!sorted.length) setError('The provider returned no models. Check the URL, API format and key.');
    } catch (e) { setError(`Couldn’t fetch models: ${errorMessage(e)}`); }
    finally { setBusy(''); }
  };

  const save = async () => {
    if (!client) return;
    setError(''); setBusy('Saving…');
    try {
      if (isCustom) {
        const route = routeFromName(name || new URL(baseURL).hostname);
        const chosen = (models ?? []).filter(m => picked.includes(m.id)).map(adoptModel);
        await addCustomProvider(client, { route, displayName: name.trim(), api, baseURL, apiKey: apiKey.trim(), models: chosen, defaultModel: picked[0] });
      } else {
        await addBuiltInProvider(client, { provider: kind, apiKey: apiKey.trim(), defaultModel: picked[0] });
      }
      await loadCatalog(client, true).catch(() => null); // the composer's model chip shows the new default
      router.replace('/');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(''); }
  };

  const shown = useMemo(() => (models ?? []).filter(m => !filter || (m.id + ' ' + (m.name ?? '')).toLowerCase().includes(filter.toLowerCase())), [models, filter]);
  const canFind = !!apiKey.trim() && (!isCustom || /^https?:\/\/\S+/.test(baseURL.trim()));
  const canSave = !!apiKey.trim() && picked.length > 0 && (!isCustom || !!baseURL.trim());

  return <Screen readable><Header title="Add AI Provider" back /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingTop: 16 }]}>
    {setup ? <View style={{ gap: 6 }}>
      <T style="title2">One last step</T>
      <T style="subhead" color="secondary">Your Harness is running. Add the AI provider its agents should use. You can add more later in Settings.</T>
    </View> : null}
    {!providers ? <Loading fill={false} size="md" /> : <>
      <Section>
        <Row icon="server-outline" title="Provider" value={isCustom ? 'Custom' : builtIn?.displayName ?? kind} onPress={busy ? undefined : chooseKind} />
        {isCustom ? <Row icon="code-slash-outline" title="API Format" value={PROTOCOLS.find(p => p.id === api)?.label.split(' (')[0]} onPress={busy ? undefined : chooseApi} /> : null}
      </Section>
      <View style={{ gap: 14 }}>
        {isCustom ? <>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. My Router" autoCapitalize="words" />
          <Field label="Base URL" value={baseURL} onChangeText={v => { setBaseURL(v); setModels(null); }} placeholder="https://api.example.com/v1" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        </> : null}
        <Field label="API Key" value={apiKey} onChangeText={v => { setApiKey(v); setModels(null); }} placeholder="Paste your key" secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <T style="caption1" color="secondary">The key is stored in your Harness’s credential store, not in its settings file.</T>
      </View>
      <Button title={models ? 'Fetch Models Again' : 'Fetch Models'} onPress={() => void find()} disabled={!canFind || !!busy} loading={busy === 'Fetching models…'} />
      {models?.length ? <View style={{ gap: 8 }}>
        <T style="subhead" weight="600">{`Choose models (${picked.length} selected)`}</T>
        <T style="caption1" color="secondary">The first one you pick becomes the default for new sessions.</T>
        {models.length > 8 ? <Field label="" value={filter} onChangeText={setFilter} placeholder={`Search ${models.length} models`} autoCapitalize="none" autoCorrect={false} /> : null}
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
          {shown.slice(0, 200).map(m => { const i = picked.indexOf(m.id); const on = i >= 0;
            return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setPicked(p => on ? p.filter(x => x !== m.id) : [...p, m.id])}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: pressed ? colors.state : colors.panel, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border })}>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={on ? colors.text : colors.tertiary} />
              <View style={{ flex: 1 }}><T style="footnote" weight="600" numberOfLines={1}>{m.name ?? m.id}</T>{m.name && m.name !== m.id ? <T style="caption2" color="tertiary" numberOfLines={1}>{m.id}</T> : null}</View>
              {i === 0 ? <T style="caption2" color="secondary">Default</T> : null}
            </Pressable>; })}
        </View>
      </View> : null}
      <ErrorNotice message={error} />
      <Button title="Save Provider" onPress={() => void save()} disabled={!canSave || !!busy} loading={busy === 'Saving…'} />
      {setup ? <Pressable accessibilityRole="button" onPress={() => router.replace('/')} hitSlop={8} style={{ alignItems: 'center', padding: 8 }}><T style="footnote" color="secondary">Skip for now</T></Pressable> : null}
    </>}
  </ScrollView></Screen>;
}
