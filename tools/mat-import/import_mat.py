#!/usr/bin/env python3
"""Rasterize a mat drawing (PDF page or image) into a simulator mat texture.

The output PNG maps exactly onto the physical mat: width_px = mat_width_mm * px_per_mm.
Usage:
  import_mat.py SOURCE.pdf --page 2 --mat-mm 2000x1140 --out mat.png [--px-per-mm 2]
  import_mat.py scan.jpg --mat-mm 2000x1140 --out mat.png --no-autocrop
Autocrop finds the bounding box of non-white content below the page header, which
matches the FIRST "Wireframe & Path Diagram" layout. Pass --crop x0,y0,x1,y1 (pixels of the
300 dpi render) to override.
"""
import argparse, os, subprocess, sys, tempfile
from PIL import Image

def autocrop(im, header_frac=0.22, footer_frac=0.95):
    w, h = im.size
    px = im.convert("RGB").load()
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(int(h * header_frac), int(h * footer_frac)):
        for x in range(w):
            r, g, b = px[x, y]
            if r + g + b < 600:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return x0, y0, x1, y1

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--page", type=int, default=1)
    ap.add_argument("--mat-mm", required=True, help="WIDTHxHEIGHT in mm")
    ap.add_argument("--px-per-mm", type=float, default=2.0)
    ap.add_argument("--out", required=True)
    ap.add_argument("--crop")
    ap.add_argument("--no-autocrop", action="store_true")
    a = ap.parse_args()
    mw, mh = (float(v) for v in a.mat_mm.lower().split("x"))
    if a.source.lower().endswith(".pdf"):
        tmp = tempfile.mkdtemp()
        base = os.path.join(tmp, "p")
        subprocess.run(["pdftoppm", "-r", "300", "-f", str(a.page), "-l", str(a.page), "-png", a.source, base], check=True, stderr=subprocess.DEVNULL)
        src = Image.open(os.path.join(tmp, sorted(os.listdir(tmp))[0]))
    else:
        src = Image.open(a.source)
    if a.crop:
        box = tuple(int(v) for v in a.crop.split(","))
    elif a.no_autocrop:
        box = (0, 0, src.size[0] - 1, src.size[1] - 1)
    else:
        box = autocrop(src)
    x0, y0, x1, y1 = box
    crop = src.convert("RGB").crop((x0, y0, x1 + 1, y1 + 1))
    out_size = (round(mw * a.px_per_mm), round(mh * a.px_per_mm))
    crop.resize(out_size, Image.LANCZOS).save(a.out)
    ratio_src = (x1 - x0 + 1) / (y1 - y0 + 1)
    print(f"crop={box} source aspect={ratio_src:.4f} mat aspect={mw / mh:.4f} -> {a.out} {out_size[0]}x{out_size[1]}")
    if abs(ratio_src - mw / mh) / (mw / mh) > 0.01:
        print("WARNING: source aspect differs from mat size by >1%; check --mat-mm or --crop", file=sys.stderr)

if __name__ == "__main__":
    main()
