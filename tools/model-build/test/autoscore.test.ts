// Automatic scoring from the simulated field: the untouched field, pieces moved into scoring
// positions (the snapshot edited as the physics would leave it), and a seed really knocked off.
import { beforeAll, describe, expect, it } from "vitest";
import type { FieldSnapshot } from "@fll-sim/sim";
import { autoScore, type SnapBody } from "../../../seasons/2026-27/autoscore";
import { defaultAnswers, score } from "../../../seasons/2026-27/scoring";
import { fieldModels, fieldSim } from "../src/field";

type V3 = [number, number, number];
type Q4 = [number, number, number, number];
const qmul = (a: Q4, b: Q4): Q4 => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q: Q4, v: V3): V3 => { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [r[0], r[1], r[2]]; };
const worldPts = (b: SnapBody) => b.pts.map((p) => qrot(b.pose.q, p).map((v, k) => v + b.pose.p[k]) as V3);
const center = (b: SnapBody): V3 => { const w = worldPts(b); return [0, 1, 2].map((k) => w.reduce((s, p) => s + p[k], 0) / w.length) as V3; };
const lowest = (b: SnapBody) => Math.min(...worldPts(b).map((p) => p[1]));

let start: FieldSnapshot;
/** A copy of the set-up field with every model woken (as after the robot has been around). */
const woken = (): FieldSnapshot => { const s = structuredClone(start); for (const b of s.bodies) b.frozen = false; return s; };
const find = (s: FieldSnapshot, re: RegExp) => s.bodies.filter((b) => b.labels.some((l) => re.test(l)));
const move = (b: SnapBody, d: V3) => { b.pose.p = b.pose.p.map((v, k) => v + d[k]) as V3; b.frozen = false; };
/** Turn a body by `deg` about a world axis through point c. */
const turn = (b: SnapBody, axis: V3, deg: number, c: V3) => {
  const h = (deg * Math.PI) / 360, r: Q4 = [axis[0] * Math.sin(h), axis[1] * Math.sin(h), axis[2] * Math.sin(h), Math.cos(h)];
  b.pose.q = qmul(r, b.pose.q);
  b.pose.p = qrot(r, b.pose.p.map((v, k) => v - c[k]) as V3).map((v, k) => v + c[k]) as V3;
  b.frozen = false;
};
/** Put a piece (all its bodies) down on the mat with its centre at world x/z. */
const putDown = (bs: SnapBody[], x: number, z: number) => {
  const c = center(bs[0]), low = Math.min(...bs.map(lowest));
  for (const b of bs) { move(b, [x - c[0], -low, z - c[2]]); b.attached = []; b.touches = ["mat"]; }
};

beforeAll(async () => {
  const sim = await fieldSim(fieldModels());
  start = sim.snapshot();
}, 300000);

describe("automatic scoring", () => {
  it("the untouched field scores only what an empty run scores", () => {
    const r = autoScore(start);
    expect(r.answers).toEqual({
      m01a: false, m01b: false, m02: 0, m03a: false, m03b: false, m04a: 0, m04b: true, m04c: true, m05: "No", m07a: false, m08: false,
      m09a: false, m09b: false, m09c: false, m10a: true, m10b: true, m11: false, m12a: false, m12b: false, m14a: 0, m14b: 0,
      m15a: false, m15b: false, m15c: false, m15d: "Mine",
    });
    // (both habitats untouched: 20; precision tokens: 50)
    expect(score({ ...defaultAnswers(), ...r.answers }).total).toBe(70);
    // what can't be judged is left to the team, with the reason
    for (const q of ["m06a", "m06b", "m07b", "m13", "pt"]) expect(q in r.answers).toBe(false), expect(r.notes[q]).toBeTruthy();
  });

  it("M01: the drone lifted off the mat", () => {
    const s = woken();
    for (const b of find(s, /^drone 2x4 plate/)) move(b, [0, 40, 0]);
    expect(autoScore(s).answers.m01a).toBe(true);
    const map = find(s, /^4x6 hollow technic brick/)[0];
    turn(map, [1, 0, 0], 170, center(map));
    const r = autoScore(s);
    expect(r.answers.m01b).toBeUndefined(); // flipped: the scan marker is for the team to check
    expect(r.notes.m01b).toMatch(/scan marker/);
  });

  it("M02: a seed knocked off the stalk", () => {
    const s = woken();
    const seed = find(s, /\[loose:seed 1@/);
    expect(autoScore(s).answers.m02).toBe(0); // still held
    putDown(seed, center(seed[0])[0] + 80, center(seed[0])[2]);
    expect(autoScore(s).answers.m02).toBe(1);
    expect(autoScore(s).notes.m02).toMatch(/seed 2, seed 3 can't come off/);
  });

  it("M03: the rock flipped over is not in its starting position", () => {
    const s = woken();
    const r0 = autoScore(s);
    expect(r0.answers.m03b).toBeUndefined(); // woken, rock in place: flipped and put back?
    expect("m03a" in r0.answers).toBe(false);
    const p = find(s, /^rotating platform/)[0];
    turn(p, [1, 0, 0], 180, center(p));
    expect(autoScore(s).answers.m03b).toBe(false);
  });

  it("M04: leaves removed, katydid moved out of the leaf habitat", () => {
    const s = woken();
    const leaf = find(s, /\[loose:leaf \(left\)\]/), kat = find(s, /\[loose:katydid/);
    putDown(leaf, center(leaf[0])[0] + 200, center(leaf[0])[2] - 200);
    let r = autoScore(s);
    expect([r.answers.m04a, r.answers.m04b, r.answers.m04c]).toEqual([1, true, true]);
    putDown(kat, center(kat[0])[0] + 250, center(kat[0])[2] - 250);
    r = autoScore(s);
    expect([r.answers.m04a, r.answers.m04b, r.answers.m04c]).toEqual([1, false, false]);
  });

  it("M08: the vine down on the mat", () => {
    const s = woken();
    const vine = find(s, /vine end/)[0];
    move(vine, [0, -lowest(vine), 0]);
    expect(autoScore(s).answers.m08).toBe(true);
  });

  it("M10: habitats moved or touched by the robot score nothing", () => {
    const s = woken();
    for (const b of find(s, /^spider( web)?:/)) move(b, [30, 0, 0]);
    find(s, /^snail/)[0].touches.push("robot");
    const r = autoScore(s);
    expect([r.answers.m10a, r.answers.m10b]).toEqual([false, false]);
    expect(r.notes.m10b).toMatch(/robot/);
  });

  it("M11: the root cover down on the mat", () => {
    const s = woken();
    const door = find(s, /^door:/).find((b) => !b.fixed)!;
    move(door, [0, -lowest(door), 0]);
    expect(autoScore(s).answers.m11).toBe(true);
  });

  it("M14: seeds in the replantation station, one on the mat", () => {
    const s = woken();
    const station = find(s, /^rod swing/)[0];
    const base = s.bodies.find((b) => b.model === station.model && b.fixed)!;
    const c = center(base);
    const seed1 = find(s, /\[loose:seed 1@/);
    putDown(seed1, c[0], c[2]);
    let r = autoScore(s);
    expect([r.answers.m14a, r.answers.m14b]).toEqual([1, 1]);
    // the M09 seed resting on the swinging rods, above the mat
    const seed9 = find(s, /\(seed\)/);
    putDown(seed9, c[0] + 5, c[2] + 5);
    for (const b of seed9) { move(b, [0, 30, 0]); b.touches = []; }
    r = autoScore(s);
    expect([r.answers.m14a, r.answers.m14b]).toEqual([2, 1]);
    expect(r.answers.m09c).toBe(true);
  });

  it("M15: the environmental bonus follows the dock the building is on", async () => {
    const sim = await fieldSim(fieldModels(["m15"], { city: "m15" }));
    const r = autoScore(sim.snapshot());
    expect(r.answers.m15d).toBe("City");
    expect(r.answers.m15a).toBe(false);
  });

  it("a seed really knocked off by a push", async () => {
    const sim = await fieldSim(fieldModels(["m02"], {}));
    sim.unfreezeModels();
    sim.stepMs(300);
    const seedId = sim.snapshot().bodies.find((b) => b.labels.some((l) => /\[loose:seed 1@/.test(l)))!.id;
    const body = sim.bodies.find((b) => b.id === seedId)!.body;
    for (let t = 0; t < 1500; t++) {
      if (t < 100) body.applyImpulse({ x: 0.004, y: 0.002, z: 0 }, true); // a 0.1 s shove
      sim.stepMs(1);
    }
    const r = autoScore(sim.snapshot());
    expect(r.answers.m02, r.notes.m02).toBe(1);
  }, 120000);
});
