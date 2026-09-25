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
  /** Game pieces: label prefixes; each becomes one free piece (tagged `[loose:<prefix>]`). */
  loose?: string[];
  /** Not held by Dual Lock (the whole model can be moved). */
  free?: boolean;
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
  m02: [{ id: "m02", loose: ["seed 1", "seed 2", "seed 3"] }],
  m03: [{ id: "m03" }],
  m04: [{ id: "m04", loose: ["katydid", "leaf (left)", "leaf (middle)"] }],
  m05: [{ id: "m05" }],
  "m06-07": [{ id: "m06-07", search: 60 }],
  "m08-09": [{ id: "m08-09", search: 60, outline: ["root"], rot: [0, 25], loose: ["research platform"] }],
  m10: [{ id: "m10a", labels: ["spider"], outline: ["green 3x5 L", "lime 2L"] }, { id: "m10b", labels: ["snail"] }],
  m11: [{ id: "m11", search: 50 }],
  m12: [{ id: "m12", exclude: ["post", "tie"], search: 50 }, { id: "m12-post", labels: ["post", "tie"], search: 40 }],
  m13: [{ id: "dock-farm", search: 60 }],
  m14: [{ id: "dock-city", search: 60 }],
  m15: [{ id: "dock-mine", search: 70 }],
};

const lib = loadLib();

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
        const piece = t.loose!.find((l) => lab(p).replace(/ \[loose:[^\]]*\]/, "").startsWith(l.toLowerCase()));
        const base = (p.label ?? "").replace(/ \[loose:[^\]]*\]/, "");
        return piece ? { ...p, label: `${base} [loose:${piece}]` } : p;
      });
    if (!parts.length) {
      console.log(`${book} -> ${t.id}: no parts match ${t.labels}`);
      continue;
    }
    const file = join(OUT, `${t.id}.ldr`);
    writeFileSync(file, serializeModel(parts, `${t.id}.ldr`));
    const spec = season.missionModels.find((m: { id: string }) => m.id === t.id);
    const [cx, cy] = t.hint ?? [spec.shape.cx, spec.shape.cy];
    const res = JSON.parse(
      execFileSync("npx", ["tsx", join(repo, "tools/model-build/src/place-on-mat.ts"), file, String(cx), String(cy), String(t.search ?? 45), ...(t.outline ? ["--outline", t.outline.join("|")] : []), ...(t.rot ? ["--rot", String(t.rot[0]), "--rot-window", String(t.rot[1])] : []), "--png", join(repo, "tools/model-build/out", `place-${t.id}.png`)], { cwd: join(repo, "tools/model-build") })
        .toString()
        .trim()
        .split("\n")
        .pop()!,
    );
    index[t.id] = { file: `apps/desktop/resources/missions/${t.id}.ldr`, book, parts: parts.length, ...(t.free ? { fixed: false } : {}), pose: { xMm: res.cx, yMm: res.cy, headingDeg: res.rot }, fitMeanMm: res.meanDistMm };
    console.log(`${book} -> ${t.id}: ${parts.length} parts at (${res.cx}, ${res.cy}) rot ${res.rot}°, fit ${res.meanDistMm} mm`);
  }
}
writeFileSync(INDEX, JSON.stringify(index, null, 2) + "\n");
