// Game pieces held on by friction stay put until pulled harder than their hold.
import { describe, expect, it } from "vitest";
import { assemble, assembleMissionModel } from "@fll-sim/assembly";
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

describe("robot parts held by a stud or two can be knocked off", () => {
  /** Two stacked 2x4 bricks (Dual Lock) with a 1x1 round plate on one stud; pushed sideways for 0.1 s. */
  async function knock(pushN: number) {
    const b = new Build(lib, "stud");
    b.place("3001.dat", 71, orient("+x", "+y", "+z", [0, 0, 0]));
    b.place("3001.dat", 71, orient("+x", "+y", "+z", [0, -24, 0]));
    const plate = b.place("4073.dat", 4, orient("+x", "+y", "+z", [30, -32, 10]));
    const { robot, bodyOfPart } = assemble(lib, b.parts, { autoPorts: false, breakable: true });
    const fixedBodies = [bodyOfPart[0]];
    const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies }], footprints: false });
    sim.unfreezeModels();
    void plate;
    const piece = robot.bodies.find((x) => x.visuals?.some((v) => v.file === "4073.dat"))!.id;
    const body = sim.bodies.find((x) => x.id === `t:${piece}`)!.body;
    const p0 = body.translation();
    for (let t = 0; t < 400; t++) {
      if (t > 50 && t < 150) body.applyImpulse({ x: pushN * 0.001, y: 0, z: 0 }, true);
      sim.stepMs(1);
    }
    const p1 = body.translation();
    return { welds: robot.welds ?? [], movedMm: Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z) * 1000 };
  }
  it("a light push leaves it on", async () => {
    const r = await knock(0.5);
    expect(r.welds.length).toBe(1);
    expect(r.movedMm).toBeLessThan(1);
  });
  it("a hard push pops it off", async () => {
    const r = await knock(5);
    expect(r.movedMm).toBeGreaterThan(10);
  });
  it("a brick stacked on a brick is one solid body", () => {
    const b = new Build(lib, "stack");
    b.place("3001.dat", 71, orient("+x", "+y", "+z", [0, -24, 0]));
    b.place("3001.dat", 4, orient("+x", "+y", "+z", [0, -48, 0]));
    const { robot } = assemble(lib, b.parts, { autoPorts: false, breakable: true });
    expect(robot.bodies.length).toBe(1);
    expect(robot.welds ?? []).toEqual([]);
  });
});
