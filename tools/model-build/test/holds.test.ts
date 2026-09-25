// Game pieces held on by friction stay put until pulled harder than their hold.
import { describe, expect, it } from "vitest";
import { assembleMissionModel } from "@fll-sim/assembly";
import { makeDriveBase, Simulation, type SeasonConfig } from "@fll-sim/sim";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Build, orient } from "../src/build";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();

/** An upright 15L beam (Dual Lock) with a 1x2 brick touching its side, 60 mm above the table. */
async function run(pullN: number) {
  const b = new Build(lib, "hold");
  b.place("32278.dat", 71, orient("+x", "+z", "-y", [0, -150, 0]));
  const brick = b.place("3004.dat", 4, orient("+x", "+y", "+z", [0, -150, -20]), "piece [loose:piece@0.5]");
  const { robot, fixedBodies } = assembleMissionModel(lib, b.parts);
  const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies }], footprints: false });
  sim.unfreezeModels();
  const piece = robot.bodies.find((x) => x.visuals?.some((v) => v.file === "3004.dat"))!.id;
  const body = sim.bodies.find((x) => x.id === `t:${piece}`)!.body;
  void brick;
  const y0 = body.translation().y;
  for (let t = 0; t < 600; t++) {
    if (t > 100 && t < 200) body.applyImpulse({ x: pullN * 0.001, y: 0, z: 0 }, true); // a 0.1 s push sideways
    sim.stepMs(1);
  }
  return { welds: robot.welds ?? [], droppedMm: (y0 - body.translation().y) * 1000 };
}

describe("breakable holds", () => {
  it("a held piece stays up under its own weight and a light push", async () => {
    const r = await run(0.2);
    expect(r.welds.length).toBe(1);
    expect(r.droppedMm).toBeLessThan(1);
  });
  it("a push stronger than the hold knocks it off", async () => {
    const r = await run(1.5);
    expect(r.droppedMm).toBeGreaterThan(20);
  });
});
