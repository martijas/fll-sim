#!/usr/bin/env python3
"""Build a colour mat texture from FIRST's rulebook field image + the wireframe PDF.

The rulebook shows the whole mat in colour (low resolution); the wireframe PDF has sharp lines.
We crop the rulebook image to the mat edges (red left edge / blue right edge), scale it to the
physical mat size, and multiply the wireframe on top so lines and placement marks stay crisp.

  compose_color_mat.py --rulebook RGR.pdf --page 8 --wireframe mat-wireframe.png \
      --mat-mm 2000x1140 --out mat-color.png
"""
import argparse, os, subprocess, tempfile
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument("--rulebook", required=True)
ap.add_argument("--page", type=int, default=8)
ap.add_argument("--wireframe", required=True, help="to-scale wireframe PNG from import_mat.py")
ap.add_argument("--mat-mm", default="2000x1140")
ap.add_argument("--px-per-mm", type=float, default=2.0)
ap.add_argument("--out", required=True)
a = ap.parse_args()
mw, mh = (float(v) for v in a.mat_mm.split("x"))

tmp = tempfile.mkdtemp()
subprocess.run(["pdfimages", "-j", "-f", str(a.page), "-l", str(a.page), a.rulebook, os.path.join(tmp, "img")], check=True, stderr=subprocess.DEVNULL)
# The biggest image on the page is the field.
cands = sorted((os.path.getsize(os.path.join(tmp, f)), f) for f in os.listdir(tmp))
im = Image.open(os.path.join(tmp, cands[-1][1]))
if im.mode == "CMYK":  # Adobe CMYK JPEGs store inverted ink values
    im = ImageChops.invert(im)
im = im.convert("RGB")
w, h = im.size
px = im.load()

# Left/right mat edges: the red and blue launch-side border lines.
red = [sum(1 for y in range(int(h * .2), int(h * .8), 3) if (lambda p: p[0] > 170 and p[1] < 90 and p[2] < 90)(px[x, y])) for x in range(w)]
blue = [sum(1 for y in range(int(h * .2), int(h * .8), 3) if (lambda p: p[2] > 150 and p[0] < 90 and p[1] < 150)(px[x, y])) for x in range(w)]
x0 = min(x for x in range(w) if red[x] > 60)
x1 = max(x for x in range(w) if blue[x] > 60)
# Top edge: first bright row below the dark top wall; height from the physical aspect ratio.
tops = []
for x in range(int(w * .25), int(w * .85), 50):
    ys = [y for y in range(h) if sum(px[x, y]) > 200 and y > h * 0.03]
    tops.append(ys[0])
y0 = sorted(tops)[len(tops) // 2]
y1 = y0 + round((x1 - x0 + 1) / (mw / mh)) - 1
size = (round(mw * a.px_per_mm), round(mh * a.px_per_mm))
crop = im.crop((x0, y0, x1 + 1, y1 + 1)).resize(size, Image.LANCZOS)
wire = Image.open(a.wireframe).convert("RGB").resize(size, Image.LANCZOS)
ImageChops.multiply(crop, wire).save(a.out)
print(f"mat edges x {x0}..{x1}, y {y0}..{y1} ({(x1 - x0 + 1) / mw:.3f} px/mm source) -> {a.out} {size}")
