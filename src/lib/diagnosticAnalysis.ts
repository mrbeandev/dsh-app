import type { DiagnosticRow } from './diagnosticStore';

/** Flag evidence, not a root-cause diagnosis. Ignore transitional frames; evaluate settled hide samples. */
export function analyseKeyboardLayouts(events: DiagnosticRow[]) {
  const anomalies: { time: number; gap: number; windowHeight: number; composerBottom: number }[] = [];
  let samples = 0;
  for (const e of events) {
    const d = e.data;
    if (e.event !== 'composer.bounds' || d.phase !== 'keyboard.hide.settled1000' || d.visible !== false) continue;
    const y = Number(d.y), height = Number(d.height), windowHeight = Number(d.windowHeight);
    if (![y, height, windowHeight].every(Number.isFinite) || height <= 0 || windowHeight <= 0) continue;
    samples++;
    const bottom = y + height, gap = windowHeight - bottom;
    // Bottom safe-area spacing is normal. A persistent >96pt gap deserves investigation.
    if (gap > 96) anomalies.push({ time: e.time, gap: Math.round(gap), windowHeight, composerBottom: Math.round(bottom) });
  }
  return { settledKeyboardHideSamples: samples, suspectedRaisedComposer: anomalies };
}
