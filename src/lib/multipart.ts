/** Multipart RPC responses from the DSH gateway's binary Remotes (e.g. workspaceFiles/readBytes). */
/** Parse a `multipart/form-data` RPC response into its JSON metadata and named binary parts. */
export function parseMultipart(body: Uint8Array, contentType: string): { metadata: any; parts: Map<string, Uint8Array> } {
  const boundary = /boundary=("?)([^";]+)\1/i.exec(contentType)?.[2];
  if (!boundary) throw new Error('Malformed file response (no multipart boundary).');
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const delim = enc.encode(`--${boundary}`);
  const indexOf = (hay: Uint8Array, needle: Uint8Array, from: number) => {
    outer: for (let i = from; i <= hay.length - needle.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i; }
    return -1;
  };
  const parts = new Map<string, Uint8Array>(); let metadata: any = null;
  let pos = indexOf(body, delim, 0);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (body[start] === 45 && body[start + 1] === 45) break; // closing "--"
    const headerEnd = indexOf(body, enc.encode('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headers = dec.decode(body.subarray(start, headerEnd));
    const next = indexOf(body, delim, headerEnd + 4);
    if (next === -1) break;
    const content = body.subarray(headerEnd + 4, next - 2); // strip trailing CRLF before the delimiter
    const name = /name="([^"]+)"/.exec(headers)?.[1] ?? '';
    if (name === 'metadata') metadata = JSON.parse(dec.decode(content)); else parts.set(name, content);
    pos = next;
  }
  return { metadata, parts };
}

/**
 * Rehydrate the RPC value: the metadata lists `attachments: [{ path: ['data'], codec: 'bytes', part: 'bytes-0' }]`,
 * and each path inside `result.value` (holding `null` on the wire) is replaced by its raw byte part.
 */
export function attachBinary(metadata: any, parts: Map<string, Uint8Array>): any {
  const value = metadata?.result?.value;
  for (const a of metadata?.attachments ?? []) {
    const bytes = parts.get(a.part); if (!bytes || !Array.isArray(a.path) || !a.path.length) continue;
    let node = value; for (const key of a.path.slice(0, -1)) node = node?.[key];
    if (node && typeof node === 'object') node[a.path[a.path.length - 1]] = bytes;
  }
  return value;
}

