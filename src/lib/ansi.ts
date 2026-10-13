/**
 * Minimal terminal text model for a mobile line view. Models a fixed-width screen with
 * autowrap (bash/readline rely on it when a line is longer than the width), CR / LF / backspace,
 * tabs, erase-line / erase-display and basic cursor moves. Colour and other control sequences
 * are dropped. Not a full VT emulator — full-screen TUIs (vim, htop) won't render — but shells,
 * logs and command output read correctly.
 */
const OSC = /\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g;
const CSI = /\u001b\[([0-?]*)[ -/]*([@-~])/y;

export class TermBuffer {
  lines: string[] = [''];
  private row = 0;
  private col = 0;
  private wrapNext = false;
  constructor(private max = 2000, public cols = 80) {}

  private ensureRow() { while (this.lines.length <= this.row) this.lines.push(''); }
  private newline() { this.row++; this.ensureRow(); this.col = 0; this.wrapNext = false; }
  private put(ch: string) {
    if (this.wrapNext) this.newline();
    const line = this.lines[this.row];
    this.lines[this.row] = line.slice(0, this.col).padEnd(this.col, ' ') + ch + line.slice(this.col + 1);
    if (this.col >= this.cols - 1) this.wrapNext = true; else this.col++;
  }
  private csi(params: string, final: string) {
    if (params.startsWith('?')) return; // private modes (bracketed paste, cursor visibility…)
    const n = Math.max(1, parseInt(params || '1', 10) || 1);
    const line = this.lines[this.row];
    switch (final) {
      case 'K': this.lines[this.row] = params === '1' ? ' '.repeat(this.col) + line.slice(this.col + 1) : params === '2' ? '' : line.slice(0, this.col); break;
      case 'J': if (params === '2' || params === '3') { this.lines = ['']; this.row = 0; this.col = 0; } else { this.lines = this.lines.slice(0, this.row + 1); this.lines[this.row] = line.slice(0, this.col); } break;
      case 'A': this.row = Math.max(0, this.row - n); break;
      case 'B': this.row += n; this.ensureRow(); break;
      case 'C': this.col = Math.min(this.cols - 1, this.col + n); break;
      case 'D': this.col = Math.max(0, this.col - n); break;
      case 'G': this.col = Math.min(this.cols - 1, n - 1); break;
      case 'P': this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + n); break;
      case '@': this.lines[this.row] = line.slice(0, this.col) + ' '.repeat(n) + line.slice(this.col); break;
      default: return;
    }
    this.wrapNext = false;
  }

  write(data: string) {
    const clean = data.replace(OSC, '');
    let i = 0;
    while (i < clean.length) {
      const ch = clean[i];
      if (ch === '\u001b') {
        CSI.lastIndex = i; const m = CSI.exec(clean);
        if (m) { this.csi(m[1], m[2]); i += m[0].length; } else i += 2; // drop other two-byte escapes
        continue;
      }
      i++;
      if (ch === '\n') this.newline();
      else if (ch === '\r') { this.col = 0; this.wrapNext = false; }
      else if (ch === '\b') { this.col = Math.max(0, this.col - 1); this.wrapNext = false; }
      else if (ch === '\t') { const next = Math.min(this.cols - 1, (Math.floor(this.col / 8) + 1) * 8); while (this.col < next && !this.wrapNext) this.put(' '); }
      else if (ch >= ' ' && ch !== '\u007f') this.put(ch);
    }
    if (this.lines.length > this.max) { const drop = this.lines.length - this.max; this.lines = this.lines.slice(drop); this.row = Math.max(0, this.row - drop); }
  }
  reset(screen: string) { this.lines = ['']; this.row = 0; this.col = 0; this.wrapNext = false; this.write(screen); }
  text() { return this.lines.join('\n'); }
}
