// M10's spider habitat next to the farm dock (whatever model is on it), and the team's M13
// keystone species: a loose piece that starts in the launch area and is judged on the platform.
import { describe, expect, it } from "vitest";
import type { FieldSnapshot } from "@fll-sim/sim";
import { autoScore } from "../../../seasons/2026-27/autoscore";
import { KEYSTONE_ID, keystoneModel } from "../../../apps/desktop/src/renderer/src/lib/keystone";
import { fieldModels, fieldSim } from "../src/field";
import { loadLib } from "../src/lib";

const top = (s: FieldSnapshot, id: string) => s.bodies.find((b) => b.id === id)!;
/** Moved more than a few mm or degrees from where it was set up. */
function moved(b: FieldSnapshot["bodies"][number]) {
  const d = Math.hypot(b.pose.p[0] - b.start.p[0], b.pose.p[1] - b.start.p[1], b.pose.p[2] - b.start.p[2]);
  const dot = Math.abs(b.pose.q.reduce((s, v, i) => s + v * b.start.q[i], 0));
  return d > 8 || (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI > 15;
}

describe("M10 spider habitat beside the farm dock", () => {
  for (const farm of ["m13", "m14", "m15"])
    it(`doesn't touch ${farm} on the farm dock and stays standing`, async () => {
      const sim = await fieldSim(fieldModels(["m10b", farm], { farm }));
      sim.unfreezeModels();
      sim.stepMs(20);
      const s0 = sim.snapshot();
      const spider = s0.bodies.filter((b) => b.model === "m10b");
      expect(spider.flatMap((b) => b.touches).filter((t) => t.startsWith("dock-"))).toEqual([]);
      sim.stepMs(1000);
      const s1 = sim.snapshot();
      expect(s1.bodies.filter((b) => b.model === "m10b" && b.parts >= 3 && moved(b)).map((b) => b.id)).toEqual([]);
    }, 120000);
});

// a 2x4 brick with a 2x4 plate on top
const SPECIES = ["0 Keystone species", "1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat", "1 2 0 -8 0 1 0 0 0 1 0 0 0 1 3020.dat"].join("\n");

describe("M13 keystone species", () => {
  it("is a loose piece in the launch area, then judged on the restoration platform", async () => {
    const lib = loadLib();
    const species = keystoneModel(lib, SPECIES);
    expect(species.fixedBodies).toEqual([]);
    expect(species.model.bodies).toHaveLength(1); // one solid object
    const sim = await fieldSim([...fieldModels(["m13"], { farm: "m13" }), species]);
    let r = autoScore(sim.snapshot());
    expect(r.answers.m13).toBe(false);
    expect(r.notes.m13).toMatch(/isn't on the restoration platform/);

    // the robot delivers it: drop it onto the platform (the insert panel) from just above
    sim.unfreezeModels();
    sim.stepMs(300);
    const s = sim.snapshot();
    const deck = s.bodies.find((b) => b.model === "dock-farm" && b.labels.some((l) => /^insert 5x11 panel/.test(l)))!;
    const deckWorld = deck.pts.map((p) => {
      const [x, y, z, w] = deck.pose.q;
      const t = [2 * (y * p[2] - z * p[1]), 2 * (z * p[0] - x * p[2]), 2 * (x * p[1] - y * p[0])];
      return [p[0] + w * t[0] + (y * t[2] - z * t[1]) + deck.pose.p[0], p[1] + w * t[1] + (z * t[0] - x * t[2]) + deck.pose.p[1], p[2] + w * t[2] + (x * t[1] - y * t[0]) + deck.pose.p[2]];
    });
    const c = [0, 1, 2].map((k) => deckWorld.reduce((a, p) => a + p[k], 0) / deckWorld.length);
    const deckTop = Math.max(...deckWorld.map((p) => p[1]));
    const body = sim.bodies.find((b) => b.id === `${KEYSTONE_ID}:body0`)!.body;
    body.setTranslation({ x: c[0] / 1000, y: (deckTop + 25) / 1000, z: c[2] / 1000 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    sim.stepMs(1500);
    const after = sim.snapshot();
    const k = top(after, `${KEYSTONE_ID}:body0`);
    expect(k.touches.some((t) => t.startsWith("dock-farm:"))).toBe(true);
    r = autoScore(after);
    expect(r.answers.m13).toBeUndefined(); // the trees are for the team to check
    expect(r.notes.m13).toMatch(/on the restoration platform/);
  }, 180000);
});
