import type { HarnessClient } from './harness';

/**
 * Session access modes (Harness permission presets). Labels follow the Web UI
 * (dsh-client-ui-permission-presets); any name/description the Harness returns wins.
 */
export const ACCESS: Record<string, { title: string; detail: string }> = {
  'read-only': { title: 'Read Only', detail: 'Can read files; asks before changing anything' },
  'workspace-write': { title: 'Workspace Write', detail: 'Edits inside the workspace; asks for anything else' },
  'danger-full-access': { title: 'Full access', detail: 'No sandbox and no approval prompts' },
  auto: { title: 'Auto review', detail: 'Full access with automatic review (experimental)' },
};
export type AccessOption = { value: string; name?: string; description?: string; isDefault?: boolean };

const titleCase = (v: string) => v.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const accessTitle = (value: string, name?: string) => name || ACCESS[value]?.title || titleCase(value);
/** Modes the Web UI asks you to confirm before switching to. */
export const needsAccessConfirm = (value: string) => value === 'danger-full-access' || value === 'auto';
export const ACCESS_WARNING = 'The agent can run any command and change any file without asking. Use only in a trusted, disposable environment.';

export async function accessCatalog(client: HarnessClient): Promise<{ options: AccessOption[]; defaultPreset?: string }> {
  const v: any = await client.call('permissionPresets/catalog', {});
  return { defaultPreset: v?.defaultPreset, options: (v?.options ?? []).map((o: any) => ({ value: String(o.value), isDefault: o.value === v?.defaultPreset, name: o.name !== o.value ? o.name : undefined, description: o.description })) };
}

/** Change a live session's access mode the way the Web UI does: run its `/permission <preset>` command. */
export async function setSessionAccess(client: HarnessClient, sessionId: string, preset: string) {
  const r: any = await client.call('commands/execute', { agentId: sessionId, line: `/permission ${preset}`, submittedAttachments: [] });
  if (r && r.matched === false) throw new Error('This Harness has no /permission command.');
  if (r?.result?.kind && r.result.kind !== 'success') throw new Error(String(r.result.text || r.result.message || 'The Harness refused this access mode.'));
  return r;
}
