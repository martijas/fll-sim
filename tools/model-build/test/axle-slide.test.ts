// An axle in a round hole slides; bushes (or anything else on it) stop it at the beam.
import { describe, expect, it } from "vitest";
import { assemble } from "@fll-sim/assembly";
import { IDENTITY } from "@fll-sim/ldraw";
import { makeDriveBase, Simulation, type SeasonConfig } from "@fll-sim/sim";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Build, orient } from "../src/build";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();
const near = (p: number[]) => (s: { pos: number[] }) => Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]) < 1;

/** A beam lying flat, an upright 6L axle in a hole with a 24t gear on it, above or below the beam. */
async function drop(gearAbove: boolean) {
  const b = new Build(lib, "axle");
  const beam = b.place("32278.dat", 71, IDENTITY);
  const axle = b.attach("3706.dat", 0, { to: beam, where: near([0, 0, 0]), offsets: [-50, -40, -30, 30, 40, 50], accept: (m) => Math.abs(m[7] - (gearAbove ? -40 : 40)) < 3 });
  b.attach("3648b.dat", 7, { to: axle, accept: (m) => (gearAbove ? m[7] < -30 && m[7] > -50 : m[7] > 30 && m[7] < 50) });
  // a tall post beside it (its own Dual-Locked body) holds everything up off the table
  const post = b.place("32278.dat", 72, orient("+x", "+z", "-y", [0, 150, 100]));
  const { robot, bodyOfPart } = assemble(lib, b.parts, { autoPorts: false });
  const hinge = robot.freeJoints[0];
  const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies: [bodyOfPart[beam], bodyOfPart[post]] }], footprints: false });
  const body = sim.bodies.find((x) => x.id === `t:${bodyOfPart[axle]}`)!.body;
  sim.unfreezeModels();
  const y0 = body.translation().y;
  sim.stepMs(800);
  return { slide: hinge.slide, droppedMm: (y0 - body.translation().y) * 1000 };
}

describe("axles in round holes", () => {
  it("slide down through the hole until only a little is left inside", async () => {
    const r = await drop(false); // gear hanging below the beam: nothing stops it
    expect(r.slide).toBeDefined();
    // the axle's lower end starts 20 LDU below the beam's underside... it drops until 4 LDU remain engaged
    expect(r.droppedMm).toBeGreaterThan(10);
    expect(r.droppedMm).toBeCloseTo(Math.max(-r.slide!.minMm, r.slide!.maxMm), 0);
  });
  it("stop where a gear on the axle meets the beam", async () => {
    const free = await drop(false), stopped = await drop(true);
    // the gear sits 20 LDU (8 mm) above the beam: it drops exactly that far and rests on it
    expect(stopped.droppedMm).toBeCloseTo(8, 0);
    expect(stopped.droppedMm).toBeLessThan(free.droppedMm - 1);
  });
});
