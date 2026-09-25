// The season's field as the app sets it up: every bundled mission model on its mat marks, the
// interchangeable models (M13-M15) on their docks under the field ids "dock-<site>".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleMissionModel, parseModel } from "@fll-sim/assembly";
import { makeDriveBase, Simulation, type FieldModel, type SeasonConfig, type StartPose } from "@fll-sim/sim";
import { loadLib } from "./lib";

const repo = join(import.meta.dirname, "../../..");
export const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
type Entry = { file: string; pose: StartPose; fixed?: boolean; dock?: { x: number; z: number; dirDeg: number } };
type Site = { xMm: number; yMm: number; dirDeg: number };
const raw = JSON.parse(readFileSync(join(repo, "seasons/2026-27/mission-models.json"), "utf8"));
const index = raw as Record<string, Entry>;
const docksAt = raw._docks as Record<string, Site>;

/** Pose of a dock model on a dock site (as lib/assets.ts poseOnDock in the app). */
function poseOnDock(dock: NonNullable<Entry["dock"]>, site: Site): StartPose {
  const h = site.dirDeg - dock.dirDeg, r = (h * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { xMm: site.xMm - (c * dock.x - s * dock.z), yMm: site.yMm - (s * dock.x + c * dock.z), headingDeg: ((h % 360) + 360) % 360 };
}

/** Field models (ids as in the app); `docks` = which model sits on which dock. */
export function fieldModels(only?: string[], docks: Record<string, string> = { farm: "m13", city: "m14", mine: "m15" }): FieldModel[] {
  const lib = loadLib();
  const out: FieldModel[] = [];
  const build = (id: string, e: Entry, pose: StartPose) => {
    const { robot: model, fixedBodies } = assembleMissionModel(lib, parseModel(lib, readFileSync(join(repo, e.file), "latin1")).parts, { name: id, fixed: e.fixed });
    out.push({ id, model, pose, fixedBodies });
  };
  for (const [id, e] of Object.entries(index)) {
    if (id.startsWith("_") || e.dock || (only && !only.some((o) => id.startsWith(o)))) continue;
    build(id, e, e.pose);
  }
  for (const [site, mid] of Object.entries(docks)) {
    if (only && !only.includes(mid)) continue;
    const e = index[mid];
    build(`dock-${site}`, e, poseOnDock(e.dock!, docksAt[site]));
  }
  return out;
}

export async function fieldSim(models: FieldModel[], start: StartPose = { xMm: 230, yMm: 180, headingDeg: 0 }) {
  return Simulation.create({ season, robot: makeDriveBase({}), start, fieldModels: models, footprints: false });
}
