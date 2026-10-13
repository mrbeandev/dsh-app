# Physical Android / Termux test plan

Target: owner’s ADB-connected Realme RMX3998. Existing Termux and Kotlin debug app must remain intact.

## Preparation

- Android CNG prebuild: succeeded.
- Android Hermes bundle export: succeeded.
- Java 21 and Android SDK found under the developer’s home directory.
- Official Gradle 9.3.1 download verified against its published SHA-256.
- First build installs SDK 36 build tools and NDK 27.1 as required by Expo SDK 57.
- Native app package: `dev.mrbean.dshapp`, separate from the old client.

## Device prerequisites

Owner unlocks screen and leaves Termux available. Do not retry passcodes or clear app data. Inspect existing Termux installation and process before starting anything; do not reinstall Harness or change credentials unless required and explicitly discussed. Initial probe of device localhost:3080 did not return a Harness response.

## Checks to execute

1. Install debug APK side by side with the existing app using ADB.
2. Serve Metro and reverse its port with ADB for debug runtime. Capture startup errors through logcat.
3. Inspect/start the existing Harness in Termux using its established configuration. Keep auth tokens out of committed files, screenshots and logs.
4. Enter just `http://localhost:<actual-port>` plus current auth token in the new app.
5. Verify cookie exchange, session list and `$events` ready; compare sessions against existing client.
6. Open an existing thread, compare history, reconnect and reopen without resuming stopped agents.
7. Create an explicitly labeled test thread. Send a harmless prompt and observe live text plus durable settlement.
8. Validate title/model changes and stop on that test thread only.
9. Validate questions/approval, earlier history and stream replay where possible.
10. Test expired token/network errors, disconnect, and secure saved-connection behavior.
11. Check light/dark screens and keyboard layout. Record screenshots without secrets and update validation documentation with actual results.

Until these execute, mocked tests and successful bundle export are not evidence of a working Termux connection.
