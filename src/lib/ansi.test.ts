import { describe, expect, it } from 'vitest';
import { TermBuffer } from './ansi';

describe('TermBuffer', () => {
  it('wraps long input at the terminal width instead of overwriting (bash readline at 64 cols)', () => {
    const t = new TermBuffer(2000, 20);
    const prompt = 'root@host:~# ';
    t.reset(prompt);
    t.write('cd dsh-mobile-test-workspace\r\n'); // 13 + 28 chars → wraps twice at 20 cols
    t.write('TERMINAL_OK\r\n' + prompt);
    expect(t.lines.slice(0, 3).join('')).toBe('root@host:~# cd dsh-mobile-test-workspace');
    expect(t.lines).toContain('TERMINAL_OK');
    expect(t.lines[t.lines.length - 1]).toBe(prompt);
  });
  it('renders the real Harness echo frame cleanly', () => {
    const t = new TermBuffer(2000, 60);
    t.reset('root@localhost:~# \u001b[?2004h');
    t.write('echo DSH_TERM_OK\r\n\u001b[?2004l\rDSH_TERM_OK\r\n\u001b[?2004hroot@localhost:~# ');
    expect(t.lines).toEqual(['root@localhost:~# echo DSH_TERM_OK', 'DSH_TERM_OK', 'root@localhost:~# ']);
  });
  it('handles erase-line, backspace, cursor-left and colour codes', () => {
    const t = new TermBuffer();
    t.write('\u001b[32mgreen\u001b[0m text\r\u001b[Knew');
    expect(t.text()).toBe('new');
    t.write('\nabc\b\bX');
    expect(t.lines[1]).toBe('aXc');
    t.write('\u001b[2DZ');
    expect(t.lines[1]).toBe('ZXc'); // cursor was after X (col 2); 2 left → col 0
  });
  it('clears the screen with ESC[2J and keeps a bounded scrollback', () => {
    const t = new TermBuffer(3); t.write('1\n2\n3\n4\n5');
    expect(t.lines).toEqual(['3', '4', '5']);
    t.write('\u001b[2Jfresh');
    expect(t.lines).toEqual(['fresh']);
  });
});
