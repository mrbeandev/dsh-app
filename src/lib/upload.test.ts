import { describe, expect, it, vi } from 'vitest';
import { prepareImport } from './upload';
const mocks = vi.hoisted(() => ({ base64: vi.fn(async () => 'YWJj'), upload: vi.fn(), release: vi.fn() }));
vi.mock('./diagnostics', () => ({ diagnostic: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ File: class { size = 3; base64 = mocks.base64; }, UploadType: { BINARY_CONTENT: 0 }, UploadTask: class { uploadAsync = mocks.upload; release = mocks.release; } }));
const client = { connection: { url: 'http://example.com' }, transferHeaders: { Cookie: 'session=value' } } as any;
describe('native import preparation', () => {
  it('reads raster bytes without requiring AbortSignal.throwIfAborted', async () => {
    const signal = { aborted: false } as AbortSignal;
    expect(await prepareImport(client, 's', { uri: 'file:///a.png', name: 'a.png', size: 3, lastModified: 0 }, signal, () => {}))
      .toEqual({ type: 'image', mediaType: 'image/png', name: 'a.png', data: 'YWJj' });
  });
  it('uploads generic bytes and releases the native handle', async () => {
    mocks.upload.mockResolvedValueOnce({ status: 200, body: '{"ok":true,"value":{"receiptId":"r1"}}' });
    expect(await prepareImport(client, 's', { uri: 'file:///a.pdf', name: 'a.pdf', lastModified: 0 }, { aborted: false } as AbortSignal, () => {}))
      .toEqual({ type: 'file', receiptId: 'r1' });
    expect(mocks.release).toHaveBeenCalled();
  });
});
