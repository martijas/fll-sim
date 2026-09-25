// Meshing gears turn each other at the right ratio.
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

/** A beam lying flat, two upright 4L axles `holes` studs apart, a gear on each at the same height. */
function train(g1: string, g2: string, studs: number) {
  const b = new Build(lib, "gears");
  const beam = b.place("32278.dat", 71, IDENTITY);
  const z1 = -140, z2 = -140 + studs * 20;
  const ax = [z1, z2].map((z) => b.attach("3705.dat", 0, { to: beam, where: near([0, 0, z]), accept: (m) => m[7] < -25 && m[7] > -35 }));
  // gears resting on the beam (their axles would slide down otherwise)
  const gear = (i: number, file: string) => b.attach(file, 7, { to: ax[i], accept: (m) => Math.abs(m[7] + 20) < 3 });
  const gears = [gear(0, g1), gear(1, g2)];
  const post = b.place("32278.dat", 72, orient("+x", "+z", "-y", [60, 150, 100])); // holds it all off the table
  return { b, beam, post, gears };
}

async function spin(g1: string, g2: string, studs: number) {
  const { b, beam, post, gears } = train(g1, g2, studs);
  const { robot, bodyOfPart } = assemble(lib, b.parts, { autoPorts: false });
  const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies: [bodyOfPart[beam], bodyOfPart[post]] }], footprints: false });
  const body = (i: number) => sim.bodies.find((x) => x.id === `t:${bodyOfPart[gears[i]]}`)!.body;
  sim.unfreezeModels();
  // gear 1 sits on a (medium) motor: its rotor inertia
  body(0).setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: 5e-5, y: 5e-5, z: 5e-5 }, { x: 0, y: 0, z: 0, w: 1 }, true);
  sim.stepMs(1);
  // the motor holds 10 rad/s (~100 rpm); add up how far each gear turns
  const yaw = (i: number) => { const q = body(i).rotation(); return 2 * Math.atan2(q.y, q.w); };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const turned = [0, 0], last = [yaw(0), yaw(1)];
  for (let t = 0; t < 300; t++) {
    motor(body(0), { x: 0, y: 1, z: 0 }, 10);
    sim.stepMs(1);
    for (const i of [0, 1]) { const y = yaw(i); turned[i] += wrap(y - last[i]); last[i] = y; }
  }
  return { gears: robot.gears ?? [], w1: turned[0], w2: turned[1] };
}

/**
 * Beam A lying flat with gear 1 on an upright axle; beam B (held separately, also Dual-Locked)
 * carries gear 2 on a horizontal axle. `pos2`: B's placement; gear 2 is slid to x/z `at2`.
 */
function crossed(g1: string, g2: string, b2: Float64Array, hole2: number[], accept2: (m: Float64Array) => boolean) {
  const b = new Build(lib, "crossed");
  const beamA = b.place("32278.dat", 71, IDENTITY);
  const ax1 = b.attach("3705.dat", 0, { to: beamA, where: near([0, 0, -140]), accept: (m) => m[7] < -25 && m[7] > -35 });
  const gear1 = b.attach(g1, 7, { to: ax1, accept: (m) => Math.abs(m[7] + 20) < 3 });
  const beamB = b.place("32278.dat", 72, b2);
  const ax2 = b.attach("3705.dat", 0, { to: beamB, where: near(hole2), accept: (m) => accept2(m) });
  const gear2 = b.attach(g2, 14, { to: ax2, accept: (m) => accept2(m) && true });
  const post = b.place("32278.dat", 72, orient("+x", "+z", "-y", [60, 150, 100])); // holds it all off the table
  return { b, fixed: [beamA, beamB, post], gears: [gear1, gear2] };
}

type Q = { x: number; y: number; z: number; w: number };
type Drive = (body: (i: number) => import("@dimforge/rapier3d-compat").RigidBody, axes: { x: number; y: number; z: number }[]) => void;
async function run(setup: ReturnType<typeof crossed>, drive: Drive, ms = 300) {
  const { robot, bodyOfPart } = assemble(lib, setup.b.parts, { autoPorts: false });
  // the gears' axes (model frame = world frame for a field model at heading 0)
  const g = robot.gears?.[0];
  const unit = (v: { x: number; y: number; z: number }) => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
  const axes = g ? (g.a === bodyOfPart[setup.gears[0]] ? [unit(g.ja), unit(g.jb)] : [unit(g.jb), unit(g.ja)]) : [];
  const sim = await Simulation.create({ season, robot: makeDriveBase({}), start: { xMm: 230, yMm: 180, headingDeg: 0 }, fieldModels: [{ id: "t", model: robot, pose: { xMm: 1000, yMm: 600, headingDeg: 0 }, fixedBodies: setup.fixed.map((i) => bodyOfPart[i]) }], footprints: false });
  const body = (i: number) => sim.bodies.find((x) => x.id === `t:${bodyOfPart[setup.gears[i]]}`)!.body;
  sim.unfreezeModels();
  for (const i of [0, 1]) body(i).setAdditionalMassProperties(0, { x: 0, y: 0, z: 0 }, { x: 5e-5, y: 5e-5, z: 5e-5 }, { x: 0, y: 0, z: 0, w: 1 }, true);
  sim.stepMs(1);
  const turned = [0, 0];
  const q0 = [body(0).rotation(), body(1).rotation()];
  let last = q0.map((q) => ({ ...q }));
  // signed rotation about each gear's own axis, step by step: q_delta = conj(last) * now
  const about = (a: Q, b: Q, ax: { x: number; y: number; z: number }) => {
    const d = { w: a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z, x: a.w * b.x - a.x * b.w - a.y * b.z + a.z * b.y, y: a.w * b.y + a.x * b.z - a.y * b.w - a.z * b.x, z: a.w * b.z - a.x * b.y + a.y * b.x - a.z * b.w };
    return 2 * Math.atan2(d.x * ax.x + d.y * ax.y + d.z * ax.z, d.w);
  };
  for (let t = 0; t < ms; t++) {
    drive(body, axes);
    sim.stepMs(1);
    const now = [body(0).rotation(), body(1).rotation()];
    for (const i of [0, 1]) turned[i] += about(last[i], now[i], axes[i]);
    last = now.map((q) => ({ ...q }));
  }
  return { gears: robot.gears ?? [], turned };
}

describe("gears", () => {
  it("an 8 tooth gear drives a 24 tooth gear 2 studs away at -1:3", async () => {
    const r = await spin("3647.dat", "3648b.dat", 2);
    expect(r.gears.map((g) => g.label)).toEqual(["8:24"]);
    expect(Math.abs(r.w2 / r.w1 + 1 / 3)).toBeLessThan(0.33 * 0.02); // within 2 %
  });
  it("two 16 tooth gears 2 studs apart turn at -1:1", async () => {
    const r = await spin("94925.dat", "94925.dat", 2);
    expect(r.gears.length).toBe(1);
    expect(Math.abs(r.w2 / r.w1 + 1)).toBeLessThan(0.02);
  });
  it("gears too far apart don't mesh", async () => {
    const r = await spin("3647.dat", "3648b.dat", 3);
    expect(r.gears.length).toBe(0);
  });
  it("a worm drives a 24 tooth gear 24:1 and can't be turned back from the gear", async () => {
    // worm on a horizontal axle along x, 40 LDU (pitch radius 30 + worm 10) beside the 24t
    const setup = () => crossed("3648b.dat", "4716.dat", orient("-z", "+x", "-y", [-50, 120, -100]), [-50, -20, -100], (m) => Math.abs(m[7] + 20) < 3 && Math.abs(m[3]) < 25);
    const s1 = setup();
    const fwd = await run(s1, (body, ax) => motor(body(1), ax[1], 10));
    expect(fwd.gears.map((g) => g.label)).toEqual(["worm:24"]);
    expect(Math.abs(Math.abs(fwd.turned[0] / fwd.turned[1]) - 1 / 24)).toBeLessThan(0.02 / 24);
    // back-driving: a strong torque on the gear barely moves anything
    const back = await run(setup(), (body, ax) => body(0).applyTorqueImpulse(scale(ax[0], 0.05 * 0.001), true));
    // unlocked, 50 mN·m would spin the gear ~45 rad in 0.3 s; locked it only settles a little
    expect(Math.abs(back.turned[0])).toBeLessThan(0.1);
  });
  it("two 12 tooth double bevels at right angles turn 1:1", async () => {
    // gear 2 on an axle along z whose line meets gear 1's axis 15 LDU (one pitch radius) above it
    const setup = crossed("32270.dat", "32270.dat", orient("+y", "+z", "+x", [0, -35, -85]), [0, -35, -85], (m) => Math.abs(m[11] + 125) < 3);
    const r = await run(setup, (body, ax) => motor(body(0), ax[0], 10));
    expect(r.gears.map((g) => g.label)).toEqual(["12:12"]);
    expect(Math.abs(Math.abs(r.turned[1] / r.turned[0]) - 1)).toBeLessThan(0.02);
  });
});

const scale = (v: { x: number; y: number; z: number }, s: number) => ({ x: v.x * s, y: v.y * s, z: v.z * s });

/** A motor on body i: speed control towards `w` rad/s about `axis` (torque, like a SPIKE motor). */
function motor(b: import("@dimforge/rapier3d-compat").RigidBody, axis: { x: number; y: number; z: number }, w: number) {
  const v = b.angvel();
  const now = v.x * axis.x + v.y * axis.y + v.z * axis.z;
  const tq = Math.max(-0.2, Math.min(0.2, 0.02 * (w - now)));
  b.applyTorqueImpulse(scale(axis, tq * 0.001), true);
}
