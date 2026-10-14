import { describe, expect, it } from 'vitest';
import { endAlert, firstLine, requestAlert, shouldDeliver } from './notify';

describe('notification decisions', () => {
  it('finished turn → first line of the reply', () => {
    expect(endAlert({ kind: 'completed' }, 's1', 'Fix login', '## Done\n\nAll **tests** pass now.', false)).toMatchObject({ kind: 'finished', body: 'Done' });
  });
  it('errors and quota → failed', () => {
    expect(endAlert({ kind: 'error', error: { code: 'QUOTA' } }, 's', 't', '', false)?.body).toBe('Usage quota reached.');
    expect(endAlert({ kind: 'error', error: { message: 'Could not reach the model gateway\nstack…' } }, 's', 't', '', false)).toMatchObject({ kind: 'failed', body: 'Could not reach the model gateway' });
    expect(endAlert({ kind: 'max-tokens' }, 's', 't', '', false)?.kind).toBe('failed');
  });
  it('my own stop is silent; other cancels are reported', () => {
    expect(endAlert({ kind: 'aborted', reason: { kind: 'user' } }, 's', 't', '', false)).toBeNull();
    expect(endAlert({ kind: 'aborted', reason: { kind: 'timeout' } }, 's', 't', '', true)).toBeNull();
    expect(endAlert({ kind: 'aborted', reason: { kind: 'timeout' } }, 's', 't', '', false)?.kind).toBe('stopped');
  });
  it('questions, approvals, plan reviews → needs input', () => {
    expect(requestAlert({ agentId: 's', event: 'questions/ask', request: { questions: [{ id: 'q', question: 'Which database?' }] } }, 't')?.body).toBe('Which database?');
    expect(requestAlert({ agentId: 's', event: 'approval/request', request: { toolName: 'bash' } }, 't')?.body).toBe('Approval needed: bash.');
    expect(requestAlert({ agentId: 's', event: 'approval/request', request: {} }, 't')?.body).toBe('Approval needed.');
    expect(requestAlert({ agentId: 's', request: { questions: [{ id: 'p', intent: { kind: 'plan-review', approve: 'Approve' }, question: 'Approve?' }] } }, 't')?.body).toBe('Plan ready for your review.');
    expect(requestAlert({}, 't')).toBeNull();
  });
  it('no alert for the thread on screen; respects muted kinds', () => {
    const a = { kind: 'finished' as const, sessionId: 's', title: 't', body: 'b' };
    const all = { input: true, finished: true, failed: true, stopped: true };
    expect(shouldDeliver(a, { foreground: true, viewing: 's', enabled: all })).toBe(false);
    expect(shouldDeliver(a, { foreground: false, viewing: 's', enabled: all })).toBe(true);
    expect(shouldDeliver(a, { foreground: true, viewing: 'x', enabled: { ...all, finished: false } })).toBe(false);
  });
  it('firstLine trims and shortens', () => { expect(firstLine('x'.repeat(200)).length).toBe(140); });
  it('keeps underscores and asterisks inside words, strips Markdown syntax', () => {
    expect(firstLine('NOTIFY_TWO')).toBe('NOTIFY_TWO');
    expect(firstLine('## Fixed **login** in `auth_service.py` for _all_ users')).toBe('Fixed login in auth_service.py for all users');
    expect(firstLine('> quoted\nmore')).toBe('quoted');
    expect(firstLine('- item one')).toBe('item one');
  });
});
