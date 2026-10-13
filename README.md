# DSH Mobile

A fresh **Expo + React Native + TypeScript** client for DeepSeek Harness. Built from scratch with the UI and screen patterns of T3 Code mobile and the functional/protocol reference of DeepSeek Harness Mobile.

> This repository is **private during development**. Making it public later is a separate, explicit decision. This is an independent community project, not an official T3 or DeepSeek product.

## Connection: two fields, nothing else

1. **Harness URL** — a local HTTP address, LAN address, or HTTPS tunnel URL.
2. **Auth token** — the current launch token printed by Harness.

No relay mode selector, discovery, pairing wizard, tunnel provider configuration, or SSH options. The client handles the Harness token-to-cookie exchange and API stream connection internally. A URL containing `?token=` is accepted too; the token is removed from the saved base URL.

On a physical phone, `localhost` means that phone, not your computer. Use your computer’s LAN URL or a tunnel when Harness runs elsewhere. Native credentials are stored using Expo SecureStore; the web preview keeps credentials in memory only. Use HTTPS for remote connections. Browser cross-origin connections require server-side origin/CORS and cookie support; native mobile is the primary target. A tunnel with an extra access login is not automatically handled by a Harness token.

## Development

Requires Node.js 22+ and npm.

```sh
npm ci
npm start
npm run android
npm run ios
npm run web
```

Expo SDK 57; navigation uses Expo Router under `src/app/`. Install dependencies through `npx expo install` to keep SDK compatibility. Native transport and authentication must be tested on physical devices; a web bundle passing does not prove device compatibility.

```sh
npm run typecheck
npm run lint
npm test
npm run export:web
npx expo-doctor
```

## Current implementation

**Design** — Apple HIG layout and type scale with a charcoal glass control layer (matching the approved prototype); glass DeepSeek-whale app icon, adaptive/themed icons and dark splash (`scripts/make-icons.py`).

**Connection** — one URL + token form, launch-token exchange, strict RPC envelopes, multiplexed WebSocket streams, reconnect backoff. Every feature uses the same backend APIs as the DSH Web UI.

**Home** — collapsible workspace tree sorted by last activity, one live dot per working thread, pinned threads first, archived threads hidden. Long-press a thread: Pin, Files, Terminal, Archive. Workspace ⋯ menu: Browse Files, Open Terminal, New Thread Here, Rename, Refresh Cache, Remove. Add a workspace with the Harness folder picker.

**Chat** — Markdown (code blocks with copy, quotes, inline code), DSH-style event rows (tools with folded approvals, reasoning, context, compaction, system prompt, failures), approvals and questions, model sheet, auto-scroll on send and on every agent update. Long-press or ⋯ on your own message: **Rewind to Here** or Copy.

**Rewind (app feature)** — rewinds a thread to any earlier message of yours: the app forks the thread just before that message's turn (`session/fork`), keeps the title, archives the old thread (not deleted), and puts the message back in the composer. Works on any Harness; it does not need or talk to the `dsh-rewind` plugin. Workspace files are not restored.

**Thread Details** — model, persona, access, directory; Context (percent used with system/tools/messages breakdown), Token Usage (total, cache hit, uncached/cached input, output) and Session Statistics (turns, steps, LLM/tool time, TTFT, TPS) — the Web UI's popovers as sections; Activity (goal, plan, questions, queue, to-dos); readable cache diagnostics.

**Files** — browse, preview text, and download any file to the device (chunked, byte-exact), then Open or Share. **Terminal** — create/close shells, live output, typing and special keys.

**Caching** — per-Harness SQLite catalog/history (IndexedDB on web), cached startup and offline reading, live data only for what is open; cache size and clear per Harness.

**UI building blocks** — reusable app dialog (`useDialog`: confirm/alert/prompt) instead of native alerts; animated loader and skeletons (`components/Loader.tsx`) everywhere data loads.


### Work still required before release

Not yet full parity with the Web UI. Still to do: image/file attachments in the composer, git/diffs, queue editing and steering, subagent management, skills/plugins, automations, notifications, a standalone (non-Metro) release build, and iOS testing.

## Credits and references

We are rebuilding this app using these two projects as the references:

- **[T3 Code — mobile app](https://github.com/pingdotgg/t3code/tree/main/apps/mobile)** by **T3 Tools Inc.** — the UI/screens reference. Its neutral theme tokens and thread-list/composer/navigation patterns inform this app’s presentation. Licensed under MIT.
- **[DeepSeek Harness Mobile](https://github.com/sorsama/deepseek-harness-mobile)** by **DSH Mobile contributors** — the functionality and Harness protocol reference. Its documented named-argument RPC, cookie authentication, mux stream, history and question-answer contracts inform this new TypeScript implementation. Licensed under MIT.

Please explore and support both original projects. Their license notices are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Upstream brands and logos are not claimed by this project.

## Architecture

- `src/app/`: Expo Router screens (home, thread, details, files, terminal, workspace-new, new, settings, connect).
- `src/components/`: UI primitives, Glass, Dialog, Loader, ActionMenu, Sheet, ChatRows, MessageMarkdown, composer, model picker.
- `src/lib/protocol.ts`: wire helpers and transcript builder. `harness.ts`: RPC (incl. multipart binary), mux streams. `multipart.ts`: binary RPC responses.
- `src/lib/workspaceFiles.ts` / `downloads.ts`: file API and device saving. `ansi.ts`: terminal text model. `rewind.ts`: app rewind. `sessionStats.ts`: stats formatting.
- `src/state/app.tsx`: connection, sessions, workspaces (pinned/archived), pending requests, appearance.

The server is the source of truth. Opening a thread observes it; it does not resume an agent. Prompt identifiers are minted per submitted message. Unknown journal events remain inspectable instead of silently disappearing.
