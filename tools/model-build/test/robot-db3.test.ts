// Driving Base 3 (models/robot-db3.ts): assembles with the guide's wiring, drives straight without
// tipping, and its colour sensor looks down at the mat.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, parseModel } from "@fll-sim/assembly";
import { Simulation, SpikeApi, Status, type MatImage, type SeasonConfig } from "@fll-sim/sim";
import { build } from "../models/robot-db3";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const baseSeason = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();
const LDR = join(repo, "apps/desktop/resources/robots/driving-base-3.ldr");
const PORT = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 } as const;

// A synthetic mat (the printed one isn't in the repo): white, with a black band across it at
// y = 520..580 mm (mat frame, y north).
const PX_PER_MM = 0.5;
const season = { ...baseSeason, mat: { ...baseSeason.mat, image: { ...baseSeason.mat.image, pxPerMm: PX_PER_MM } } } as SeasonConfig;
function testMat(): MatImage {
  const w = Math.ceil(season.mat.sizeMm.w * PX_PER_MM), h = Math.ceil(season.mat.sizeMm.h * PX_PER_MM);
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let row = 0; row < h; row++) {
    const yMm = season.mat.sizeMm.h - row / PX_PER_MM; // row 0 = north edge
    if (yMm < 520 || yMm > 580) continue;
    for (let col = 0; col < w; col++) data.fill(20, (row * w + col) * 4, (row * w + col) * 4 + 3);
  }
  return { width: w, height: h, data };
}

describe("Driving Base 3", () => {
  const b = build(lib);

  it("assembles with the guide's wiring: C/D drive, E accessory motor, B colour sensor", () => {
    const { robot, report } = assemble(lib, b.parts, { name: "Driving Base 3" });
    expect(robot.motors.map((m) => m.port).sort()).toEqual(["C", "D", "E"]);
    expect(robot.sensors.map((s) => `${s.port}:${s.type}`)).toEqual(["B:color"]);
    // the colour sensor looks straight down (robot frame: +Y up)
    expect(robot.sensors[0].dir.y).toBeLessThan(-0.99);
    // drive motors turn about the robot's X axis (wheel axles), the accessory motor about Y
    const axis = (p: string) => robot.motors.find((m) => m.port === p)!.axisOut;
    for (const p of ["C", "D"]) expect(Math.abs(axis(p).x)).toBeGreaterThan(0.99);
    expect(Math.abs(axis("E").y)).toBeGreaterThan(0.99);
    // every drive motor turns a wheel: the output bodies are distinct from the chassis
    for (const m of robot.motors) expect(m.output).not.toBe(m.housing);
    // only the castor ball rides free (in its socket)
    expect(report.loose).toBeLessThanOrEqual(1);
    expect(report.mounts?.map((m) => m.name)).toEqual(["accessory"]);
    // it stands on y = 0 (wheels and castor ball)
    const bb = b.bounds();
    expect(bb.max[1]).toBeGreaterThan(-1);
    expect(bb.max[1]).toBeLessThan(1);
  });

  it("the published .ldr has the same parts and ports", () => {
    expect(existsSync(LDR)).toBe(true);
    const text = readFileSync(LDR, "latin1");
    const parts = parseModel(lib, text).parts;
    // (parseModel leaves the built-in mount point out: Library.isPart only knows files in parts/)
    expect(parts.filter((p) => p.file !== "fllsim-mount.dat").length).toBe(b.parts.length - 1);
    expect(text).toMatch(/0 \/\/ accessory\r?\n1 16 60 -130 -190 1 0 0 0 1 0 0 0 1 fllsim-mount\.dat/);
    expect(parts.filter((p) => p.port).map((p) => p.port).sort()).toEqual(["B", "C", "D", "E"]);
    // every part is in the app's bundled part pack (mount points are built in)
    const catalog = JSON.parse(readFileSync(join(repo, "apps/desktop/resources/ldraw/catalog.json"), "utf8")) as { parts: { file: string }[] }[];
    const packed = new Set(catalog.flatMap((c) => c.parts.map((p) => p.file)));
    expect(parts.filter((p) => !packed.has(p.file) && p.file !== "fllsim-mount.dat").map((p) => p.file)).toEqual([]);
  });

  it("drives 300 mm straight without tipping, and the colour sensor reads the mat", async () => {
    const { robot } = assemble(lib, b.parts, { name: "Driving Base 3" });
    const sim = await Simulation.create({ season, robot, mat: testMat(), start: { xMm: 1000, yMm: 250, headingDeg: 0 }, footprints: false });
    sim.stepMs(500);
    const api = new SpikeApi(sim);
    const p0 = sim.robotPose();
    const white = api.colorSensorReflection(PORT.B);
    const rest = sim.tiltAngles().map((v) => v / 10);
    api.pair(0, PORT.C, PORT.D);
    // 300 mm on 56 mm wheels
    const deg = Math.round((300 / (56 * Math.PI)) * 360);
    const id = api.pairMoveForDegrees(0, deg, 0, 360, 1, 1000, 1000);
    let n = 0, minRefl = 100, maxTilt = 0;
    while (api.status(id) === Status.RUNNING && n < 10000) {
      sim.tick();
      n++;
      minRefl = Math.min(minRefl, api.colorSensorReflection(PORT.B));
      const [, pitch, roll] = sim.tiltAngles();
      maxTilt = Math.max(maxTilt, Math.abs(pitch) / 10, Math.abs(roll) / 10);
    }
    sim.stepMs(300);
    const p1 = sim.robotPose();
    const d = Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm);
    console.log(`drove ${d.toFixed(1)} mm in ${n} ms, heading ${(p1.headingDeg - p0.headingDeg).toFixed(2)} deg, x drift ${(p1.xMm - p0.xMm).toFixed(1)} mm, max tilt ${maxTilt.toFixed(1)} deg, reflection white ${white} / band ${minRefl}, tilt at rest ${rest}`);
    expect(n).toBeLessThan(10000);
    expect(Math.abs(d - 300)).toBeLessThan(20);
    expect(p1.yMm - p0.yMm).toBeGreaterThan(280); // forward = north
    expect(Math.abs(p1.headingDeg - p0.headingDeg)).toBeLessThan(3);
    expect(Math.abs(p1.xMm - p0.xMm)).toBeLessThan(15);
    expect(maxTilt).toBeLessThan(5);
    // the colour sensor sees the white mat, and the black band as the robot drives over it
    expect(white).toBeGreaterThan(80);
    expect(minRefl).toBeLessThan(25);

    // the accessory motor turns its gear freely
    const e0 = api.motorRelativePosition(PORT.E);
    const eid = api.runForDegrees(PORT.E, 360, 500, 1, 1000, 1000);
    for (let k = 0; api.status(eid) === Status.RUNNING && k < 5000; k++) sim.tick();
    expect(Math.abs(api.motorRelativePosition(PORT.E) - e0 - 360)).toBeLessThan(15);
  }, 60000);
});
