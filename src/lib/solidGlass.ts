/** Native material tokens adapted from DeepLethe Solid Glass (MIT).
 * Upstream: https://github.com/deeplethe/solid-glass
 * Flat faces, edge highlights, three thicknesses. No backdrop blur in scrolling rows.
 */
export const material = { radius: 14, controlRadius: 11, smallRadius: 8, hairline: 1, motionMs: 220 };
export const light = {
  dark: false, bg: '#e4e6eb', text: '#0e0e0e', muted: '#5b5b5b', tertiary: '#747474',
  panel: '#fafbfc70', card: '#fbfcfd99', grouped: '#fbfcfd99', popover: '#fcfcfdf5',
  primary: '#171717', primaryForeground: '#fafafa', link: '#2466bd', brand: '#3ca980',
  bubble: '#ffffff8c', danger: '#d52c36', success: '#26864b', live: '#26864b', warning: '#b56f19',
  border: '#30364421', separator: '#30364421', glass: '#fbfcfd99', glassEdge: '#515b711a',
  rim: '#ffffffe6', inner: '#ffffff59', shadow: '#313c6447', fill: '#30364412',
  field: '#ffffff99', fieldEdge: '#30364424', state: '#30364417',
  codeInline: '#b43a42', syntaxKeyword: '#345b9c', syntaxString: '#287c59', syntaxNumber: '#aa671f', syntaxName: '#8852a0',
};
export const dark: typeof light = {
  dark: true, bg: '#0d0d0d', text: '#fafafa', muted: '#a4a4a4', tertiary: '#858585',
  panel: '#ffffff0b', card: '#30303075', grouped: '#30303075', popover: '#1b1b1bf5',
  primary: '#ebebeb', primaryForeground: '#121212', link: '#85b7f2', brand: '#6bd4af',
  bubble: '#ffffff12', danger: '#fa7d86', success: '#64cc85', live: '#64cc85', warning: '#e6aa55',
  border: '#ffffff1c', separator: '#ffffff1c', glass: '#30303075', glassEdge: '#ffffff0f',
  rim: '#ffffff29', inner: '#ffffff0a', shadow: '#00000099', fill: '#ffffff12',
  field: '#ffffff0f', fieldEdge: '#ffffff14', state: '#ffffff12',
  codeInline: '#ec8790', syntaxKeyword: '#94bcf0', syntaxString: '#8bd5ac', syntaxNumber: '#e4bd75', syntaxName: '#d6a4e8',
};
/** Lightweight finish for custom panes/controls; safe in virtualised lists (no blur or subscriptions). */
export function paneFinish(colors: typeof light, depth: 'panel' | 'card' | 'popover' | 'control' = 'panel') {
  return {
    backgroundColor: depth === 'control' ? colors.bubble : colors[depth],
    borderWidth: 0.5,
    borderColor: colors.glassEdge,
    boxShadow: `inset 0 1px 0 ${colors.rim}, inset 0 0 0 0.5px ${colors.inner}`,
  };
}
/** The single chosen/pressed state: quiet fill and a lit edge, never a bright coloured outline. */
export function chosenFinish(colors: typeof light) {
  return { backgroundColor: colors.state, borderColor: colors.glassEdge, boxShadow: `inset 0 1px 0 ${colors.rim}` };
}
export type SolidGlassColors = typeof light;
export type SurfaceDepth = 'panel' | 'card' | 'popover' | 'control';
export function surfaceColor(colors: SolidGlassColors, depth: SurfaceDepth) {
  return depth === 'control' ? colors.bubble : colors[depth];
}
export function opaqueSurface(colors: SolidGlassColors, depth: SurfaceDepth) {
  return colors.dark ? (depth === 'popover' ? '#1b1b1b' : depth === 'panel' ? '#141414' : '#1c1c1c')
    : (depth === 'popover' ? '#fafbfc' : depth === 'panel' ? '#eceef2' : '#f1f3f6');
}
