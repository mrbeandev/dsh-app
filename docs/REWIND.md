# Rewind (app feature)

Rewind takes a thread back to before one of your earlier messages, so you can edit and resend it.
It is built into the app and uses only public Harness APIs, so it works on any Harness. It does not
use or depend on the `dsh-rewind` Harness plugin.

## Using it

Long-press one of your messages (or tap its ⋯) → **Rewind to Here** → confirm.
The app opens the rewound thread with that message back in the composer.

## What happens

1. If the agent is running, the turn is stopped (`session/cancel`).
2. The app forks the thread with `session/fork` at the last event *before* the turn that carries the
   chosen message (walking back over the turn's opening bookkeeping: `agent/inbox/spliced`,
   `turn/start`, `step/start`). The fork keeps the same working directory.
3. The fork is renamed to the original title; the original thread is **archived** (still on the
   Harness, restorable with unarchive).
4. The message text is put back into the composer of the new thread.

## How it differs from the dsh-rewind plugin

| | dsh-rewind plugin (server) | App rewind |
|---|---|---|
| Needs a Harness plugin | yes | no |
| History | appends a hiding marker in the same thread | new thread forked before the message; old one archived |
| File restore | optional, from its own backups | not available (no public file-write API) |

## Verified

On the device Harness: rewinding to *“do some tool calls”* produced a thread ending at the previous
completed turn, with the text in the composer and the old thread archived. Unit tests cover the cut
point (`src/lib/rewind.test.ts`).
