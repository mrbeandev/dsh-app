/**
 * Terminal extra keys with sticky modifiers (Ctrl / Shift / Alt), the way Termux's extra-keys row works:
 * tap a modifier to latch it for the next key (typed or tapped), tap again to release.
 * Escape codes follow xterm: modified cursor/navigation keys use CSI 1;<m> (m = 1 + shift + 2·alt + 4·ctrl).
 */
export type Mods = { ctrl: boolean; shift: boolean; alt: boolean };
export const NO_MODS: Mods = { ctrl: false, shift: false, alt: false };
export const anyMod = (m: Mods) => m.ctrl || m.shift || m.alt;

/** Navigation keys: the final byte of their CSI sequence, or a `~`-style code. */
const NAV: Record<string, { final?: string; tilde?: number }> = {
  up: { final: 'A' }, down: { final: 'B' }, right: { final: 'C' }, left: { final: 'D' },
  home: { final: 'H' }, end: { final: 'F' }, pgup: { tilde: 5 }, pgdn: { tilde: 6 },
};

/** Bytes for a special key with the given modifiers. */
export function keyBytes(key: string, m: Mods): string {
  if (key === 'esc') return '\u001b';
  if (key === 'tab') return m.shift ? '\u001b[Z' : '\t';
  const nav = NAV[key];
  if (nav) {
    const code = 1 + (m.shift ? 1 : 0) + (m.alt ? 2 : 0) + (m.ctrl ? 4 : 0);
    if (nav.final) return code === 1 ? `\u001b[${nav.final}` : `\u001b[1;${code}${nav.final}`;
    return code === 1 ? `\u001b[${nav.tilde}~` : `\u001b[${nav.tilde};${code}~`;
  }
  return '';
}

/**
 * Apply latched modifiers to text typed on the keyboard (one character): Shift upper-cases,
 * Ctrl turns letters/@[\]^_ into control codes (and Ctrl+Space → NUL), Alt prefixes ESC.
 */
export function applyMods(data: string, m: Mods): string {
  if (!anyMod(m) || data.length !== 1) return data;
  let out = m.shift ? data.toUpperCase() : data;
  if (m.ctrl) {
    if (out === ' ') out = '\u0000';
    else {
      const c = out.toUpperCase().charCodeAt(0);
      if (c >= 64 && c <= 95) out = String.fromCharCode(c - 64);
      else if (out === '?') out = '\u007f';
    }
  }
  return m.alt ? `\u001b${out}` : out;
}
