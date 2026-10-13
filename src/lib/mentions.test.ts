import { describe, expect, it } from 'vitest';
import { activeAtToken, applyMention, formatFileMention } from './mentions';

describe('@ mention grammar (Web UI parity)', () => {
  it('detects a token at the start or after whitespace, not inside words', () => {
    expect(activeAtToken('@src/ap', 7)).toMatchObject({ query: 'src/ap', quoted: false, start: 0 });
    expect(activeAtToken('look at @READ', 13)).toMatchObject({ query: 'READ', start: 8 });
    expect(activeAtToken('mail me@host', 12)).toBeUndefined();
    expect(activeAtToken('see @"My Docs/ne', 16)).toMatchObject({ query: 'My Docs/ne', quoted: true });
  });
  it('formats exactly like formatFileMention', () => {
    expect(formatFileMention({ path: 'src/app.tsx', kind: 'file' })).toBe('@src/app.tsx');
    expect(formatFileMention({ path: 'src', kind: 'directory' })).toBe('@src/');
    expect(formatFileMention({ path: 'My Docs/a b.md', kind: 'file' })).toBe('@"My Docs/a b.md"');
    expect(formatFileMention({ path: 'My Docs', kind: 'directory' })).toBe('@"My Docs/');
    expect(formatFileMention({ path: 'bad"quote', kind: 'file' })).toBeUndefined();
  });
  it('replaces the active token and adds a space after files only', () => {
    const t = activeAtToken('fix @sr please', 7)!;
    expect(applyMention('fix @sr please', t, 7, '@src/app.tsx', false)).toEqual({ text: 'fix @src/app.tsx please', caret: 16 });
    const d = activeAtToken('fix @sr', 7)!;
    expect(applyMention('fix @sr', d, 7, '@src/', true)).toEqual({ text: 'fix @src/', caret: 9 });
  });
});
