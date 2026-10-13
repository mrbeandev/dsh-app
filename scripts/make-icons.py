#!/usr/bin/env python3
"""Build every app icon / splash asset from one square master logo.

Usage: python3 scripts/make-icons.py path/to/logo-master.png
Outputs into assets/: icon.png (iOS/store, full-bleed, no alpha), android-icon-foreground.png
(glyph inside the adaptive-icon safe zone), android-icon-background.png (charcoal gradient),
android-icon-monochrome.png (solid white silhouette for Android 13 themed icons),
splash-icon.png (transparent glyph) and favicon.png.
The master is expected to be a bright glyph on a dark charcoal gradient.
"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

W = 1024
src = Image.open(sys.argv[1]).convert('RGB')
icon = src.resize((W, W), Image.LANCZOS)
icon.save('assets/icon.png', optimize=True)

# Glyph alpha: a solid body (holes filled) so dark-blue interiors stay fully opaque and vivid,
# plus a soft halo from brightness above a blurred background estimate (keeps the glow).
gray = src.convert('L')
lift = ImageChops.subtract(gray, gray.filter(ImageFilter.GaussianBlur(120)))
halo = lift.point(lambda v: 0 if v < 6 else min(255, int((v - 6) * 3.2)))
body = ImageChops.lighter(lift, ImageChops.subtract(src.split()[2], src.split()[0])).point(lambda v: 255 if v > 30 else 0)
body = body.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))
outside = body.copy(); ImageDraw.floodfill(outside, (0, 0), 128)
body = outside.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(2))
alpha = ImageChops.lighter(body, halo)
glyph = Image.merge('RGBA', (*src.split(), alpha))
crop = glyph.crop(alpha.point(lambda v: 255 if v > 40 else 0).getbbox())

def place(frac):
    canvas = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    s = frac * W / max(crop.size)
    im = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
    canvas.alpha_composite(im, ((W - im.width) // 2, (W - im.height) // 2))
    return canvas

# Adaptive icon: launchers mask to circles/squircles; keep the glyph inside the 66% safe zone.
place(0.58).save('assets/android-icon-foreground.png', optimize=True)
bg = Image.new('RGB', (W, W)); d = ImageDraw.Draw(bg)
for y in range(W):
    t = y / (W - 1)
    d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip((0x2a, 0x2b, 0x2f), (0x0e, 0x0f, 0x11))))
bg.save('assets/android-icon-background.png', optimize=True)

# Themed (monochrome) icon: solid silhouette with interior holes filled.
m = place(0.58).split()[3].point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
outside = m.copy(); ImageDraw.floodfill(outside, (0, 0), 128)
solid = outside.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.GaussianBlur(1.2))
Image.merge('RGBA', (Image.new('L', (W, W), 255),) * 3 + (solid,)).save('assets/android-icon-monochrome.png', optimize=True)

place(0.92).resize((512, 512), Image.LANCZOS).save('assets/splash-icon.png', optimize=True)
icon.resize((48, 48), Image.LANCZOS).save('assets/favicon.png', optimize=True)
print('icons written to assets/')
