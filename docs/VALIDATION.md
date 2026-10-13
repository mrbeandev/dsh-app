# Foundation validation

Validated on 2026-10-13 using Node 24 on Linux.

- TypeScript compilation: passed.
- Expo lint: passed (initial import-order warning corrected).
- Protocol and mocked transport regression tests: passed.
- Expo Doctor: 21/21 checks passed after installing required font peer.
- Expo production web export: passed.
- Browser smoke: home loads; Connect Harness opens connection route; exactly URL and token inputs; no browser console errors during this flow. Mobile viewport checked at 390×844.

Not yet validated: real Harness authentication or execution, physical Android/iOS, EAS binaries, complete functional or visual parity with reference apps.

## Android device preparation

ADB detects a connected Realme RMX3998. Termux (`com.termux`) and the existing Kotlin debug client (`com.labteto.dshmobile.debug`) are installed; Expo Go is not installed. Harness did not respond through an ADB forward to device port 3080. Device interaction is currently blocked by the screen lock; the owner opted to prepare the Android build while unlocking manually. No old app data was cleared and no Harness install was modified. Android CNG prebuild succeeded using the installed SDK and Java 21. Native compilation is being prepared separately; this does not yet constitute an on-device test.

## Dependency advisories

The scaffold/install reports 28 npm audit findings (10 moderate, 18 high), including Expo CLI/build-tool transitive dependencies. This is not a clean security audit. The suggested automatic remediation includes downgrading Expo to SDK 44 and must not be applied blindly. Review and resolve compatible patches before distribution. Expo Doctor compatibility success does not mean dependencies have no security advisories.

## Network policy

Local HTTP is intentionally enabled in generated Android/iOS builds for same-device/LAN Harness use. This permits cleartext traffic; use HTTPS tunnels for remote access and never expose a token on an untrusted network. Native cookie and redirect handling still requires physical-device verification.
