import type { HarnessClient } from './harness';

/**
 * Add an AI provider to a Harness, the same way the Harness web UI's Settings › Models does it
 * (verified against Harness 0.2.2):
 *   1. llm/discoverModels {settingsNs:'llm-pi-ai', request:{api, baseURL, apiKey, provider?}} → models
 *   2. settings/mutate llm-pi-ai set ['providers', route] = {displayName, apiKeyEnv, api, baseURL, models}
 *   3. credentials/set {ref: apiKeyEnv, value: key} — the key goes to the credential store, never the config
 *   4. settings/mutate agent-default-model set provider/model — so new sessions use it
 * Built-in providers (anthropic, openai, openrouter…) only need their key stored: the Harness already
 * knows their URL and models (llm/listConfigurableProviders lists them with a settings path).
 */
export const LLM_NS = 'llm-pi-ai';
export const DEFAULT_MODEL_NS = 'agent-default-model';

export type ConfigurableProvider = { provider: string; displayName: string; settingsNs: string; settingsPath: readonly string[]; declared?: boolean; defaultBaseURL?: string; error?: string };
export type DiscoveredModel = { id: string; name?: string; contextWindow?: number; maxTokens?: number; inputModalities?: readonly string[] };
export type ProviderModel = { id: string; name?: string; contextWindow?: number; maxTokens?: number; input?: string[] };

/** Wire protocols the Harness supports for custom providers (llm-pi-ai `api`). */
export const PROTOCOLS = [
  { id: 'openai-completions', label: 'OpenAI-compatible (Chat Completions)' },
  { id: 'openai-responses', label: 'OpenAI Responses' },
  { id: 'anthropic-messages', label: 'Anthropic Messages' },
  { id: 'google-generative-ai', label: 'Google Gemini' },
] as const;

/** Route names must match the Harness rule: lowercase, digits, single dashes, starting with a letter. */
export const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** A route id from a display name ("My Router!" → "my-router"). */
export function routeFromName(name: string) {
  const r = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[0-9-]+/, '');
  return ROUTE_PATTERN.test(r) ? r : 'custom';
}

/** Same naming as the web UI: "my-router" → "MY_ROUTER_API_KEY". */
export function keyRefFor(route: string) {
  return `${route.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
}

/** Discovered model → saved model (the web UI's `adopt`). */
export function adoptModel(m: DiscoveredModel): ProviderModel {
  return {
    id: m.id,
    ...(m.name ? { name: m.name } : {}),
    ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
    ...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
    ...(m.inputModalities ? { input: [...m.inputModalities] } : {}),
  };
}

/** Trim and drop a trailing slash so "…/v1/" and "…/v1" are the same provider. */
export function normalizeBaseURL(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export async function listProviders(client: HarnessClient): Promise<ConfigurableProvider[]> {
  const list = await client.call<ConfigurableProvider[]>('llm/listConfigurableProviders', {});
  return (list ?? []).filter(p => !p.error && p.provider !== 'deepseek-account');
}

export async function discoverModels(client: HarnessClient, input: { api: string; baseURL?: string; apiKey: string; provider?: string }) {
  const request = { api: input.api, apiKey: input.apiKey, ...(input.baseURL ? { baseURL: normalizeBaseURL(input.baseURL) } : {}), ...(input.provider ? { provider: input.provider } : {}) };
  return client.call<DiscoveredModel[]>('llm/discoverModels', { settingsNs: LLM_NS, request });
}

/** Save a custom provider + its key, and optionally make one of its models the default. */
export async function addCustomProvider(client: HarnessClient, p: { route: string; displayName: string; api: string; baseURL: string; apiKey: string; models: ProviderModel[]; defaultModel?: string }) {
  if (!ROUTE_PATTERN.test(p.route)) throw new Error('Provider id must be lowercase letters, numbers and dashes.');
  if (!p.models.length) throw new Error('Pick at least one model.');
  const apiKeyEnv = keyRefFor(p.route);
  await client.call('settings/mutate', { ns: LLM_NS, ops: [{ op: 'set', path: ['providers', p.route], value: { ...(p.displayName ? { displayName: p.displayName } : {}), apiKeyEnv, api: p.api, baseURL: normalizeBaseURL(p.baseURL), models: p.models } }] });
  await client.call('credentials/set', { ref: apiKeyEnv, value: p.apiKey });
  if (p.defaultModel) await setDefaultModel(client, p.route, p.defaultModel);
}

/** A built-in provider only needs its key (plus a default model, if chosen). */
export async function addBuiltInProvider(client: HarnessClient, p: { provider: string; apiKey: string; defaultModel?: string }) {
  await client.call('credentials/set', { ref: keyRefFor(p.provider), value: p.apiKey });
  if (p.defaultModel) await setDefaultModel(client, p.provider, p.defaultModel);
}

export async function setDefaultModel(client: HarnessClient, provider: string, model: string) {
  await client.call('settings/mutate', { ns: DEFAULT_MODEL_NS, ops: [{ op: 'set', path: ['provider'], value: provider }, { op: 'set', path: ['model'], value: model }] });
}

/** Whether the Harness can run an agent: at least one model in the catalog it can actually use. */
export async function hasUsableModel(client: HarnessClient) {
  const cat = await client.call<{ groups: { models: unknown[] }[] }>('session/modelCatalog', {}).catch(() => null);
  return !!cat?.groups?.some(g => g.models.length > 0);
}
