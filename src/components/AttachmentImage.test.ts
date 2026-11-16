import { describe, expect, it, vi } from 'vitest';
import type { HarnessClient } from '../lib/harness';
vi.mock('react-native', () => ({ Image: () => null, Pressable: () => null, View: () => null }));
vi.mock('../state/app', () => ({ useApp: () => ({}) }));
vi.mock('./ui', () => ({ T: () => null }));
vi.mock('./Loader', () => ({ Loading: () => null }));
vi.mock('./ImageViewer', () => ({ ImageViewer: () => null }));
const { fetchAttachment } = await import('./AttachmentImage');
const { imagesOf } = await import('../lib/protocol');

const block = { type: 'image', attachment: { attachmentId: 'att-1', mediaType: 'image/jpeg', bytes: 1234, width: 800, height: 600, name: 'shot.jpg' } };

describe('loading message images', () => {
  it('keeps the Harness image reference from the message', () => {
    expect(imagesOf([block])[0].ref).toEqual(block.attachment);
  });
  it('sends the whole reference on Harness 0.2.2', async () => {
    const request = vi.fn(async () => ({ attachment: { mediaType: 'image/jpeg' }, data: 'AAA' }));
    await fetchAttachment({ request } as unknown as HarnessClient, 's1', imagesOf([block])[0]);
    expect(request).toHaveBeenCalledWith('session/attachment', { sessionId: 's1', attachment: block.attachment });
  });
  it('falls back to the 0.2.1 shape when the Harness rejects the new one', async () => {
    const request = vi.fn(async (_m: string, args: Record<string, unknown>) => {
      if ('attachment' in args) throw new Error('typert gateway: session/attachment: wire field "request" failed boundary validation');
      return { attachment: { mediaType: 'image/jpeg' }, data: 'BBB' };
    });
    const client = { request } as unknown as HarnessClient;
    expect((await fetchAttachment(client, 's1', imagesOf([block])[0])).data).toBe('BBB');
    expect(request).toHaveBeenLastCalledWith('session/attachment', { sessionId: 's1', attachmentId: 'att-1' });
    await fetchAttachment(client, 's1', imagesOf([block])[0]);
    expect(request).toHaveBeenCalledTimes(3); // remembered: second image goes straight to the old shape
  });
});
