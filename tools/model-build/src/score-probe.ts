// Lists every mission model's bodies (with part labels), hinges and holds: a map for writing the
// automatic scoring rules (seasons/2026-27/autoscore.ts).
//
//   pnpm exec tsx src/score-probe.ts [id ...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assembleMissionModel, parseModel } from "@fll-sim/assembly";
import { loadLib } from "./lib";

const repo = join(import.meta.dirname, "../../..");
const index = JSON.parse(readFileSync(join(repo, "seasons/2026-27/mission-models.json"), "utf8")) as Record<string, { file: string; fixed?: boolean }>;
const lib = loadLib();
const only = process.argv.slice(2);
for (const [id, e] of Object.entries(index)) {
  if (id.startsWith("_") || (only.length && !only.includes(id))) continue;
  const { robot, fixedBodies } = assembleMissionModel(lib, parseModel(lib, readFileSync(join(repo, e.file), "latin1")).parts, { name: id, fixed: e.fixed });
  console.log(`== ${id} fixed=${fixedBodies}`);
  for (const b of robot.bodies) {
    const ys = b.shapes.map((s) => s.posMm.y);
    const cx = b.shapes.reduce((s, x) => s + x.posMm.x, 0) / b.shapes.length, cz = b.shapes.reduce((s, x) => s + x.posMm.z, 0) / b.shapes.length;
    console.log(`  ${b.id}${fixedBodies.includes(b.id) ? "*" : ""} n=${b.visuals?.length} y=${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)} c=(${cx.toFixed(0)},${cz.toFixed(0)}) :: ${(b.labels ?? []).join(" | ").slice(0, 400)}`);
  }
  for (const j of robot.freeJoints) console.log(`  J ${j.a}-${j.b} axis=${[j.axis.x, j.axis.y, j.axis.z].map((v) => v.toFixed(2))} at=${[j.anchorMm.x, j.anchorMm.y, j.anchorMm.z].map((v) => v.toFixed(0))}${j.slide ? " slide" : ""}`);
  for (const w of robot.welds ?? []) console.log(`  W ${w.a}-${w.b} ${w.breakN}N`);
}
