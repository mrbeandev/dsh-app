import { useEffect } from 'react';
import { AppState, Dimensions, Keyboard, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import Constants from 'expo-constants';
import { diagnostic, flushDiagnostics } from '../lib/diagnostics';

export function BetaDiagnostics() {
  const route = usePathname();
  useEffect(() => { diagnostic('navigation', { route: route.replace(/session-[^/]+/g, ':session') }); }, [route]);
  useEffect(() => {
    diagnostic('app.start', { version: Constants.expoConfig?.version ?? 'unknown', platform: Platform.OS, os: String(Platform.Version), windowHeight: Dimensions.get('window').height, screenHeight: Dimensions.get('screen').height });
    const state = AppState.addEventListener('change', status => { diagnostic('app.state', { status }); if (status !== 'active') void flushDiagnostics(); });
    const dims = Dimensions.addEventListener('change', ({ window, screen }) => diagnostic('window.change', { width: window.width, windowHeight: window.height, screenHeight: screen.height }));
    const show = Keyboard.addListener('keyboardDidShow', e => diagnostic('keyboard.show', { keyboardHeight: e.endCoordinates.height, y: e.endCoordinates.screenY }));
    const hide = Keyboard.addListener('keyboardDidHide', () => diagnostic('keyboard.hide', { visible: Keyboard.isVisible(), windowHeight: Dimensions.get('window').height }));
    let last = Date.now();
    const heartbeat = setInterval(() => { const now = Date.now(), lagMs = now - last - 2000; last = now; if (AppState.currentState === 'active' && lagMs > 150) diagnostic('js.lag', { lagMs: Math.round(lagMs) }); }, 2000);
    // Preserve RN's error handler; log only error type, never message/stack with potentially private data.
    const errorUtils = (globalThis as any).ErrorUtils;
    const previous = errorUtils?.getGlobalHandler?.();
    const handler = (error: Error, fatal?: boolean) => { diagnostic('js.error', { code: error?.name ?? 'Error', fatal: !!fatal }); void flushDiagnostics(); previous?.(error, fatal); };
    if (previous) errorUtils.setGlobalHandler(handler);
    return () => { state.remove(); dims.remove(); show.remove(); hide.remove(); clearInterval(heartbeat); if (previous && errorUtils?.getGlobalHandler?.() === handler) errorUtils.setGlobalHandler(previous); void flushDiagnostics(); };
  }, []);
  return null;
}
