/** Reasoning levels a model advertises in the Harness model catalog (same data the Web UI uses). */
export type Reasoning = { efforts: { id: string; name: string; description?: string }[]; defaultEffort?: string };
export type EffortChoice = { key: string; effort: string | undefined; label: string };

/**
 * Choices for the "Reasoning" row, matching the Web UI: when the model has no default level, a
 * "Provider default" choice (no `reasoningEffort` sent) comes first, then each advertised level.
 */
export function effortChoices(reasoning: Reasoning | undefined): EffortChoice[] {
  if (!reasoning?.efforts?.length) return [];
  return [
    ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: 'Default' }] : []),
    ...reasoning.efforts.map(e => ({ key: `effort:${e.id}`, effort: e.id, label: e.name || e.id })),
  ];
}

/** Short label for the active level ("High", "Default"), or undefined when the model has no levels. */
export function effortLabel(reasoning: Reasoning | undefined, effort: string | undefined): string | undefined {
  if (!reasoning?.efforts?.length) return undefined;
  const id = effort ?? reasoning.defaultEffort;
  if (id === undefined) return 'Default';
  return reasoning.efforts.find(e => e.id === id)?.name ?? id;
}
