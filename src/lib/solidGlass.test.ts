import { describe, expect, it } from 'vitest';
import { dark, light, material, opaqueSurface, surfaceColor } from './solidGlass';

describe('Solid Glass native design system', () => {
  it('exposes the same semantic tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(dark.bg).not.toBe(light.bg);
    expect(material.controlRadius).toBeLessThan(material.radius);
  });
  it('maps pane thickness without requiring blur', () => {
    for (const colors of [light, dark]) {
      expect(surfaceColor(colors, 'panel')).toBe(colors.panel);
      expect(surfaceColor(colors, 'card')).toBe(colors.card);
      expect(surfaceColor(colors, 'popover')).toBe(colors.popover);
      expect(surfaceColor(colors, 'control')).toBe(colors.bubble);
      for (const depth of ['panel', 'card', 'popover', 'control'] as const) {
        expect(opaqueSurface(colors, depth)).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
  it('maintains readable text contrast on opaque page backgrounds', () => {
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    for (const colors of [light, dark]) {
      for (const fg of [colors.text, colors.muted, colors.link]) {
        const a = luminance(fg), b = luminance(colors.bg);
        expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('keeps status colours and readable links separate from neutral actions', () => {
    for (const colors of [light, dark]) {
      expect(colors.primary).not.toBe(colors.link);
      expect(colors.success).not.toBe(colors.danger);
      expect(colors.primaryForeground).not.toBe(colors.primary);
    }
  });
});
