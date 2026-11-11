import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-media-library', () => ({ Asset: class {}, AssetField: {}, MediaType: { IMAGE: 'image', VIDEO: 'video' }, Query: class {}, getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(), presentPermissionsPicker: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
const { accessOf, durationLabel, mimeFromName, needsJpeg } = await import('./recentMedia');
const { clampOffset } = await import('./zoom');

describe('recent media gallery', () => {
  it('reads the permission result as granted, limited or denied', () => {
    expect(accessOf({ granted: true, accessPrivileges: 'all' })).toBe('granted');
    expect(accessOf({ granted: true, accessPrivileges: 'limited' })).toBe('limited');
    expect(accessOf({ granted: false })).toBe('denied');
  });
  it('labels video durations', () => {
    expect(durationLabel(7000)).toBe('0:07'); expect(durationLabel(83_000)).toBe('1:23'); expect(durationLabel(3_723_000)).toBe('1:02:03'); expect(durationLabel(null)).toBe('');
  });
  it('converts only formats models cannot take as images (HEIC) to JPEG', () => {
    expect(needsJpeg('IMG_1234.HEIC')).toBe(true); expect(needsJpeg('photo.heif')).toBe(true);
    expect(needsJpeg('shot.png')).toBe(false); expect(needsJpeg('a.JPG')).toBe(false); expect(needsJpeg('b.webp')).toBe(false);
  });
  it('maps names to MIME types, falling back by media kind', () => {
    expect(mimeFromName('a.jpg', false)).toBe('image/jpeg'); expect(mimeFromName('clip.mov', true)).toBe('video/quicktime'); expect(mimeFromName('noext', true)).toBe('video/mp4');
  });
});

describe('image zoom', () => {
  it('limits panning to the zoomed overflow and allows none at 1×', () => {
    expect(clampOffset(500, 1, 400)).toBe(0);
    expect(clampOffset(500, 2, 400)).toBe(200); expect(clampOffset(-500, 2, 400)).toBe(-200); expect(clampOffset(50, 2, 400)).toBe(50);
  });
});
