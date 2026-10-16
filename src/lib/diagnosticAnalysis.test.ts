import { describe, expect, it } from 'vitest';
import { analyseKeyboardLayouts } from './diagnosticAnalysis';
const sample = (phase: string, y: number, visible = false) => ({ time: 123, event: 'composer.bounds', data: { phase, y, height: 85, windowHeight: 800, visible } });
describe('keyboard gap diagnostic analysis', () => {
  it('ignores normal bottom insets and intermediate animations', () => {
    expect(analyseKeyboardLayouts([sample('keyboard.hide', 387), sample('keyboard.hide.settled1000', 699)])).toEqual({ settledKeyboardHideSamples: 1, suspectedRaisedComposer: [] });
  });
  it('flags a settled gap without claiming a root cause', () => {
    expect(analyseKeyboardLayouts([sample('keyboard.hide.settled1000', 387)]).suspectedRaisedComposer).toEqual([{ time: 123, gap: 328, windowHeight: 800, composerBottom: 472 }]);
  });
  it('does not flag visible keyboards or invalid geometry', () => {
    expect(analyseKeyboardLayouts([sample('keyboard.hide.settled1000', 387, true), sample('keyboard.hide.settled1000', NaN)]).settledKeyboardHideSamples).toBe(0);
  });
});
