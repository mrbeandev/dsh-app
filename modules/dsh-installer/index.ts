import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = { canInstallPackages(): boolean; openInstallPermissionSettings(): void; sha256(uri: string): Promise<string> };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('DshInstaller') : null;

/** Whether Android currently lets this app install APKs (null when unknown, e.g. not Android). */
export function canInstallPackages(): boolean | null {
  try { return native ? native.canInstallPackages() : null; } catch { return null; }
}
export function openInstallPermissionSettings() { native?.openInstallPermissionSettings(); }
/** Hex SHA-256 of a file (file:// or content:// URI), or null if the native module is unavailable. */
export async function sha256File(uri: string): Promise<string | null> { return native ? native.sha256(uri) : null; }
