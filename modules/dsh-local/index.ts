import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export type LocalStatus = { supported: boolean; installed: boolean; running: boolean; freeBytes: number; basePath: string };
export type InstallProgress = { phase: 'download' | 'extract' | 'done'; done: number; total: number };
type Native = {
  status(): LocalStatus;
  install(url: string, sha256: string, sizeBytes: number): Promise<boolean>;
  run(script: string, timeoutSec: number): Promise<{ code: number; tail: string }>;
  start(port: number): void;
  startTask(script: string): void;
  taskRunning(): boolean;
  readTaskLog(maxBytes: number): string;
  stop(): void;
  readLog(maxBytes: number): string;
  remove(): Promise<void>;
  addListener(event: 'progress', fn: (p: InstallProgress) => void): EventSubscription;
  addListener(event: 'output', fn: (e: { line: string }) => void): EventSubscription;
};

/** Native side of "Run on this device" (Android, 64-bit ARM). Null elsewhere. */
export const DshLocal: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('DshLocal') : null;
