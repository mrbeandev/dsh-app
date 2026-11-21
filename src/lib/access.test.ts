import { describe, expect, it, vi } from 'vitest';
import { accessTitle, needsAccessConfirm, setSessionAccess } from './access';
import type { HarnessClient } from './harness';

describe('session access mode', () => {
  it('labels modes like the web UI, preferring the Harness name', () => {
    expect(accessTitle('danger-full-access')).toBe('Full access');
    expect(accessTitle('read-only', 'Read only (custom)')).toBe('Read only (custom)');
    expect(accessTitle('my-preset')).toBe('My Preset');
  });
  it('asks before full access or auto review only', () => {
    expect(needsAccessConfirm('danger-full-access')).toBe(true);
    expect(needsAccessConfirm('auto')).toBe(true);
    expect(needsAccessConfirm('read-only')).toBe(false);
  });
  it('switches with the /permission command and reports a refusal', async () => {
    const call = vi.fn(async () => ({ commandId: 'c1', result: { kind: 'success', text: 'preset read-only' } }));
    await setSessionAccess({ call } as unknown as HarnessClient, 's1', 'read-only');
    expect(call).toHaveBeenCalledWith('commands/execute', { agentId: 's1', line: '/permission read-only', submittedAttachments: [] });
    const bad = vi.fn(async () => ({ result: { kind: 'error', text: 'unknown preset' } }));
    await expect(setSessionAccess({ call: bad } as unknown as HarnessClient, 's1', 'x')).rejects.toThrow('unknown preset');
  });
});
