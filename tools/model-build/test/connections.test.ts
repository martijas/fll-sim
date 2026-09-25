// Clips, hinge fingers and bars connect as hinges with the right stiffness.
import { describe, expect, it } from "vitest";
import { assemble, JOINT_FRICTION } from "@fll-sim/assembly";
import { IDENTITY } from "@fll-sim/ldraw";
import { Build } from "../src/build";
import { loadLib } from "../src/lib";

const lib = loadLib();

describe("clips, fingers and bars", () => {
  it("a bar in a clip is a stiff hinge", () => {
    const b = new Build(lib, "clip");
    const clip = b.place("15712.dat", 71, IDENTITY);
    b.attach("87994.dat", 0, { to: clip, offsets: [0] });
    const { robot } = assemble(lib, b.parts, { autoPorts: false });
    expect(robot.freeJoints.length).toBe(1);
    expect(robot.freeJoints[0].frictionNm).toBeCloseTo(JOINT_FRICTION.clip, 5);
  });
  it("a hinge brick (base + top) is a hinge that holds its angle", () => {
    const b = new Build(lib, "hinge");
    b.place("3937.dat", 71, IDENTITY);
    b.place("3938.dat", 71, IDENTITY);
    const { robot } = assemble(lib, b.parts, { autoPorts: false });
    expect(robot.freeJoints.length).toBe(1);
    expect(robot.freeJoints[0].frictionNm).toBeCloseTo(JOINT_FRICTION.clickHinge, 5);
  });
  it("a bar turns in an axle hole", () => {
    const b = new Build(lib, "bar");
    const blk = b.place("6536.dat", 71, IDENTITY); // axle/pin connector: has an axle hole
    const axleHole = b.snaps(blk, (s) => s.gender === "F" && s.kind === "axle")[0];
    b.attach("87994.dat", 0, { to: blk, where: (s) => s === axleHole || (s.gender === "F" && s.kind === "axle" && Math.hypot(s.pos[0] - axleHole.pos[0], s.pos[1] - axleHole.pos[1], s.pos[2] - axleHole.pos[2]) < 1) });
    const { robot } = assemble(lib, b.parts, { autoPorts: false });
    expect(robot.freeJoints.some((j) => Math.abs((j.frictionNm ?? 0) - JOINT_FRICTION.barInAxleHole) < 1e-6)).toBe(true);
  });
});
