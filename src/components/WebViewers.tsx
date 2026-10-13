import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useApp } from '../state/app';
import { Loading } from './Loader';
import { T } from './ui';
import { PDF_JS, PDF_WORKER_JS } from '../web-assets/pdfjs';
import { XLSX_JS } from '../web-assets/xlsx';

/** Base64 of bytes without a dependency (chunked to avoid call-stack limits). */
export function toBase64(bytes: Uint8Array) {
  let bin = ''; const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  return globalThis.btoa(bin);
}
const esc = (s: string) => s.replace(/<\/script/gi, '<\\/script');

function Page({ html, label }: { html: string; label: string }) {
  const { colors } = useApp(); const [ready, setReady] = useState(false); const [error, setError] = useState('');
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <WebView originWhitelist={['*']} source={{ html }} style={{ flex: 1, backgroundColor: colors.bg }} javaScriptEnabled setSupportMultipleWindows={false} allowFileAccess={false}
      onMessage={e => { const m = e.nativeEvent.data; if (m === 'ready') setReady(true); else if (m.startsWith('error:')) setError(m.slice(6)); }} />
    {!ready && !error ? <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.bg }}><Loading label={label} /></View> : null}
    {error ? <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}><T style="footnote" color="danger" align="center">{error}</T></View> : null}
  </View>;
}

/** PDF viewer: pdf.js renders every page to a canvas (bundled, works offline); pinch-zoom via viewport. */
export function PdfViewer({ bytes }: { bytes: Uint8Array }) {
  const { colors } = useApp();
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>body{margin:0;background:${colors.bg};color:${colors.text};font:13px -apple-system,Roboto,sans-serif}#p{display:flex;flex-direction:column;align-items:center;gap:10px;padding:10px 0 24px}canvas{max-width:96vw;height:auto;border-radius:6px;box-shadow:0 1px 6px #0006;background:#fff}.n{color:${colors.muted};font-size:11px}</style></head>
<body><div id="p"></div>
<script id="w" type="text/plain">${esc(PDF_WORKER_JS)}</script>
<script type="module">
${esc(PDF_JS)}
const post=m=>window.ReactNativeWebView.postMessage(m);
try{
  const lib=globalThis.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([document.getElementById('w').textContent],{type:'text/javascript'}));
  const raw=atob("${toBase64(bytes)}");const data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
  const doc=await lib.getDocument({data,isEvalSupported:false}).promise;const host=document.getElementById('p');const dpr=Math.min(2,window.devicePixelRatio||1);
  for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const vp=page.getViewport({scale:(window.innerWidth*0.96/page.getViewport({scale:1}).width)*dpr});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;c.style.width=(vp.width/dpr)+'px';host.appendChild(c);
    const lab=document.createElement('div');lab.className='n';lab.textContent=n+' / '+doc.numPages;host.appendChild(lab);
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;if(n===1)post('ready');}
  if(doc.numPages===0)post('ready');
}catch(e){post('error:Couldn’t open this PDF: '+(e&&e.message||e));}
</script></body></html>`, [bytes, colors.bg, colors.text, colors.muted]);
  return <Page html={html} label="Rendering PDF…" />;
}

/** Spreadsheet viewer (xlsx/xls/ods/csv/tsv) via SheetJS: sheet tabs + a sticky-header table. */
export function SheetViewer({ bytes, name }: { bytes: Uint8Array; name: string }) {
  const { colors } = useApp();
  const html = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<style>body{margin:0;background:${colors.bg};color:${colors.text};font:12.5px -apple-system,Roboto,sans-serif}
html,body{height:100%}body{display:flex;flex-direction:column}#tabs{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:8px;background:${colors.bg}}
#tabs button{border:1px solid ${colors.border};background:${colors.fill};color:${colors.text};border-radius:14px;padding:5px 12px;font:inherit;white-space:nowrap}
#tabs button.on{background:${colors.text};color:${colors.bg}}
#wrap{flex:1 1 auto;overflow:auto;max-width:100vw}table{border-collapse:separate;border-spacing:0;font-variant-numeric:tabular-nums}
td,th{border-right:1px solid ${colors.border};border-bottom:1px solid ${colors.border};padding:4px 8px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
thead th{position:sticky;top:0;background:${colors.grouped};color:${colors.muted};font-weight:600;z-index:2;text-align:center}thead th:first-child{left:0;z-index:3}
tbody th{position:sticky;left:0;background:${colors.grouped};color:${colors.muted};font-weight:500}
.note{flex:0 0 auto;padding:6px 12px;color:${colors.muted};font-size:11px}</style></head>
<body><div id="tabs"></div><div id="wrap"></div><div class="note" id="note"></div>
<script>${esc(XLSX_JS)}</script>
<script>
const post=m=>window.ReactNativeWebView.postMessage(m);
try{
  const csv=/\\.(csv|tsv|txt)$/i.test(${JSON.stringify(name)});
  const raw=atob("${toBase64(bytes)}");
  const wb=csv?XLSX.read(raw.split('').map(c=>String.fromCharCode(c.charCodeAt(0))).join(''),{type:'binary',raw:true,FS:/\\.tsv$/i.test(${JSON.stringify(name)})?'\\t':undefined}):XLSX.read(raw,{type:'binary',cellDates:true});
  const tabs=document.getElementById('tabs'),wrap=document.getElementById('wrap'),note=document.getElementById('note');
  const MAX=2000;
  function show(i){[...tabs.children].forEach((b,j)=>b.className=j===i?'on':'');
    const ws=wb.Sheets[wb.SheetNames[i]];const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,defval:''});
    const cols=rows.reduce((m,r)=>Math.max(m,r.length),0);const letters=[...Array(cols)].map((_,c)=>XLSX.utils.encode_col(c));
    let h='<table><thead><tr><th></th>'+letters.map(l=>'<th>'+l+'</th>').join('')+'</tr></thead><tbody>';
    rows.slice(0,MAX).forEach((r,ri)=>{h+='<tr><th>'+(ri+1)+'</th>';for(let c=0;c<cols;c++){const v=r[c]==null?'':String(r[c]);h+='<td title="'+v.replace(/"/g,'&quot;')+'">'+v.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</td>';}h+='</tr>';});
    wrap.innerHTML=h+'</tbody></table>';note.textContent=rows.length>MAX?('Showing the first '+MAX+' of '+rows.length+' rows. Download to see everything.'):(rows.length+' rows · '+cols+' columns');}
  wb.SheetNames.forEach((n,i)=>{const b=document.createElement('button');b.textContent=n;b.onclick=()=>show(i);tabs.appendChild(b);});
  if(wb.SheetNames.length<2)tabs.style.display='none';
  show(0);post('ready');
}catch(e){post('error:Couldn’t open this spreadsheet: '+(e&&e.message||e));}
</script></body></html>`, [bytes, name, colors]);
  return <Page html={html} label="Opening spreadsheet…" />;
}
