// Render a robot with tools put on at their mounts (as the app's loadout does), from a few angles.
//
//   pnpm exec tsx src/loadout-render.ts <robot.ldr> <out-prefix> [tool.ldr ...] [--dir x,y,z]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { attachTool, findMounts, parseModel } from "@fll-sim/assembly";
import { loadLib } from "./lib";
import { render, VIEWS } from "./render";

const args = process.argv.slice(2);
const di = args.indexOf("--dir");
const dir = di >= 0 ? (args.splice(di, 2)[1].split(",").map(Number) as [number, number, number]) : null;
const [robotFile, prefix, ...toolFiles] = args;
const lib = loadLib();
let parts = parseModel(lib, readFileSync(robotFile, "latin1")).parts;
for (const f of toolFiles) {
  const tp = parseModel(lib, readFileSync(f, "latin1")).parts;
  const r = findMounts(tp).map((m) => attachTool(parts, tp, basename(f), m.name)).find(Boolean);
  if (!r) { console.log(`${f}: no matching mount`); continue; }
  console.log(`${basename(f)} -> ${r.mount}`);
  parts = r.parts;
}
const rp = parts.filter((p) => !p.file.startsWith("fllsim-")).map((p) => ({ file: p.file, color: p.color, m: p.m }));
const views = dir ? { custom: { dir } } : { iso: VIEWS.iso, isoBack: VIEWS.isoBack, right: VIEWS.right, top: VIEWS.top };
for (const [n, v] of Object.entries(views)) {
  writeFileSync(`${prefix}-${n}.png`, render(lib, rp, { width: 900, height: 700, view: v }));
  console.log(`wrote ${prefix}-${n}.png`);
}
