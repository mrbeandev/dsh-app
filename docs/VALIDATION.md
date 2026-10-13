# Foundation validation

Validated on 2026-10-13 using Node 24 on Linux.

- TypeScript compilation: passed.
- Expo lint: passed (initial import-order warning corrected).
- Protocol and mocked transport regression tests: passed.
- Expo Doctor: 21/21 checks passed after installing required font peer.
- Expo production web export: passed.
- Browser smoke: home loads; Connect Harness opens connection route; exactly URL and token inputs; no browser console errors during this flow. Mobile viewport checked at 390×844.

Not yet validated: iOS, EAS binaries, approvals/questions on a live model turn, exhaustive background activity transitions, complete functional or visual parity with reference apps.

## Android device preparation

Physical Realme RMX3998 connected over ADB. Android CNG prebuild, Hermes export and native arm64 debug APK compilation succeeded using a portable full JDK 21 (system Java lacked javac). Installed `dev.mrbean.dshapp` alongside the old Kotlin client. Owner unlocked the device manually; no old app data was cleared or Harness install replaced.

Started the existing Termux Harness 0.2.1-alpha.2 with `dsh web --no-open --host 127.0.0.1 --port 3080`. Verified on the native app:

- Home and two-field connection screen render, including system dark appearance.
- URL + launch token exchange, authenticated API and WebSocket mux work on device localhost.
- Existing sessions load; opening history observes the session.
- New session in Termux home created successfully.
- Renamed isolated session to `Android Expo smoke test`.
- Model catalog returned DeepSeek Flash/Pro; selected advertised Flash model.
- Harmless no-tools prompt accepted and rendered durably.
- The turn settled with `MISSING_CREDENTIAL`: no API key for `deepseek-official`. This is a host configuration error, not successful generation. No provider secret was added or changed.
- Error visibility and injected-context filtering regression fixes were added based on this device evidence.

Subsequent device tests configured the owner-authorized OpenAI-compatible router in a separate `dsh-app-device-test` route using a credential-service reference (not app source). The isolated thread selected `cc/claude-sonnet-5-5` and returned `ANDROID_EXPO_OK` successfully.

SQLite build installed successfully. Verified last-updated workspace grouping, chat reopen with live snapshot, cache size display (62.8 KB at the time of test), clear-cache confirmation and removal, and manual workspace refresh. Stopped only the Harness process started for this test, force-stopped/reopened the client, and verified cached workspace/session lists plus cached chat load without the server. Offline status is explicitly labeled. Restarted the test Harness afterward; launch tokens rotate on server restart.

The debug app currently requires Metro over ADB reverse port 8081. Release packaging and uninterrupted long-running/foreground recovery remain to test.

## Dependency advisories

The scaffold/install reports 28 npm audit findings (10 moderate, 18 high), including Expo CLI/build-tool transitive dependencies. This is not a clean security audit. The suggested automatic remediation includes downgrading Expo to SDK 44 and must not be applied blindly. Review and resolve compatible patches before distribution. Expo Doctor compatibility success does not mean dependencies have no security advisories.

## Network policy

Local HTTP is intentionally enabled in generated Android/iOS builds for same-device/LAN Harness use. This permits cleartext traffic; use HTTPS tunnels for remote access and never expose a token on an untrusted network. Native Android cookie/redirect handling and WebSocket auth were verified against same-device Termux Harness; iOS and HTTPS tunnel device coverage remain pending.
