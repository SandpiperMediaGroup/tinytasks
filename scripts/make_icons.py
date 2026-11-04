"""Generates the app icons (run once: python scripts/make_icons.py)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 1024  # draw big, downsample for anti-aliasing

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
pad = 64
d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=200, fill=(255, 214, 92, 255))
# check mark
d.line([(300, 530), (450, 680), (730, 380)], fill=(40, 36, 30, 255), width=110, joint="curve")
for x, y in [(300, 530), (730, 380)]:
    d.ellipse([x - 55, y - 55, x + 55, y + 55], fill=(40, 36, 30, 255))

OUT.mkdir(exist_ok=True)
for size, name in [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png"), (512, "icon.png")]:
    img.resize((size, size), Image.LANCZOS).save(OUT / name)
img.resize((256, 256), Image.LANCZOS).save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)])
img.resize((1024, 1024), Image.LANCZOS).save(OUT / "icon.icns")
print("icons written to", OUT)
