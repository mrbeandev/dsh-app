import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type Native = { canInstallPackages(): boolean; openInstallPermissionSettings(): void; sha256(uri: string): Promise<string>; copyFile?(from: string, to: string): Promise<null> };
const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('DshInstaller') : null;

/** Whether Android currently lets this app install APKs (null when unknown, e.g. not Android). */
export function canInstallPackages(): boolean | null {
  try { return native ? native.canInstallPackages() : null; } catch { return null; }
}
export function openInstallPermissionSettings() { native?.openInstallPermissionSettings(); }
/** Hex SHA-256 of a file (file:// or content:// URI), or null if the native module is unavailable. */
export async function sha256File(uri: string): Promise<string | null> { return native ? native.sha256(uri) : null; }
/** Natively copy a file (file:// or content://) into another; false if the native module can't. */
export async function copyFileNative(from: string, to: string): Promise<boolean> {
  if (!native?.copyFile) return false;
  await native.copyFile(from, to); return true;
}
