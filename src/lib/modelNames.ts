import { useEffect, useState } from 'react';
import type { HarnessClient } from './harness';
import { effortLabel, type Reasoning } from './reasoning';

/**
 * The session only records which model id (and provider) is selected; display names live in the
 * Harness model catalog. Cache that catalog per connection so the composer and Session Details can
 * show the model's name rather than its id.
 */
type Catalog = { groups?: { id: string; name?: string; models?: { id: string; name?: string; reasoning?: Reasoning }[] }[]; providers?: Catalog['groups'] };
const cache = new WeakMap<HarnessClient, Promise<Catalog | null>>();
const listeners = new Set<() => void>();

export function loadCatalog(client: HarnessClient, force = false): Promise<Catalog | null> {
  if (force || !cache.has(client)) {
    const p = client.call<Catalog>('session/modelCatalog', {}).catch(() => null);
    cache.set(client, p);
    void p.then(() => listeners.forEach(l => l()));
  }
  return cache.get(client)!;
}

/** Display name for a model; falls back to the id only when the catalog has no entry for it. */
export function modelName(catalog: Catalog | null | undefined, model?: string, provider?: string): string {
  if (!model) return '';
  const groups = catalog?.groups ?? catalog?.providers ?? [];
  const ordered = provider ? [...groups.filter(g => g.id === provider), ...groups.filter(g => g.id !== provider)] : groups;
  for (const g of ordered) for (const m of g.models ?? []) if (m.id === model || m.name === model) return m.name || m.id;
  return model;
}

/** The catalog entry for a model (provider-aware), for its reasoning levels. */
export function modelEntry(catalog: Catalog | null | undefined, model?: string, provider?: string) {
  if (!model) return undefined;
  const groups = catalog?.groups ?? catalog?.providers ?? [];
  const ordered = provider ? [...groups.filter(g => g.id === provider), ...groups.filter(g => g.id !== provider)] : groups;
  for (const g of ordered) for (const m of g.models ?? []) if (m.id === model || m.name === model) return m;
  return undefined;
}

/** "Claude Opus 5.5 · High": name plus the active reasoning level when the model has levels. */
export function useModelLabel(client: HarnessClient | null, model?: string, provider?: string, effort?: string): { name: string; level?: string } {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!client) return;
    let live = true;
    const update = () => { void loadCatalog(client).then(c => { if (live) setCatalog(c); }); };
    update(); listeners.add(update);
    return () => { live = false; listeners.delete(update); };
  }, [client]);
  return { name: modelName(catalog, model, provider), level: effortLabel(modelEntry(catalog, model, provider)?.reasoning, effort) };
}

export function useModelName(client: HarnessClient | null, model?: string, provider?: string): string {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!client) return;
    let live = true;
    const update = () => { void loadCatalog(client).then(c => { if (live) setCatalog(c); }); };
    update(); listeners.add(update);
    return () => { live = false; listeners.delete(update); };
  }, [client]);
  return modelName(catalog, model, provider);
}
