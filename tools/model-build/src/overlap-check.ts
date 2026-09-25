// Checks that no two mission models touch or overlap as set up, for every assignment of the
// interchangeable models (M13-M15) to the docks, and that nothing falls over once woken.
//
//   pnpm exec tsx src/overlap-check.ts [--ms 1500]
import { fieldModels, fieldSim } from "./field";

const args = process.argv.slice(2);
const msI = args.indexOf("--ms");
const MS = msI >= 0 ? Number(args[msI + 1]) : 1500;
/** Models that rest on each other by design (the M01 drone sits on its stand). */
const TOGETHER = new Set(["m01 + m01-stand"]);
const perms = [["m13", "m14", "m15"], ["m13", "m15", "m14"], ["m14", "m13", "m15"], ["m14", "m15", "m13"], ["m15", "m13", "m14"], ["m15", "m14", "m13"]];
let bad = 0;
for (const [farm, city, mine] of perms) {
  const sim = await fieldSim(fieldModels(undefined, { farm, city, mine }));
  sim.unfreezeModels();
  sim.stepMs(20);
  const s0 = sim.snapshot();
  const model = (id: string) => id.split(":")[0];
  const cross = new Set<string>();
  for (const b of s0.bodies) for (const o of b.touches) if (o.includes(":") && model(o) !== b.model && !TOGETHER.has([b.model, model(o)].sort().join(" + "))) cross.add([b.model, model(o)].sort().join(" + "));
  sim.stepMs(MS);
  const s1 = sim.snapshot();
  const moved = s1.bodies.filter((b) => {
    const d = Math.hypot(b.pose.p[0] - b.start.p[0], b.pose.p[1] - b.start.p[1], b.pose.p[2] - b.start.p[2]);
    const dot = Math.abs(b.pose.q.reduce((s, v, i) => s + v * b.start.q[i], 0));
    return d > 15 || 2 * Math.acos(Math.min(1, dot)) > 0.35;
  });
  const fell = [...new Set(moved.map((b) => b.model))];
  console.log(`farm=${farm} city=${city} mine=${mine}: touching ${cross.size ? [...cross].join(", ") : "none"}; moved >15 mm or >20°: ${fell.length ? moved.map((b) => b.id).join(", ") : "none"}`);
  if (cross.size) bad++;
}
process.exitCode = bad ? 1 : 0;
