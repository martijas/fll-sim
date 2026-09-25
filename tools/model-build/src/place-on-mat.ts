// Find where a mission model sits on the mat: match the model's top-view outline against the
// wireframe drawing's lines (chamfer matching over rotation and offset around the footprint).
//
//   pnpm exec tsx src/place-on-mat.ts <ldr> <cx_mm> <cy_mm> [searchMm=40] [--label-filter substring] [--png out.png]
//
// Prints { cx, cy, rot } — the mat position (mm) of the model's origin (bounding-box centre on
// the floor, as the simulator places it) and its heading (deg CCW; 0 = the model's front, -Z in
// LDraw, faces south, towards the builder side of the table).
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { analyzePart, parseModel } from "@fll-sim/assembly";
import { loadLib } from "./lib";

const args = process.argv.slice(2);
const [file, cxS, cyS, searchS] = args.filter((a) => !a.startsWith("--"));
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const WIRE = "/home/jason/project/resources/2026-27-bioglow/derived/mat-wireframe.png";
const PX = 2; // wireframe px per mm
const MAT_H = 1140;

const lib = loadLib();
let parts = parseModel(lib, readFileSync(file, "latin1")).parts;
const lf = opt("--label-filter");
if (lf) parts = parts.filter((p) => (p.label ?? "").includes(lf));
// --outline "a|b": only these parts' floor contact is matched against the mat (e.g. the base that
// sits on the Dual Lock mark); the pose still refers to the whole model's bounding box.
const ol = opt("--outline")?.split("|");
const outlineParts = ol ? parts.filter((p) => ol.some((l) => (p.label ?? "").includes(l))) : parts;

// Floor level of the whole model (LDraw: largest y).
let floorY = -Infinity;
for (const p of outlineParts) {
  const a = analyzePart(lib, p.file);
  for (const b of [...a.boxes, ...(a.rotorBoxes ?? [])]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = [b.c[0] + sx * b.h[0], b.c[1] + sy * b.h[1], b.c[2] + sz * b.h[2]];
    floorY = Math.max(floorY, p.m[4] * l[0] + p.m[5] * l[1] + p.m[6] * l[2] + p.m[7]);
  }
}
// Model footprint in model-frame mm (x right, z back), from collision boxes that reach the
// floor (the wireframe only outlines what stands on the mat).
const pts: [number, number][] = [];
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of outlineParts) {
  const a = analyzePart(lib, p.file);
  for (const b of [...a.boxes, ...(a.rotorBoxes ?? [])]) {
    let lowest = -Infinity;
    for (const sy of [-1, 1]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const l = [b.c[0] + sx * b.h[0], b.c[1] + sy * b.h[1], b.c[2] + sz * b.h[2]];
      lowest = Math.max(lowest, p.m[4] * l[0] + p.m[5] * l[1] + p.m[6] * l[2] + p.m[7]);
    }
    if (lowest < floorY - 12) continue;
    for (let sx = -1; sx <= 1; sx += 0.5) for (let sz = -1; sz <= 1; sz += 0.5) for (const sy of [-1, 1]) {
      const l = [b.c[0] + sx * b.h[0], b.c[1] + sy * b.h[1], b.c[2] + sz * b.h[2]];
      const w = [p.m[0] * l[0] + p.m[1] * l[1] + p.m[2] * l[2] + p.m[3], p.m[4] * l[0] + p.m[5] * l[1] + p.m[6] * l[2] + p.m[7], p.m[8] * l[0] + p.m[9] * l[1] + p.m[10] * l[2] + p.m[11]];
      const x = -w[0] * 0.4, z = w[2] * 0.4; // LDraw -> robot frame (mm): x right, z back
      pts.push([x, z]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
}
// The simulator centres the model on its whole bounding box (not just the floor footprint).
let aMinX = Infinity, aMaxX = -Infinity, aMinZ = Infinity, aMaxZ = -Infinity;
for (const p of parts) {
  const a = analyzePart(lib, p.file);
  for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
    const w = [p.m[0] * x + p.m[1] * y + p.m[2] * z + p.m[3], p.m[8] * x + p.m[9] * y + p.m[10] * z + p.m[11]];
    const rx = -w[0] * 0.4, rz = w[1] * 0.4;
    aMinX = Math.min(aMinX, rx); aMaxX = Math.max(aMaxX, rx); aMinZ = Math.min(aMinZ, rz); aMaxZ = Math.max(aMaxZ, rz);
  }
}
const ox = (aMinX + aMaxX) / 2, oz = (aMinZ + aMaxZ) / 2;
// Rasterize the footprint (2 mm cells) and take its boundary cells as the outline.
const G = 2;
const W = Math.ceil((maxX - minX) / G) + 3, H = Math.ceil((maxZ - minZ) / G) + 3;
const occ = new Uint8Array(W * H);
for (const [x, z] of pts) occ[Math.floor((z - minZ) / G + 1) * W + Math.floor((x - minX) / G + 1)] = 1;
// fill holes a little (dilate + erode) so the silhouette is solid
const dil = new Uint8Array(W * H);
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) if (occ[j * W + i] || occ[j * W + i - 1] || occ[j * W + i + 1] || occ[(j - 1) * W + i] || occ[(j + 1) * W + i]) dil[j * W + i] = 1;
const outline: [number, number][] = [];
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
  if (!dil[j * W + i]) continue;
  if (!dil[j * W + i - 1] || !dil[j * W + i + 1] || !dil[(j - 1) * W + i] || !dil[(j + 1) * W + i]) outline.push([minX + (i - 0.5) * G - ox, minZ + (j - 0.5) * G - oz]);
}

// Distance transform of the wireframe's dark lines (mm), in a window around the footprint.
const png = PNG.sync.read(readFileSync(WIRE));
const cx0 = Number(cxS), cy0 = Number(cyS), search = Number(searchS ?? 40);
const R = Math.max(maxX - minX, maxZ - minZ) / 2 + search + 20;
const x0 = Math.max(0, Math.floor((cx0 - R) * PX)), x1 = Math.min(png.width - 1, Math.ceil((cx0 + R) * PX));
const y0 = Math.max(0, Math.floor((MAT_H - cy0 - R) * PX)), y1 = Math.min(png.height - 1, Math.ceil((MAT_H - cy0 + R) * PX));
const dw = x1 - x0 + 1, dh = y1 - y0 + 1;
const dist = new Float32Array(dw * dh).fill(1e9);
for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
  const k = ((y0 + j) * png.width + (x0 + i)) * 4;
  // dark lines only (the red table wall around the mat is not a placement mark)
  if (Math.max(png.data[k], png.data[k + 1], png.data[k + 2]) < 150) dist[j * dw + i] = 0;
}
// two-pass chamfer distance (in px)
for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
  const k = j * dw + i;
  if (i > 0) dist[k] = Math.min(dist[k], dist[k - 1] + 1);
  if (j > 0) dist[k] = Math.min(dist[k], dist[k - dw] + 1);
  if (i > 0 && j > 0) dist[k] = Math.min(dist[k], dist[k - dw - 1] + 1.414);
  if (i < dw - 1 && j > 0) dist[k] = Math.min(dist[k], dist[k - dw + 1] + 1.414);
}
for (let j = dh - 1; j >= 0; j--) for (let i = dw - 1; i >= 0; i--) {
  const k = j * dw + i;
  if (i < dw - 1) dist[k] = Math.min(dist[k], dist[k + 1] + 1);
  if (j < dh - 1) dist[k] = Math.min(dist[k], dist[k + dw] + 1);
  if (i < dw - 1 && j < dh - 1) dist[k] = Math.min(dist[k], dist[k + dw + 1] + 1.414);
  if (i > 0 && j < dh - 1) dist[k] = Math.min(dist[k], dist[k + dw - 1] + 1.414);
}
const at = (mx: number, my: number) => {
  const i = Math.round(mx * PX) - x0, j = Math.round((MAT_H - my) * PX) - y0;
  if (i < 0 || j < 0 || i >= dw || j >= dh) return 60;
  return Math.min(60, dist[j * dw + i] / PX);
};

// Model -> mat: model front (-z) faces south at heading 0 (towards the builder / south wall);
// heading rotates counterclockwise seen from above. mat = c + R(h) * (x, z) with z back = north.
let best = { score: Infinity, cx: cx0, cy: cy0, rot: 0 };
const score = (cx: number, cy: number, rot: number) => {
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  let sum = 0;
  for (const [x, z] of outline) {
    const mx = cx + c * x - s * z, my = cy + s * x + c * z;
    sum += at(mx, my);
  }
  return sum / outline.length;
};
const rotHint = opt("--rot"), rotWin = Number(opt("--rot-window") ?? 180);
const rots: number[] = [];
for (let r = -rotWin; r < rotWin || (rotWin >= 180 && r < 180); r += 3) rots.push(((Number(rotHint ?? 0) + r) % 360 + 360) % 360);
for (const rot of rotHint ? rots : Array.from({ length: 120 }, (_, i) => i * 3))
  for (let dx = -search; dx <= search; dx += 4)
    for (let dy = -search; dy <= search; dy += 4) {
      const sc = score(cx0 + dx, cy0 + dy, rot);
      if (sc < best.score) best = { score: sc, cx: cx0 + dx, cy: cy0 + dy, rot };
    }
// refine
for (let rot = best.rot - 3; rot <= best.rot + 3; rot += 0.5)
  for (let dx = -4; dx <= 4; dx += 1)
    for (let dy = -4; dy <= 4; dy += 1) {
      const sc = score(best.cx + dx, best.cy + dy, rot);
      if (sc < best.score) best = { score: sc, cx: best.cx + dx, cy: best.cy + dy, rot: ((rot % 360) + 360) % 360 };
    }
console.log(JSON.stringify({ file, cx: Math.round(best.cx), cy: Math.round(best.cy), rot: Math.round(best.rot * 2) / 2, meanDistMm: +best.score.toFixed(2), outlinePts: outline.length, sizeMm: [Math.round(maxX - minX), Math.round(maxZ - minZ)] }));

// Optional overlay image for checking.
const outPng = opt("--png");
if (outPng) {
  const img = new PNG({ width: dw, height: dh });
  for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
    const k = ((y0 + j) * png.width + (x0 + i)) * 4, o = (j * dw + i) * 4;
    img.data[o] = png.data[k]; img.data[o + 1] = png.data[k + 1]; img.data[o + 2] = png.data[k + 2]; img.data[o + 3] = 255;
  }
  const c = Math.cos((best.rot * Math.PI) / 180), s = Math.sin((best.rot * Math.PI) / 180);
  for (const [x, z] of outline) {
    const mx = best.cx + c * x - s * z, my = best.cy + s * x + c * z;
    const i = Math.round(mx * PX) - x0, j = Math.round((MAT_H - my) * PX) - y0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= dw || jj >= dh) continue;
      const o = (jj * dw + ii) * 4;
      img.data[o] = 255; img.data[o + 1] = 0; img.data[o + 2] = 200;
    }
  }
  writeFileSync(outPng, PNG.sync.write(img));
}
