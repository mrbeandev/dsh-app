import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { XTERM_CSS, XTERM_FIT_JS, XTERM_JS } from '../web-assets/xterm';

export type XTermHandle = { write: (data: string) => void; reset: (screen: string) => void; setFontSize: (px: number) => void; focus: () => void; blur: () => void };
type Props = { fontSize: number; dark: boolean; onInput: (data: string) => void; onResize: (cols: number, rows: number) => void; onReady?: () => void };

/**
 * A real terminal emulator: xterm.js (bundled, offline) in a WebView.
 * Output arrives through `write`/`reset`; every keystroke (incl. Ctrl/arrows/paste) comes back via
 * `onInput`; `onResize` reports cols/rows after fitting the view, so the Harness PTY matches.
 */
export const XTerm = forwardRef<XTermHandle, Props>(function XTerm({ fontSize, dark, onInput, onResize, onReady }, ref) {
  const web = useRef<WebView>(null);
  const js = (code: string) => web.current?.injectJavaScript(`${code};true;`);
  useImperativeHandle(ref, () => ({
    write: data => js(`window.__w(${JSON.stringify(data)})`),
    reset: screen => js(`window.__reset(${JSON.stringify(screen)})`),
    setFontSize: px => js(`window.__font(${px})`),
    focus: () => js('window.__term&&window.__term.focus()'),
    blur: () => js('window.__term&&window.__term.blur()'),
  }));
  const bg = dark ? '#0a0a0b' : '#1b1d21';
  // The page is created once (initial font only); later changes go through setFontSize so the session isn't reloaded.
  const [initialFont] = useState(fontSize);
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${XTERM_CSS}html,body{margin:0;height:100%;background:${bg};overflow:hidden}#t{position:absolute;inset:6px 4px 4px 8px}.xterm .xterm-viewport{background:${bg}!important}</style></head>
<body><div id="t"></div>
<script>${XTERM_JS.replace(/<\/script/gi, '<\\/script')}</script>
<script>${XTERM_FIT_JS.replace(/<\/script/gi, '<\\/script')}</script>
<script>
const post=(t,v)=>window.ReactNativeWebView.postMessage(JSON.stringify({t,v}));
const term=new Terminal({fontSize:${initialFont},fontFamily:'monospace',cursorBlink:true,scrollback:5000,allowProposedApi:true,convertEol:false,
  theme:{background:'${bg}',foreground:'#e6e6e6',cursor:'#89baff',selectionBackground:'#89baff55',black:'#1d1f21',red:'#ff6b6b',green:'#69db7c',yellow:'#ffd43b',blue:'#74c0fc',magenta:'#da77f2',cyan:'#66d9e8',white:'#e9ecef',brightBlack:'#868e96'}});
const fit=new FitAddon.FitAddon();term.loadAddon(fit);term.open(document.getElementById('t'));
window.__term=term;
let last='';const refit=()=>{try{fit.fit();const k=term.cols+'x'+term.rows;if(k!==last){last=k;post('resize',[term.cols,term.rows]);}}catch(e){}};
window.__w=d=>term.write(d);
window.__reset=s=>{term.reset();term.write(s);};
window.__font=px=>{term.options.fontSize=px;refit();};
// Android soft keyboards deliver text through IME composition AND synthetic key events, and xterm
// forwards both, so every character arrives twice (top -> topopp). Take printable text only from
// the textarea's input events (diffed so autocorrect rewrites send backspaces + replacement), and
// let xterm's own onData through only for control/escape sequences (Enter, arrows, ^C, paste).
const ta=document.querySelector('.xterm-helper-textarea');
let prev='';
const sync=()=>{ if(!ta) return; const now=ta.value; let i=0; while(i<prev.length&&i<now.length&&prev[i]===now[i]) i++;
  const del=prev.length-i, add=now.slice(i); if(del>0) post('input','\\x7f'.repeat(del)); if(add) post('input',add.replace(/\\n/g,'\\r')); prev=now;
  if(now.length>200){ ta.value=''; prev=''; } };
if(ta){ ta.setAttribute('autocorrect','off'); ta.setAttribute('autocapitalize','off'); ta.setAttribute('spellcheck','false');
  ta.addEventListener('input',e=>{ e.stopImmediatePropagation(); sync(); },true);
  ta.addEventListener('compositionend',()=>sync(),true);
  ta.addEventListener('keydown',e=>{ if(e.key==='Enter'){ ta.value=''; prev=''; } },true); }
term.onData(d=>{ // pass control keys and multi-char sequences (paste, arrows); drop printable singles the IME already sent
  if(ta && d.length===1 && d>=' ' && d!=='\\x7f') return;
  if(ta && d.length>1 && !d.startsWith('\\x1b') && /^[\\x20-\\x7e]+$/.test(d) && document.activeElement===ta && !window.__pasting) return;
  post('input',d); });
document.addEventListener('paste',()=>{ window.__pasting=true; setTimeout(()=>window.__pasting=false,0); },true);
new ResizeObserver(refit).observe(document.getElementById('t'));
setTimeout(()=>{refit();post('ready',null);},30);
</script></body></html>`, [bg, initialFont]);
  return <View style={{ flex: 1, backgroundColor: bg }}>
    <WebView ref={web} originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: bg }} javaScriptEnabled keyboardDisplayRequiresUserAction={false} hideKeyboardAccessoryView
      setSupportMultipleWindows={false} allowFileAccess={false} overScrollMode="never" bounces={false}
      onMessage={e => { try { const m = JSON.parse(e.nativeEvent.data); if (m.t === 'input') onInput(m.v); else if (m.t === 'resize') onResize(m.v[0], m.v[1]); else if (m.t === 'ready') onReady?.(); } catch { /* ignore */ } }} />
  </View>;
});
