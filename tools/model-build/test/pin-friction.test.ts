// Friction pins hold a beam against gravity; frictionless pins let it swing down.
import { describe, expect, it } from "vitest";
import { assemble } from "@fll-sim/assembly";
import { makeDriveBase, Simulation, type SeasonConfig } from "@fll-sim/sim";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Build, orient, pt } from "../src/build";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();

/** Beam A standing upright, beam B pinned to its top hole and sticking out level in mid-air. */
async function droop(pin: string, overrideNm?: number): Promise<number> {
  const b = new Build(lib, "hinge");
  const a = b.place("32278.dat", 71, orient("+x", "+z", "-y"));
  const hole = b.snaps(a, (s) => s.gender === "F" && s.kind === "round" && Math.abs(s.axis[1]) < 0.1).sort((x, y) => x.pos[1] - y.pos[1])[0];
  const p = b.attach(pin, 0, { to: a, where: (s) => Math.hypot(s.pos[0] - hole.pos[0], s.pos[1] - hole.pos[1], s.pos[2] - hole.pos[2]) < 1 });
  const beamB = b.attach("32278.dat", 4, {
    to: p,
    own: (s) => s.gender === "F" && s.kind === "round" && s.pos[2] > 120,
    accept: (m) => Math.abs(pt(m, [0, 0, 140])[1] - pt(m, [0, 0, -140])[1]) < 2, // level
  });
  const { robot, bodyOfPart } = assemble(lib, b.parts, { autoPorts: false });
  expect(robot.freeJoints.length).toBe(1);
  if (overrideNm !== undefined) robot.freeJoints[0].frictionNm = overrideNm;
  const fixed = bodyOfPart[a], moving = bodyOfPart[beamB];
  const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies: [fixed] }], footprints: false });
  sim.unfreezeModels();
  const body = sim.bodies.find((x) => x.id === `t:${moving}`)!.body;
  sim.stepMs(1500);
  const q = body.rotation();
  return (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI; // degrees the free beam turned
}

describe("Technic pin friction", () => {
  it("a black friction pin holds a 15L beam level; a grey frictionless pin lets it swing down", async () => {
    const held = await droop("2780.dat");
    const swung = await droop("3673.dat");
    expect(held).toBeLessThan(1);
    expect(swung).toBeGreaterThan(45);
  });
  it("an overloaded friction joint slips (and doesn't spring back)", async () => {
    // the beam needs ~3 mN·m to stay level: a 1 mN·m joint lets it swing down and hang
    const slipped = await droop("2780.dat", 0.001);
    expect(slipped).toBeGreaterThan(45);
  });
});
