"""Draw the app icons: a red hexagon and a yellow trapezoid on cream."""
import os
from math import sqrt
from PIL import Image, ImageDraw
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
def icon(n):
    im = Image.new("RGB", (n, n), "#FBF1DD"); d = ImageDraw.Draw(im)
    u = n * 0.2; H = sqrt(3) / 2; cx, cy = n * 0.5, n * 0.42; w = max(2, n // 64)
    hexa = [(cx - u, cy), (cx - u / 2, cy - H * u), (cx + u / 2, cy - H * u), (cx + u, cy), (cx + u / 2, cy + H * u), (cx - u / 2, cy + H * u)]
    d.polygon(hexa, fill="#D9473F", outline="#2b1d14", width=w)
    ty = cy + H * u
    d.polygon([(cx - u, ty), (cx + u, ty), (cx + u / 2, ty + H * u), (cx - u / 2, ty + H * u)], fill="#F2C94C", outline="#2b1d14", width=w)
    im.save(os.path.join(SITE, f"icon-{n}.png"))
for n in (180, 192, 512): icon(n)
