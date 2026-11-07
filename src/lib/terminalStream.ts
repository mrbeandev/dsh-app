import { randomUUID } from 'expo-crypto';
import type { Frame } from './protocol';

/**
 * One interactive terminal connection, independent of Harness version.
 *
 * - Harness 0.2.1+: `terminal/attach` is one two-way stream. Output arrives as snapshot/output/state/ack
 *   frames; keystrokes and resizes are sent back on the same stream as numbered `write`/`resize` items.
 * - Harness 0.2.0: `terminal/follow` stream + separate `terminal/write` / `terminal/resize` calls.
 *
 * The attach endpoint is tried first; if the Harness says it doesn't exist ("no active Remote method
 * exports this endpoint"), it switches to the 0.2.0 calls for this and later terminals.
 */
type Client = {
  duplex: (endpoint: string, args: Record<string, unknown>, receive: (f: Frame) => void) => { send: (v: unknown) => boolean; close: () => void };
  follow: (endpoint: string, args: Record<string, unknown>, receive: (f: Frame) => void) => () => void;
  call: (method: string, args: Record<string, unknown>) => Promise<unknown>;
};
export type TerminalConnection = { write: (data: string) => Promise<void>; resize: (cols: number, rows: number) => void; close: () => void };

let legacy = false; // remembered per app run once the Harness turns out to be 0.2.0

export const isMissingEndpoint = (f: Frame) => f.type === 'stream-error' && /no active Remote method|not exported|unknown endpoint|method-not-found/i.test(`${f.error?.code ?? ''} ${f.error?.message ?? ''}`);

export function openTerminal(client: Client, agentId: string, id: string, receive: (f: Frame) => void): TerminalConnection {
  let current: TerminalConnection | null = null;
  const start = () => { current = legacy ? openLegacy(client, agentId, id, receive) : openAttach(client, agentId, id, f => {
    if (isMissingEndpoint(f)) { legacy = true; current?.close(); start(); return; }
    receive(f);
  }); };
  start();
  return { write: d => current!.write(d), resize: (c, r) => current!.resize(c, r), close: () => current?.close() };
}

function openAttach(client: Client, agentId: string, id: string, receive: (f: Frame) => void): TerminalConnection {
  let sequence = 0;
  const stream = client.duplex('terminal/attach', { agentId, id }, f => {
    // A fresh snapshot means the stream (re)started on the Host: numbering restarts with it.
    if (f.type === 'snapshot') sequence = 0;
    if (f.type === 'ack' && f.refusal) receive({ type: 'stream-error', error: { code: 'terminal/control-unavailable', message: f.refusal === 'read-only' ? 'This terminal is being typed into from another device. Input is read-only here.' : 'The terminal is not running.' } } as Frame);
    else receive(f);
  });
  return {
    write: async data => { if (!stream.send({ type: 'write', sequence: ++sequence, data })) throw new Error('Not connected — reconnecting to the terminal.'); },
    resize: (cols, rows) => { stream.send({ type: 'resize', sequence: ++sequence, cols, rows }); },
    close: () => stream.close(),
  };
}

function openLegacy(client: Client, agentId: string, id: string, receive: (f: Frame) => void): TerminalConnection {
  const attachmentId = `att-${randomUUID().slice(0, 12)}`;
  const stop = client.follow('terminal/follow', { agentId, id, attachmentId }, receive);
  return {
    write: async data => { await client.call('terminal/write', { agentId, id, attachmentId, data }); },
    resize: (cols, rows) => { void client.call('terminal/resize', { agentId, id, attachmentId, cols, rows }).catch(() => {}); },
    close: stop,
  };
}

/** Test hook. */
export function _resetTerminalMode() { legacy = false; }
