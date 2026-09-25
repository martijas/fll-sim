// Publish scripted mission models to the app: split books into season mission models, find each
// one's pose on the mat by matching its floor footprint against the wireframe, and write
//   apps/desktop/resources/missions/<id>.ldr  and  seasons/2026-27/mission-models.json
//
//   pnpm exec tsx src/publish.ts [id ...]     (default: every out/*.ldr that has a mapping)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzePart, findConnections, parseModel, serializeModel, worldSnapFor, type ModelPart, type WSnap } from "@fll-sim/assembly";
import { loadLib } from "./lib";

const repo = "/home/jason/project";
const OUT = join(repo, "apps/desktop/resources/missions");
const INDEX = join(repo, "seasons/2026-27/mission-models.json");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8"));

/**
 * Book model -> season mission model(s). `labels` selects parts by label substring when a book
 * contains several separately placed models; `search` = placement search radius (mm);
 * `hint` overrides the start point (mm) for models whose footprint in season.json is only a part.
 */
interface Target {
  id: string;
  labels?: string[];
  exclude?: string[];
  /** Keep only the connected component(s) containing a part with this label (loose pieces resting on them come along). */
  component?: string;
  /** Drop the connected component(s) containing a part with this label. */
  withoutComponent?: string;
  /**
   * Game pieces: label prefixes; each becomes one free piece (tagged `[loose:<prefix>]`).
   * "<prefix>@<N>": held on to what it rests against until pulled with more than N newtons;
   * "<prefix>~": keeps its own hinges (otherwise a piece is one solid object).
   */
  loose?: string[];
  /** Not held by Dual Lock (the whole model can be moved). */
  free?: boolean;
  /** An interchangeable model (M13-15), fitted on this dock (its mark's season id: dock-<name>). */
  dock?: "farm" | "city" | "mine";
  /** Match only these parts' floor contact against the mat marks (label substrings). */
  outline?: string[];
  search?: number;
  hint?: [number, number];
  rot?: [number, number];
}

const MAP: Record<string, Target[]> = {
  // M01: the chain (base, drone, chair) along the south edge facing south; the LiDAR map stand is
  // a separate model on the tilted square behind it.
  m01: [
    { id: "m01", withoutComponent: "5x5 L-shaped technic brick", search: 60, hint: [880, 139], rot: [0, 20] },
    { id: "m01-stand", component: "5x5 L-shaped technic brick", search: 50, hint: [1050, 227] },
  ],
  // the seeds sit on the stalk (bars in clips) until the robot knocks them off
  m02: [{ id: "m02", loose: ["seed 1@1", "seed 2@1", "seed 3@1"] }],
  m03: [{ id: "m03" }],
  // the katydid stands in its slot (leaning on the nest) until it is pushed
  m04: [{ id: "m04", loose: ["katydid@0.3", "leaf (left)", "leaf (middle)"] }],
  m05: [{ id: "m05" }],
  "m06-07": [{ id: "m06-07", search: 60 }],
  "m08-09": [{ id: "m08-09", search: 60, outline: ["root"], rot: [0, 25], loose: ["research platform~"] }],
  // (field setup guide: the snail stands against the north wall, the spider in the middle)
  m10: [{ id: "m10a", labels: ["snail"] }, { id: "m10b", labels: ["spider"], outline: ["green 3x5 L", "lime 2L"] }],
  m11: [{ id: "m11", search: 50 }],
  m12: [{ id: "m12", exclude: ["post", "tie"], search: 50 }, { id: "m12-post", labels: ["post", "tie"], search: 40 }],
  // Missions 13-15 are interchangeable: teams choose which model goes on which dock (farm, city,
  // mine). Each is fitted on one dock here; the app can move any of them to any dock.
  m13: [{ id: "m13", dock: "farm", search: 60 }],
  m14: [{ id: "m14", dock: "city", search: 60 }],
  m15: [{ id: "m15", dock: "mine", search: 70 }],
};

const lib = loadLib();

/**
 * The dock inside an interchangeable model (model frame as the app places it: mm, x right, z back,
 * centred on the model's bounding box): the flat 11x15 frame's centre, and the direction from it
 * to the dock's upright 5x7 frames (which way the dock faces).
 */
function dockInModel(parts: ModelPart[]): { x: number; z: number; dirDeg: number } {
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  const conv = (p: number[]) => [-p[0] * 0.4, p[2] * 0.4]; // LDraw -> model mm (x right, z back)
  for (const p of parts) {
    const a = analyzePart(lib, p.file);
    for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
      const w = conv([p.m[0] * x + p.m[1] * y + p.m[2] * z + p.m[3], 0, p.m[8] * x + p.m[9] * y + p.m[10] * z + p.m[11]]);
      lo = [Math.min(lo[0], w[0]), Math.min(lo[1], w[1])];
      hi = [Math.max(hi[0], w[0]), Math.max(hi[1], w[1])];
    }
  }
  const ox = (lo[0] + hi[0]) / 2, oz = (lo[1] + hi[1]) / 2;
  const frame = parts.filter((p) => p.file === "39790.dat").sort((a, b) => b.m[7] - a.m[7])[0];
  if (!frame) throw new Error("no dock frame (39790) in this model");
  const ups = parts.filter((p) => p.file === "64179.dat" && Math.abs(p.m[3] - frame.m[3]) < 200 && Math.abs(p.m[11] - frame.m[11]) < 140 && p.m[7] > frame.m[7] - 200);
  if (!ups.length) throw new Error("no dock uprights (64179) near the dock frame");
  const [cx, cz] = conv([frame.m[3], 0, frame.m[11]]);
  const mean = ups.reduce((acc, p) => [acc[0] + p.m[3] / ups.length, acc[1] + p.m[11] / ups.length], [0, 0]);
  const [ux, uz] = conv([mean[0], 0, mean[1]]);
  return { x: +(cx - ox).toFixed(2), z: +(cz - oz).toFixed(2), dirDeg: +((Math.atan2(uz - cz, ux - cx) * 180) / Math.PI).toFixed(2) };
}

/** Connected component per part (any snap connection joins parts). */
function components(parts: ModelPart[]): number[] {
  const snaps: WSnap[] = [];
  parts.forEach((p, i) => {
    for (const s of analyzePart(lib, p.file).snaps) {
      const w = worldSnapFor(s, p.m, i, i, false);
      if (w) snaps.push(w);
    }
  });
  const parent = parts.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const c of findConnections(snaps)) parent[find(c.a)] = find(c.b);
  return parts.map((_, i) => find(i));
}
const index: Record<string, unknown> = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : {};
// (older layout: dock models were stored under their dock's id)
for (const k of ["dock-farm", "dock-city", "dock-mine"]) delete index[k];
mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
for (const [book, targets] of Object.entries(MAP)) {
  if (wanted.length && !wanted.includes(book)) continue;
  const src = join(repo, "tools/model-build/out", `${book}.ldr`);
  if (!existsSync(src)) {
    console.log(`${book}: not built yet`);
    continue;
  }
  const all = parseModel(lib, readFileSync(src, "latin1")).parts;
  for (const t of targets) {
    const lab = (p: { label?: string }) => (p.label ?? "").toLowerCase();
    let parts = t.labels ? all.filter((p) => t.labels!.some((l) => lab(p).includes(l))) : all;
    if (t.component || t.withoutComponent) {
      const comp = components(all);
      const key = (t.component ?? t.withoutComponent)!.toLowerCase();
      const hit = new Set(all.map((p, i) => (lab(p).includes(key) ? comp[i] : -1)).filter((c) => c >= 0));
      parts = all.filter((_, i) => (t.component ? hit.has(comp[i]) : !hit.has(comp[i])));
    }
    if (t.exclude) parts = parts.filter((p) => !t.exclude!.some((l) => lab(p).includes(l)));
    if (t.loose)
      parts = parts.map((p) => {
        const piece = t.loose!.find((l) => lab(p).replace(/ \[loose:[^\]]*\]/, "").startsWith(l.split("@")[0].replace(/~$/, "").toLowerCase()));
        const base = (p.label ?? "").replace(/ \[loose:[^\]]*\]/, "");
        return piece ? { ...p, label: `${base} [loose:${piece}]` } : p;
      });
    if (!parts.length) {
      console.log(`${book} -> ${t.id}: no parts match ${t.labels}`);
      continue;
    }
    const file = join(OUT, `${t.id}.ldr`);
    writeFileSync(file, serializeModel(parts, `${t.id}.ldr`));
    const spec = season.missionModels.find((m: { id: string }) => m.id === (t.dock ? `dock-${t.dock}` : t.id));
    const [cx, cy] = t.hint ?? [spec.shape.cx, spec.shape.cy];
    const res = JSON.parse(
      execFileSync("npx", ["tsx", join(repo, "tools/model-build/src/place-on-mat.ts"), file, String(cx), String(cy), String(t.search ?? 45), ...(t.outline ? ["--outline", t.outline.join("|")] : []), ...(t.rot ? ["--rot", String(t.rot[0]), "--rot-window", String(t.rot[1])] : []), "--png", join(repo, "tools/model-build/out", `place-${t.id}.png`)], { cwd: join(repo, "tools/model-build") })
        .toString()
        .trim()
        .split("\n")
        .pop()!,
    );
    index[t.id] = { file: `apps/desktop/resources/missions/${t.id}.ldr`, book, parts: parts.length, ...(t.free ? { fixed: false } : {}), pose: { xMm: res.cx, yMm: res.cy, headingDeg: res.rot }, fitMeanMm: res.meanDistMm };
    if (t.dock) {
      // where the dock is in the model, and so where this dock location is on the mat
      const d = dockInModel(parts);
      const h = (res.rot * Math.PI) / 180, c = Math.cos(h), sn = Math.sin(h);
      (index[t.id] as Record<string, unknown>).dock = d;
      const docks = (index._docks ?? {}) as Record<string, unknown>;
      docks[t.dock] = { xMm: +(res.cx + c * d.x - sn * d.z).toFixed(1), yMm: +(res.cy + sn * d.x + c * d.z).toFixed(1), dirDeg: +(((d.dirDeg + res.rot) % 360 + 360) % 360).toFixed(1) };
      index._docks = docks;
    }
    console.log(`${book} -> ${t.id}: ${parts.length} parts at (${res.cx}, ${res.cy}) rot ${res.rot}°, fit ${res.meanDistMm} mm`);
  }
}
writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");
