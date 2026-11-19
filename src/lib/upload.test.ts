import { describe, expect, it, vi } from 'vitest';
import { isCanonicalBase64, prepareImport } from './upload';
const mocks = vi.hoisted(() => ({ base64: vi.fn(async () => 'YWJj'), upload: vi.fn(), release: vi.fn(), manipulate: vi.fn() }));
vi.mock('./diagnostics', () => ({ diagnostic: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ File: class { size = 3; base64 = mocks.base64; }, UploadType: { BINARY_CONTENT: 0 }, UploadTask: class { uploadAsync = mocks.upload; release = mocks.release; } }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: mocks.manipulate }, SaveFormat: { JPEG: 'jpeg' } }));
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

describe('image base64 sent to the Harness', () => {
  const png = { uri: 'file:///a.png', name: 'a.png', size: 3, lastModified: 0 };
  it('matches the Harness canonical check', () => {
    // Mirrors the Harness: decode then re-encode must give back the same string.
    const ok = (s: string) => { try { return btoa(atob(s)) === s; } catch { return false; } };
    for (const s of ['YWJj', 'YWI=', 'YQ==', 'aGVsbG8gaW1hZ2U=']) { expect(isCanonicalBase64(s)).toBe(true); expect(ok(s)).toBe(true); }
    for (const s of ['YWJ', 'YW Jj', 'YWJj\n', 'Y=Jj', '']) expect(isCanonicalBase64(s)).toBe(false);
  });
  it('strips line breaks from wrapped base64', async () => {
    mocks.base64.mockResolvedValueOnce('aGVs\nbG8h');
    expect(await prepareImport(client, 's', png, { aborted: false } as AbortSignal, () => {})).toMatchObject({ data: 'aGVsbG8h' });
  });
  it('re-reads a file caught mid-write (truncated) instead of sending invalid base64', async () => {
    mocks.base64.mockResolvedValueOnce('aGVsbG8').mockResolvedValueOnce('aGVsbG8h');
    expect(await prepareImport(client, 's', png, { aborted: false } as AbortSignal, () => {})).toMatchObject({ data: 'aGVsbG8h' });
  });
  it('gives a clear error when the image still can’t be read completely', async () => {
    mocks.base64.mockResolvedValueOnce('aGVsbG8').mockResolvedValueOnce('aGVsbG8');
    await expect(prepareImport(client, 's', png, { aborted: false } as AbortSignal, () => {})).rejects.toThrow(/attach it again/);
  });
});

describe('request time limits', () => {
  it('gives large messages time to upload over slow tunnels, capped at 10 minutes', async () => {
    const { uploadTimeoutMs } = await import('./requestTimeout');
    expect(uploadTimeoutMs(2_000)).toBe(21_000);            // small calls keep ~20 s
    expect(uploadTimeoutMs(1_000_000)).toBe(120_000);       // two shrunk photos as base64 (~1 MB): 2 min
    expect(uploadTimeoutMs(50_000_000)).toBe(600_000);      // capped at 10 min
  });
});
