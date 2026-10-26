// Top-down render of every mission model at its mat pose (north up, east right), composited over
// the mat picture — to check positions and headings against the Field Setup Guide.
//
//   pnpm exec tsx src/field-render.ts out.png [pxPerMm=0.5] [--only m04,m05]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { flatten, mul, type Mat4 } from "@fll-sim/ldraw";
import { parseModel } from "@fll-sim/assembly";
import { loadLib } from "./lib";
import { render, type RenderPart } from "./render";

const repo = join(import.meta.dirname, "../../..");
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith("--"));
const outFile = pos[0] ?? "field.png";
const S = Number(pos[1] ?? 0.5);
const onlyI = args.indexOf("--only");
// --view dx,dy,dz: perspective-free view from that direction (LDraw world: -X east, -Z north, +Y down), no mat
const viewI = args.indexOf("--view");
const viewDir = viewI >= 0 ? (args[viewI + 1].split(",").map(Number) as [number, number, number]) : null;
const only = onlyI >= 0 ? args[onlyI + 1].split(",") : null;
const raw = JSON.parse(readFileSync(join(repo, "seasons/2026-27/mission-models.json"), "utf8"));
const docks = raw._docks as Record<string, { xMm: number; yMm: number; dirDeg: number }>;
const lib = loadLib();
const W = 2000, H = 1140;

const poses: { id: string; file: string; pose: { xMm: number; yMm: number; headingDeg: number } }[] = [];
const dockOf: Record<string, string> = { m13: "farm", m14: "city", m15: "mine" };
for (const [id, e] of Object.entries<any>(raw)) {
  if (id.startsWith("_") || (only && !only.some((o) => id.startsWith(o)))) continue;
  let pose = e.pose;
  if (e.dock) {
    // --mine: every dock model on the mine dock (as the Field Setup Guide shows them)
    const site = docks[args.includes("--mine") ? "mine" : dockOf[id]];
    const h = site.dirDeg - e.dock.dirDeg, r = (h * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    pose = { xMm: site.xMm - (c * e.dock.x - s * e.dock.z), yMm: site.yMm - (s * e.dock.x + c * e.dock.z), headingDeg: h };
  }
  // --turn m03:180,m04:180 — try extra rotations without editing mission-models.json
  const ti = args.indexOf("--turn");
  const turn = ti >= 0 ? args[ti + 1].split(",").find((t) => t.split(":")[0] === id) : undefined;
  if (turn) pose = { ...pose, headingDeg: pose.headingDeg + Number(turn.split(":")[1]) };
  poses.push({ id, file: e.file, pose });
}

const all: RenderPart[] = [];
for (const { file, pose } of poses) {
  const parts = parseModel(lib, readFileSync(join(repo, file), "latin1")).parts;
  // bounding box (LDU) of the model, for the centre on the floor
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const pos = flatten(lib, p.file, p.color, {}).mesh.positions;
    const m = p.m;
    for (let i = 0; i < pos.length; i += 3) {
      const v = [pos[i], pos[i + 1], pos[i + 2]];
      for (let k = 0; k < 3; k++) {
        const w = m[k * 4] * v[0] + m[k * 4 + 1] * v[1] + m[k * 4 + 2] * v[2] + m[k * 4 + 3];
        mn[k] = Math.min(mn[k], w); mx[k] = Math.max(mx[k], w);
      }
    }
  }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, floor = mx[1];
  const t = (pose.headingDeg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  // world LDU frame: -X east, -Z north, -Y up (render top view: screen right = -X, up = -Z)
  const R: Mat4 = new Float64Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0]);
  const toCentre: Mat4 = new Float64Array([1, 0, 0, -cx, 0, 1, 0, -floor, 0, 0, 1, -cz]);
  const place = mul(new Float64Array([1, 0, 0, -pose.xMm / 0.4, 0, 1, 0, 0, 0, 0, 1, -pose.yMm / 0.4]) as Mat4, mul(R, toCentre));
  for (const p of parts) all.push({ file: p.file, color: p.color, m: mul(place, p.m) });
}
const E = -0.08; // shrink: the image then spans the mat exactly
const BG: [number, number, number] = [255, 0, 255];
if (viewDir) {
  writeFileSync(outFile, render(lib, all, { width: 900, height: 600, background: [235, 235, 235], view: { dir: viewDir } }));
  console.log(`wrote ${outFile}`);
  process.exit(0);
}
const png = PNG.sync.read(render(lib, all, {
  width: Math.round(W * S), height: Math.round(H * S), background: BG,
  view: { dir: [0, 1, 0], up: [0, 0, -1] },
  // the renderer pads the frame by 8% each side: shrink it so the mat fills the picture exactly
  frame: { min: [-W / 0.4 * (1 + E), -400, -H / 0.4 * (1 + E)], max: [(W / 0.4) * E, 0, (H / 0.4) * E] },
}));
// composite over the mat
const mat = PNG.sync.read(readFileSync(join(repo, "resources/2026-27-bioglow/derived/mat-color.png")));
const out = new PNG({ width: png.width, height: png.height });
for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
  const i = (y * png.width + x) * 4;
  const isBg = png.data[i] === 255 && png.data[i + 1] === 0 && png.data[i + 2] === 255;
  const mxp = Math.min(mat.width - 1, Math.floor((x / png.width) * mat.width)), myp = Math.min(mat.height - 1, Math.floor((y / png.height) * mat.height));
  const j = (myp * mat.width + mxp) * 4;
  for (let k = 0; k < 3; k++) out.data[i + k] = isBg ? Math.round(mat.data[j + k] * 0.6) : png.data[i + k];
  out.data[i + 3] = 255;
}
writeFileSync(outFile, PNG.sync.write(out));
console.log(`wrote ${outFile} (${poses.map((p) => p.id).join(", ")})`);
