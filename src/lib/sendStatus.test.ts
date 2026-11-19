import { describe, expect, it } from 'vitest';
import { sendStatus } from './sendStatus';

describe('message status while sending', () => {
  it('shows upload progress, then delivery, then where the Harness put it', () => {
    expect(sendStatus({ mode: 'steer', progress: 0.42 }).label).toBe('Uploading 42%');
    expect(sendStatus({ mode: 'steer', progress: 1 }).label).toBe('Sending to steer…');
    expect(sendStatus({ mode: 'queue' }).label).toBe('Sending…');
    expect(sendStatus({ mode: 'steer', progress: 0.3 }, 'steering')).toMatchObject({ tone: 'primary', label: expect.stringMatching(/^Steering/) });
    expect(sendStatus({ mode: 'steer' }, 'queued').label).toMatch(/^Queued/);
  });
});
