import { describe, expect, it } from 'vitest';
import { applyMods, keyBytes, NO_MODS } from './termKeys';

const m = (o: Partial<typeof NO_MODS>) => ({ ...NO_MODS, ...o });
describe('terminal sticky modifiers', () => {
  it('sends Ctrl codes for typed letters (Ctrl+C interrupts, Ctrl+D ends input)', () => {
    expect(applyMods('c', m({ ctrl: true }))).toBe('\u0003');
    expect(applyMods('d', m({ ctrl: true }))).toBe('\u0004');
    expect(applyMods(' ', m({ ctrl: true }))).toBe('\u0000');
  });
  it('Shift upper-cases, Alt prefixes ESC, and they combine', () => {
    expect(applyMods('a', m({ shift: true }))).toBe('A');
    expect(applyMods('b', m({ alt: true }))).toBe('\u001bb');
    expect(applyMods('x', m({ ctrl: true, alt: true }))).toBe('\u001b\u0018');
    expect(applyMods('ab', m({ ctrl: true }))).toBe('ab'); // pasted text is left alone
  });
  it('uses xterm codes for modified arrows and navigation keys', () => {
    expect(keyBytes('up', NO_MODS)).toBe('\u001b[A');
    expect(keyBytes('left', m({ ctrl: true }))).toBe('\u001b[1;5D');
    expect(keyBytes('right', m({ shift: true }))).toBe('\u001b[1;2C');
    expect(keyBytes('pgup', m({ alt: true }))).toBe('\u001b[5;3~');
    expect(keyBytes('tab', m({ shift: true }))).toBe('\u001b[Z');
    expect(keyBytes('esc', m({ ctrl: true }))).toBe('\u001b');
  });
});
