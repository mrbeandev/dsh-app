import { describe, expect, it } from 'vitest';
import { fileMediaUrl, isWebImage, markdownImagePath } from './fileMedia';

describe('images linked in agent replies', () => {
  it('reads absolute Harness paths, including <angle bracket> destinations', () => {
    expect(markdownImagePath('</tmp/steer-desk.png>')).toBe('/tmp/steer-desk.png');
    expect(markdownImagePath('/tmp/a%20b.png')).toBe('/tmp/a b.png');
    expect(markdownImagePath('file:///home/u/shot.jpg')).toBe('/home/u/shot.jpg');
  });
  it('resolves relative paths against the session folder', () => {
    expect(markdownImagePath('docs/shot.png', '/mnt/proj/')).toBe('/mnt/proj/docs/shot.png');
    expect(markdownImagePath('../x/y.png', '/mnt/proj/sub')).toBe('/mnt/proj/x/y.png');
    expect(markdownImagePath('shot.png')).toBeUndefined(); // no folder known
  });
  it('leaves web images and other schemes alone', () => {
    expect(isWebImage('https://example.com/a.png')).toBe(true);
    expect(markdownImagePath('https://example.com/a.png')).toBeUndefined();
    expect(markdownImagePath('data:image/png;base64,AAA')).toBeUndefined();
    expect(markdownImagePath('//evil/share.png')).toBeUndefined();
  });
  it('builds the same /api/file URL as the web UI', () => {
    expect(fileMediaUrl('https://dsh.example.dev', '/tmp/steer-desk.png')).toBe('https://dsh.example.dev/api/file?path=%2Ftmp%2Fsteer-desk.png');
    expect(fileMediaUrl('http://127.0.0.1:3080/', '/a b.png')).toBe('http://127.0.0.1:3080/api/file?path=%2Fa%20b.png');
  });
});
