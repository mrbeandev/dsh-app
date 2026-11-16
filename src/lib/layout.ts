import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Responsive breakpoints (dp, from the window — so split-screen and rotation are handled).
 * Phones are always below TABLET_MIN, and every tablet-only behaviour is gated on these
 * helpers, so phone layouts take exactly the same code paths as before.
 *
 * - wide:  ≥ 700 dp — cap reading/form widths and centre sheets (tablet portrait and up).
 * - split: ≥ 900 dp — show the session list and the open chat side by side.
 */
export const TABLET_MIN = 700;
export const SPLIT_MIN = 900;
/** Comfortable reading width for chat, lists and forms on large screens. */
export const READABLE_MAX = 720;
/** Width of the session list pane in split view. */
export const SIDEBAR_WIDTH = 320;
/** Width of the Session Details panel shown beside the chat. */
export const DETAILS_WIDTH = 340;
/** Window width from which Session Details opens beside the chat instead of as a new screen. */
export const DETAILS_SIDE_MIN = 900;
/** Width of sheets shown as centred panels on large screens. */
export const PANEL_MAX = 560;

export function layoutFor(width: number) {
  return { wide: width >= TABLET_MIN, split: width >= SPLIT_MIN };
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, ...layoutFor(width) };
}

/**
 * Set by the split view around the chat pane: the chat is embedded next to the list, so it
 * has no back button and no swipe-back, and opening another session replaces it in place.
 */
export const SplitPaneContext = createContext<{ embedded: boolean; select: (sessionId: string) => void } | null>(null);
export const useSplitPane = () => useContext(SplitPaneContext);

/**
 * Style for a column that should stop growing at READABLE_MAX and sit centred on wide screens.
 * Returns undefined on phones so no style changes there.
 */
export function readable(wide: boolean, max = READABLE_MAX) {
  return wide ? { width: '100%' as const, maxWidth: max, alignSelf: 'center' as const } : undefined;
}

/** Split-view right pane value that shows Settings instead of a chat. */
export const SETTINGS_PANE = '@settings';

/**
 * The session shown in the split view's chat pane (or SETTINGS_PANE). A tiny external store so the /thread/[id]
 * route (deep links, notifications) can hand a session over to the home screen's pane.
 */
let splitSelection: string | null = null;
const splitListeners = new Set<() => void>();
let lastSplitChat: string | null = null;
export function setSplitSelection(id: string | null) {
  if (id === splitSelection) return;
  splitSelection = id;
  if (id && id !== SETTINGS_PANE) lastSplitChat = id;
  for (const l of splitListeners) l();
}
export function getSplitSelection() { return splitSelection; }
/** The chat that was open before Settings (Settings' close button returns to it). */
export function lastSplitChatId() { return lastSplitChat; }
export function subscribeSplitSelection(listener: () => void) { splitListeners.add(listener); return () => { splitListeners.delete(listener); }; }

/**
 * Phones stay portrait (as before); tablets may rotate. Decided from the screen's shortest side so it
 * doesn't flip when the device turns (a phone's short side is < 600 dp, a tablet's is ≥ 600 dp).
 */
export function isTabletScreen(width: number, height: number) {
  return Math.min(width, height) >= 600;
}
