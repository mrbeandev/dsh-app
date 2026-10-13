# Rebuild roadmap

## Direction

- Copy the visual language and screen structure of T3 Code mobile, not the old Kotlin app UI.
- Preserve Harness functionality progressively, with explicit parity checks.
- Connection setup has exactly Harness URL + auth token. No connection-mode selection.
- Keep GitHub repository private until the owner explicitly requests public visibility.

## Foundation (implemented; device verification pending)

- Expo SDK 57, TypeScript, Expo Router and light/dark appearance.
- Threads, connection, new task, conversation, thread settings and app settings screens.
- RPC envelopes, cookie-session exchange, mux streams and reconnect.
- Prompt/command dispatch, stop, title/model selection, approval/question replies.
- Pure protocol and mocked transport tests; CI validation.

## Next

1. Verify cookie exchange and WebSocket auth on physical Android and iOS against a running Harness.
2. Replace permissive event UI with complete typed journal folding, compact stream replay, reasoning and tool-result rendering.
3. Add Markdown/code, file/image attachments, queue/steer, session control baselines and pagination cut tests.
4. Rebuild workspace/file tree, diff/review, terminal and git surfaces in the T3 layout.
5. Port session archives/pins, subagents, goals, jobs, automations, presets, skills, plugin and provider settings with capability gating.
6. Native EAS builds, integration tests, accessibility review and visual comparison against T3 on both platforms.

## Release gates

- No misleading mock data or nonfunctional controls.
- Known dependency advisories reviewed and patched where SDK-compatible; do not force-downgrade Expo based on npm audit suggestions.
- URL/token workflow works for LAN, same-device localhost and a normal HTTPS tunnel.
- Upstream MIT notices preserved and dependency notices reviewed for binaries.
- Public release only by explicit owner instruction.
