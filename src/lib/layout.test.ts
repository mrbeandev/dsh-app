import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 0, height: 0 }) }));
const { isTabletScreen, layoutFor, readable, getSplitSelection, setSplitSelection, subscribeSplitSelection } = await import('./layout');

describe('tablet layout breakpoints', () => {
  it('keeps every phone width on the phone layout', () => {
    for (const w of [320, 360, 393, 412, 430, 480]) expect(layoutFor(w)).toEqual({ wide: false, split: false });
    expect(readable(false)).toBeUndefined();
  });
  it('caps widths on tablet portrait and splits on tablet landscape', () => {
    expect(layoutFor(711)).toEqual({ wide: true, split: false });   // Redmi Pad 2 portrait
    expect(layoutFor(1138)).toEqual({ wide: true, split: true });   // Redmi Pad 2 landscape
    expect(readable(true)).toEqual({ width: '100%', maxWidth: 720, alignSelf: 'center' });
  });
  it('lets tablets rotate but keeps phones portrait, whichever way they are held', () => {
    expect(isTabletScreen(1138, 711)).toBe(true); expect(isTabletScreen(711, 1138)).toBe(true);
    expect(isTabletScreen(393, 852)).toBe(false); expect(isTabletScreen(852, 393)).toBe(false);
  });
  it('hands a session to the split view and notifies the pane', () => {
    const seen: (string | null)[] = []; const off = subscribeSplitSelection(() => seen.push(getSplitSelection()));
    setSplitSelection('s1'); setSplitSelection('s1'); setSplitSelection('s2'); off(); setSplitSelection(null);
    expect(seen).toEqual(['s1', 's2']); expect(getSplitSelection()).toBeNull();
  });
});

describe('settings in the split view', () => {
  it('returns to the chat that was open before Settings', async () => {
    const { SETTINGS_PANE, lastSplitChatId } = await import('./layout');
    setSplitSelection('chat-a'); setSplitSelection(SETTINGS_PANE);
    expect(getSplitSelection()).toBe(SETTINGS_PANE); expect(lastSplitChatId()).toBe('chat-a');
    setSplitSelection(lastSplitChatId()); expect(getSplitSelection()).toBe('chat-a');
  });
});
