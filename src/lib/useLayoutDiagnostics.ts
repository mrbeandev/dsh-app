import { useEffect, useRef } from 'react';
import { AppState, Dimensions, Keyboard, View } from 'react-native';
import { diagnostic } from './diagnostics';

/** Sample settled screen coordinates, not every animation frame. Observational only: no layout writes. */
export function useLayoutDiagnostics(event: string) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let alive = true;
    const sample = (phase: string) => {
      if (!alive) return;
      ref.current?.measureInWindow((x, y, width, height) => {
        if (!alive) return;
        diagnostic(event, { phase, x, y, width, height, windowHeight: Dimensions.get('window').height,
          screenHeight: Dimensions.get('screen').height, visible: Keyboard.isVisible(), keyboardHeight: Keyboard.metrics()?.height ?? 0 });
      });
    };
    const later = (phase: string) => {
      sample(phase);
      for (const delay of [350, 1000]) {
        const timer = setTimeout(() => { timers.delete(timer); sample(`${phase}.settled${delay}`); }, delay);
        timers.add(timer);
      }
    };
    const show = Keyboard.addListener('keyboardDidShow', () => later('keyboard.show'));
    const hide = Keyboard.addListener('keyboardDidHide', () => later('keyboard.hide'));
    const app = AppState.addEventListener('change', state => { if (state === 'active') later('resume'); });
    const dimensions = Dimensions.addEventListener('change', () => later('resize'));
    later('mount');
    return () => { alive = false; timers.forEach(clearTimeout); show.remove(); hide.remove(); app.remove(); dimensions.remove(); };
  }, [event]);
  return ref;
}
