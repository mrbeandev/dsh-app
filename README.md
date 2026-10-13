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

- T3-style neutral light/dark palettes, minimal thread list, search/filter controls, rounded composer, and modal setup/settings routes.
- One URL + token connection form, launch-token exchange, strict RPC envelopes, multiplexed WebSocket streams, reconnect backoff.
- Thread listing/creation, history snapshot and earlier-message loading, prompt sending, command dispatch, streamed response text, stop generation.
- Expandable tool/event details, approval decisions and structured question answers with connection-generation checks.
- Title editing, provider/model selection, session projection inspection, credits in settings.

### Work still required before release

This first foundation is **not yet full feature parity** with the Kotlin reference. Markdown/code rendering, image/file attachments, workspace file browsing, terminal, git/diffs, archives/pins, queue editing/steering, subagent management, presets, skills/plugins, goals/automations, full reasoning/replay folding, notifications, and native device validation remain on the roadmap. T3’s custom native navigation and liquid-glass behavior have not been transplanted; these screens are being rebuilt against standard Expo APIs. Do not mistake this initial client for a complete port.

## Credits and references

We are rebuilding this app using these two projects as the references:

- **[T3 Code — mobile app](https://github.com/pingdotgg/t3code/tree/main/apps/mobile)** by **T3 Tools Inc.** — the UI/screens reference. Its neutral theme tokens and thread-list/composer/navigation patterns inform this app’s presentation. Licensed under MIT.
- **[DeepSeek Harness Mobile](https://github.com/sorsama/deepseek-harness-mobile)** by **DSH Mobile contributors** — the functionality and Harness protocol reference. Its documented named-argument RPC, cookie authentication, mux stream, history and question-answer contracts inform this new TypeScript implementation. Licensed under MIT.

Please explore and support both original projects. Their license notices are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Upstream brands and logos are not claimed by this project.

## Architecture

- `src/app/`: Expo Router screens.
- `src/components/`: shared controls, expandable activity and pending-request UI.
- `src/lib/protocol.ts`: pure wire helpers and transcript projection.
- `src/lib/harness.ts`: authenticated RPC and multiplexed stream transport.
- `src/state/app.tsx`: shared connection, sessions, pending requests and appearance state.

The server is the source of truth. Opening a thread observes it; it does not resume an agent. Prompt identifiers are minted per submitted message. Unknown journal events remain inspectable instead of silently disappearing.
