// Physics check of the published mission models on the field: builds the simulator with every
// model from seasons/2026-27/mission-models.json (as the app does), lets the field settle and
// reports step cost and every body that moved (a stable field should barely move).
//
//   pnpm run field-check [id ...] [--ms 2000] [--wake] [--render]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assembleMissionModel, parseModel } from "@fll-sim/assembly";
import { makeDriveBase, Simulation, type FieldModel, type SeasonConfig } from "@fll-sim/sim";
import { loadLib } from "./lib";
import { render, VIEWS } from "./render";

const repo = "/home/jason/project";
const args = process.argv.slice(2);
const msI = args.indexOf("--ms");
const MS = msI >= 0 ? Number(args[msI + 1]) : 2000;
const RENDER = args.includes("--render"); // out/field-<id>-{before,after}.png of each model
const only = args.filter((a, i) => !a.startsWith("--") && (msI < 0 || i !== msI + 1));
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const index = JSON.parse(readFileSync(join(repo, "seasons/2026-27/mission-models.json"), "utf8")) as Record<string, { file: string; pose: FieldModel["pose"]; fixed?: boolean }>;
const lib = loadLib();

const fieldModels: FieldModel[] = [];
for (const [id, e] of Object.entries(index)) {
  if (only.length && !only.some((o) => id.startsWith(o))) continue;
  const t0 = performance.now();
  const { robot: model, fixedBodies } = assembleMissionModel(lib, parseModel(lib, readFileSync(join(repo, e.file), "latin1")).parts, { name: id, fixed: e.fixed });
  fieldModels.push({ id, model, pose: e.pose, fixedBodies });
  if (model.welds?.length) console.log(`${id}: holds ${JSON.stringify(model.welds)}`);
  if (model.ropes?.length) console.log(`${id}: ropes ${JSON.stringify(model.ropes)}`);
  console.log(`${id}: ${model.bodies.length} bodies, ${model.bodies.reduce((s, b) => s + b.shapes.length, 0)} colliders, ${model.freeJoints.length} joints, assemble ${(performance.now() - t0).toFixed(0)} ms`);
}
const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels });
if (args.includes("--wake")) sim.unfreezeModels(); // as if the robot were next to every model
const before = sim.transforms().slice();
const ids = sim.bodies.map((b) => b.id);
const t0 = performance.now();
for (let done = 0; done < MS; done += 500) {
  const c0 = performance.now();
  sim.stepMs(Math.min(500, MS - done));
  if (MS > 500) console.log(`  ${done}-${done + 500} ms: ${((performance.now() - c0) / 500).toFixed(2)} ms per step`);
}
const dt = performance.now() - t0;
console.log(`\n${MS} ms simulated in ${dt.toFixed(0)} ms wall (${(dt / MS).toFixed(2)} ms per step)`);
const after = sim.transforms();
const awake = sim.bodies.filter((b) => b.kind === "model" && b.body.isDynamic() && !b.body.isSleeping());
if (awake.length) console.log(`still awake: ${awake.map((b) => `${b.id} (v ${(Math.hypot(b.body.linvel().x, b.body.linvel().y, b.body.linvel().z) * 1000).toFixed(1)} mm/s, w ${Math.hypot(b.body.angvel().x, b.body.angvel().y, b.body.angvel().z).toFixed(2)} rad/s)`).join(", ")}`);
const welds = (sim as unknown as { welds: { broken: boolean }[] }).welds;
if (welds.length) console.log(`holds: ${welds.length}, broken ${welds.filter((w) => w.broken).length}`);
const moved: [string, number, number][] = [];
for (let i = 0; i * 7 < after.length; i++) {
  const d = Math.hypot(after[i * 7] - before[i * 7], after[i * 7 + 1] - before[i * 7 + 1], after[i * 7 + 2] - before[i * 7 + 2]) * 1000;
  const q = Math.abs(after[i * 7 + 3] * before[i * 7 + 3] + after[i * 7 + 4] * before[i * 7 + 4] + after[i * 7 + 5] * before[i * 7 + 5] + after[i * 7 + 6] * before[i * 7 + 6]);
  const ang = (2 * Math.acos(Math.min(1, q)) * 180) / Math.PI;
  if (d > 3 || ang > 5) moved.push([String(ids[i] ?? i), d, ang]);
}
console.log(moved.length ? `moved (>3 mm or >5°):\n${moved.map(([id, d, a]) => `  ${id}: ${d.toFixed(0)} mm, ${a.toFixed(0)}°`).join("\n")}` : "nothing moved");

// Renders of each model before/after settling (body motion applied to its parts' visuals).
if (RENDER) {
  type Q = { x: number; y: number; z: number; w: number };
  const qmul = (a: Q, b: Q): Q => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
  const qinv = (a: Q): Q => ({ x: -a.x, y: -a.y, z: -a.z, w: a.w });
  const qrot = (q: Q, v: number[]) => { const r = qmul(qmul(q, { x: v[0], y: v[1], z: v[2], w: 0 }), qinv(q)); return [r.x, r.y, r.z]; };
  const C = [-1, -1, 1];
  for (const fm of fieldModels) {
    const parts: { file: string; color: number; m: number[] }[][] = [[], []];
    for (const b of fm.model.bodies) {
      const i = sim.bodies.findIndex((x) => x.id === `${fm.id}:${b.id}`);
      const pose = (arr: Float32Array) => ({ p: [arr[i * 7], arr[i * 7 + 1], arr[i * 7 + 2]].map((v) => v * 1000), q: { x: arr[i * 7 + 3], y: arr[i * 7 + 4], z: arr[i * 7 + 5], w: arr[i * 7 + 6] } });
      const t0 = pose(before), t1 = pose(after);
      // body motion in the model frame: D = T0^-1 T1
      const qd = qmul(qinv(t0.q), t1.q);
      const pd = qrot(qinv(t0.q), [t1.p[0] - t0.p[0], t1.p[1] - t0.p[1], t1.p[2] - t0.p[2]]);
      for (const v of b.visuals ?? []) {
        for (const [k, moved] of [[0, false], [1, true]] as const) {
          const cols = [0, 1, 2].map((c) => [v.m[c], v.m[4 + c], v.m[8 + c]]);
          const t = [v.m[3], v.m[7], v.m[11]];
          const rc = moved ? cols.map((c) => qrot(qd, c)) : cols;
          const rt = moved ? qrot(qd, t).map((x, j) => x + pd[j]) : t;
          const m: number[] = [];
          for (let r = 0; r < 3; r++) m.push(C[r] * rc[0][r] / 0.4, C[r] * rc[1][r] / 0.4, C[r] * rc[2][r] / 0.4, C[r] * rt[r] / 0.4);
          parts[k].push({ file: v.file, color: v.color, m });
        }
      }
    }
    for (const [k, name] of [[0, "before"], [1, "after"]] as const) {
      writeFileSync(`out/field-${fm.id}-${name}.png`, render(lib, parts[k].map((p) => ({ ...p, m: new Float64Array(p.m) })), { view: VIEWS.iso }));
    }
  }
  console.log("renders: out/field-<id>-{before,after}.png");
}
