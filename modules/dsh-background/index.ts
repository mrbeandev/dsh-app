import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = { start(title: string, text: string): void; stop(): void; isRunning(): boolean; isIgnoringBatteryOptimizations(): boolean; requestIgnoreBatteryOptimizations(): void; openAppSettings(): void };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('DshBackground') : null;

/** Opt-in foreground service that keeps the live Harness connection running in the background (Android). */
export const background = {
  available: !!native,
  start: (title: string, text: string) => native?.start(title, text),
  stop: () => native?.stop(),
  isRunning: () => !!native?.isRunning(),
  isIgnoringBatteryOptimizations: () => (native ? native.isIgnoringBatteryOptimizations() : true),
  requestIgnoreBatteryOptimizations: () => native?.requestIgnoreBatteryOptimizations(),
  openAppSettings: () => native?.openAppSettings(),
};
