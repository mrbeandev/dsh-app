import { describe, expect, it } from 'vitest';
import { IMPORT_CATEGORIES, imageMediaType, parseUploadReceipt, promptWithImports, type ImportItem } from './imports';
const item = (part: ImportItem['part']): ImportItem => ({ id: 'i', uri: 'file://test', name: 'test', image: false, progress: 1, state: 'ready', part });
describe('composer imports', () => {
  it('groups categories without listing extensions as separate choices', () => {
    expect(IMPORT_CATEGORIES.map(c => c.label)).toEqual(['Images', 'Video', 'Audio', 'PDF', 'Office documents', 'Other files']);
  });
  it('only supported raster formats use image prompt admission', () => {
    expect(imageMediaType('shot.JPG')).toBe('image/jpeg');
    expect(imageMediaType('a', 'image/webp')).toBe('image/webp');
    expect(imageMediaType('a.svg', 'image/svg+xml')).toBeNull();
    expect(imageMediaType('a.heic', 'image/heic')).toBeNull();
    expect(imageMediaType('movie.mp4')).toBeNull();
  });
  it('submits ordered image and staged generic parts with optional text', () => {
    const file = item({ type: 'file', receiptId: 'r1' });
    const image = item({ type: 'image', mediaType: 'image/png', data: 'YWJj', name: 'a.png' });
    expect(promptWithImports(' hello ', [file, image])).toEqual([{ type: 'text', text: 'hello' }, file.part, image.part]);
    expect(promptWithImports('', [file])).toEqual([file.part]);
    expect(() => promptWithImports('hi', [{ ...file, state: 'error' }])).toThrow('Wait');
  });
  it('validates Host receipt responses instead of trusting successful HTTP alone', () => {
    expect(parseUploadReceipt('{"ok":true,"value":{"receiptId":"r1"}}')).toBe('r1');
    expect(() => parseUploadReceipt('{"ok":false,"error":{"message":"not staged"}}')).toThrow('not staged');
    expect(() => parseUploadReceipt('{"ok":true,"value":{}}')).toThrow('receipt');
    expect(() => parseUploadReceipt('<html>')).toThrow('Unexpected');
  });
});
