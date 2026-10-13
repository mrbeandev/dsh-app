import { describe, expect, it } from 'vitest';
import { attachBinary, parseMultipart } from './multipart';

const B = '----formdata-undici-063551983079';
const enc = (s: string) => new TextEncoder().encode(s);
function build(bytes: Uint8Array, metadata: object) {
  const head = enc(`--${B}\r\nContent-Disposition: form-data; name="bytes-0"; filename="blob"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = enc(`\r\n--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n--${B}--\r\n`);
  const out = new Uint8Array(head.length + bytes.length + tail.length); out.set(head); out.set(bytes, head.length); out.set(tail, head.length + bytes.length); return out;
}

describe('workspaceFiles/readBytes multipart', () => {
  const meta = (rpcId: string) => ({ type: 'server-response', rpcId, result: { ok: true, value: { absolutePath: '/x/a.bin', version: 'v', bytes: 6, offset: 0, data: null, eof: true } }, attachments: [{ path: ['data'], codec: 'bytes', part: 'bytes-0' }] });
  it('matches the live Harness wire format and restores raw bytes', () => {
    const text = enc('allow-external-apps=true\n');
    const { metadata, parts } = parseMultipart(build(text, meta('x')), `multipart/form-data; boundary=${B}`);
    const value = attachBinary(metadata, parts);
    expect(new TextDecoder().decode(value.data)).toBe('allow-external-apps=true\n');
    expect(value).toMatchObject({ eof: true, bytes: 6, absolutePath: '/x/a.bin' });
  });
  it('keeps binary bytes intact, including CR/LF and dashes', () => {
    const bin = new Uint8Array([0, 255, 13, 10, 45, 45, 137, 80, 78, 71]);
    const { metadata, parts } = parseMultipart(build(bin, meta('y')), `multipart/form-data; boundary=${B}`);
    expect(Array.from(attachBinary(metadata, parts).data)).toEqual(Array.from(bin));
  });
  it('rejects responses without a boundary', () => expect(() => parseMultipart(new Uint8Array(), 'multipart/form-data')).toThrow());
});
