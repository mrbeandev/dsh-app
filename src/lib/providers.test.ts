import { describe, expect, it, vi } from 'vitest';
import { addBuiltInProvider, addCustomProvider, adoptModel, keyRefFor, normalizeBaseURL, routeFromName, ROUTE_PATTERN } from './providers';
import type { HarnessClient } from './harness';

const fake = () => { const calls: [string, unknown][] = []; return { calls, client: { call: vi.fn(async (m: string, a: unknown) => { calls.push([m, a]); return undefined; }) } as unknown as HarnessClient }; };

describe('adding an AI provider (Harness web UI parity)', () => {
  it('names routes and key refs like the web UI', () => {
    expect(routeFromName('My Router!')).toBe('my-router');
    expect(routeFromName('router.mrbean.dev')).toBe('router-mrbean-dev');
    expect(routeFromName('9router')).toBe('router');
    expect(ROUTE_PATTERN.test(routeFromName('***'))).toBe(true);
    expect(keyRefFor('my-router')).toBe('MY_ROUTER_API_KEY');
    expect(normalizeBaseURL(' https://x.dev/v1/ ')).toBe('https://x.dev/v1');
  });
  it('keeps only the fields the Harness stores for a discovered model', () => {
    expect(adoptModel({ id: 'cc/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', contextWindow: 200000, inputModalities: ['text', 'image'] }))
      .toEqual({ id: 'cc/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', contextWindow: 200000, input: ['text', 'image'] });
  });
  it('saves a custom provider, stores the key separately, then sets the default model', async () => {
    const { calls, client } = fake();
    await addCustomProvider(client, { route: 'my-router', displayName: 'My Router', api: 'openai-completions', baseURL: 'https://router.example/v1/', apiKey: 'sk-test', models: [{ id: 'm1' }], defaultModel: 'm1' });
    expect(calls[0]).toEqual(['settings/mutate', { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'my-router'], value: { displayName: 'My Router', apiKeyEnv: 'MY_ROUTER_API_KEY', api: 'openai-completions', baseURL: 'https://router.example/v1', models: [{ id: 'm1' }] } }] }]);
    expect(JSON.stringify(calls[0])).not.toContain('sk-test'); // the key never goes into settings
    expect(calls[1]).toEqual(['credentials/set', { ref: 'MY_ROUTER_API_KEY', value: 'sk-test' }]);
    expect(calls[2]).toEqual(['settings/mutate', { ns: 'agent-default-model', ops: [{ op: 'set', path: ['provider'], value: 'my-router' }, { op: 'set', path: ['model'], value: 'm1' }] }]);
  });
  it('a built-in provider only needs its key', async () => {
    const { calls, client } = fake();
    await addBuiltInProvider(client, { provider: 'anthropic', apiKey: 'k' });
    expect(calls).toEqual([['credentials/set', { ref: 'ANTHROPIC_API_KEY', value: 'k' }]]);
  });
  it('refuses a bad route or no models', async () => {
    const { client } = fake();
    await expect(addCustomProvider(client, { route: 'Bad Route', displayName: '', api: 'openai-completions', baseURL: 'https://x', apiKey: 'k', models: [{ id: 'a' }] })).rejects.toThrow(/lowercase/);
    await expect(addCustomProvider(client, { route: 'ok', displayName: '', api: 'openai-completions', baseURL: 'https://x', apiKey: 'k', models: [] })).rejects.toThrow(/at least one model/);
  });
});
