"""Regenerates assets/icon.png, assets/adaptive-icon.png and assets/logo-wordmark.png.
Logo: a power symbol whose centre line is made of sound-wave bars.
Needs: pip install pillow numpy (and the Inter font for the wordmark)."""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

SS = 2
N = 1024 * SS
PURPLE, BLUE, DARK = (139, 92, 246), (59, 130, 246), (11, 11, 20)
INTER_BOLD = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'
INTER_REG = '/usr/share/fonts/opentype/inter/Inter-Medium.otf'

# Artwork geometry in a 1024 x 1024 design space
RING_CX, RING_CY, RING_OUTER, RING_W = 512, 570, 290, 64
GAP_HALF = 45  # degrees of opening at the top of the ring


def symbol_mask(scale):
    """Power ring + three sound bars as a grayscale mask, scaled around the canvas centre."""
    def X(v): return (512 + (v - 512) * scale) * SS
    def Y(v): return (512 + (v - 512) * scale) * SS

    m = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(m)
    s = scale * SS

    # ring (PIL draws arc strokes inward from the outer radius)
    box = [X(RING_CX - RING_OUTER), Y(RING_CY - RING_OUTER), X(RING_CX + RING_OUTER), Y(RING_CY + RING_OUTER)]
    start, end = 270 + GAP_HALF, 270 - GAP_HALF
    d.arc(box, start=start, end=end, fill=255, width=int(RING_W * s))
    mid_r = RING_OUTER - RING_W / 2
    for ang in (start, end):
        px = RING_CX + mid_r * math.cos(math.radians(ang))
        py = RING_CY + mid_r * math.sin(math.radians(ang))
        r = RING_W / 2 * s
        d.ellipse([X(px) - r, Y(py) - r, X(px) + r, Y(py) + r], fill=255)

    # bars: tall centre bar (the power line) and two shorter ones
    for x, top, bottom, w in [(512, 170, 480, 58), (420, 245, 395, 58), (604, 245, 395, 58)]:
        d.rounded_rectangle([X(x - w / 2), Y(top), X(x + w / 2), Y(bottom)], radius=w / 2 * s, fill=255)
    return m


def gradient(x0, y0, x1, y1):
    y, x = np.mgrid[0:N, 0:N]
    t = np.clip(((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), 0, 1)
    rgb = np.zeros((N, N, 3), dtype=np.uint8)
    for i in range(3):
        rgb[..., i] = (PURPLE[i] * (1 - t) + BLUE[i] * t).astype(np.uint8)
    return Image.fromarray(rgb, 'RGB').convert('RGBA')


def paint_symbol(base, scale, glow_alpha):
    mask = symbol_mask(scale)
    glow = Image.new('RGBA', (N, N), PURPLE + (0,))
    glow.putalpha(mask.filter(ImageFilter.GaussianBlur(60 * SS * scale)).point(lambda v: int(v * glow_alpha / 255)))
    base = Image.alpha_composite(base, glow)
    lo, hi = 512 - 330 * scale, 512 + 330 * scale
    g = gradient(lo * SS, lo * SS, hi * SS, hi * SS)
    g.putalpha(mask)
    return Image.alpha_composite(base, g)


# 1. Full icon: dark tile, soft halo, glowing symbol
icon = Image.new('RGBA', (N, N), DARK + (255,))
halo = Image.new('RGBA', (N, N), (0, 0, 0, 0))
ImageDraw.Draw(halo).ellipse([150 * SS, 150 * SS, 874 * SS, 874 * SS], fill=PURPLE + (65,))
icon = Image.alpha_composite(icon, halo.filter(ImageFilter.GaussianBlur(100 * SS)))
icon = paint_symbol(icon, 1.0, 140)
icon.resize((1024, 1024), Image.LANCZOS).convert('RGB').save('assets/icon.png')

# 2. Adaptive icon foreground: transparent, symbol kept inside the launcher's safe zone
fg = Image.new('RGBA', (N, N), (0, 0, 0, 0))
fg = paint_symbol(fg, 0.74, 100)
fg.resize((1024, 1024), Image.LANCZOS).save('assets/adaptive-icon.png')

# 3. Wordmark logo
W, H = 2400, 900
logo = Image.new('RGBA', (W, H), DARK + (255,))
tile = icon.resize((620, 620), Image.LANCZOS)
tmask = Image.new('L', (620, 620), 0)
ImageDraw.Draw(tmask).rounded_rectangle([0, 0, 619, 619], radius=140, fill=255)
logo.paste(tile, (180, (H - 620) // 2), tmask)
d = ImageDraw.Draw(logo)
tx = 180 + 620 + 130
d.text((tx, 215), 'Hanivox', font=ImageFont.truetype(INTER_BOLD, 330), fill=(244, 244, 250))
d.text((tx + 8, 610), 'Voice remote for your TV', font=ImageFont.truetype(INTER_REG, 92), fill=(154, 154, 178))
logo.convert('RGB').save('assets/logo-wordmark.png')
print('done')
