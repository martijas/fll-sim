// Builds a SPIKE Prime drive base from real LDraw parts using autoFit, saves it as the default
// "real parts" robot, and checks it drives like the physics says it should.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDENTITY, Library, mul, type Mat4 } from "@fll-sim/ldraw";
import { dirSource, findLDrawDir, findShadowDir } from "@fll-sim/ldraw/node";
import { Simulation, SpikeApi, Status, type SeasonConfig } from "@fll-sim/sim";
import season from "../../../seasons/2026-27/season.json";
import { assemble, autoFit, parseModel, partSnaps, serializeModel, type ModelPart } from "../src";

const dir = findLDrawDir();
const lib = dir ? new Library(dirSource(dir), findShadowDir() ? dirSource(findShadowDir()!) : undefined) : null;
const OUT = "apps/desktop/resources/robots/spike-drivebase.ldr";

const pos = (m: Mat4) => [m[3], m[7], m[11]];
const worldSnaps = (p: ModelPart, pred: (secs: string, g: string) => boolean = () => true) => partSnaps(lib!, p.file).filter((s) => pred(s.secs, s.gender)).map((s) => mul(p.m, s.m) as Mat4);
const axisOf = (m: Mat4) => {
  const l = Math.hypot(m[1], m[5], m[9]);
  return [m[1] / l, m[5] / l, m[9] / l];
};

function buildSide(parts: ModelPart[], side: 1 | -1, port: "A" | "B") {
  const hub = parts[0];
  const holes = worldSnaps(hub, (secs, g) => g === "F" && secs.startsWith("R")).filter((m) => Math.abs(m[3] - side * 61) < 1.5);
  // Try every pair of side holes for two friction pins, then fit the motor on both pins.
  let best: { pins: ModelPart[]; motor: Mat4; conn: number; overlap: number; y: number } | null = null;
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++) {
      const trial = [...parts];
      const pins: ModelPart[] = [];
      for (const h of [holes[i], holes[j]]) {
        const fit = autoFit(lib!, trial, "61332.dat", [h], (m) => (m[3] - side * 61) * side > 5);
        if (!fit || fit.connections < 1) break;
        const pin = { file: "61332.dat", color: 0, m: fit.m };
        pins.push(pin);
        trial.push(pin);
      }
      if (pins.length < 2) continue;
      const targets = pins.flatMap((p) => worldSnaps(p, (_, g) => g === "M"));
      const motorFit = autoFit(lib!, trial, "54696p01.dat", targets, (m) => -m[1] * side > 0.99);
      if (!motorFit || motorFit.connections < 2) continue;
      const y = motorFit.m[7] - 50 * -motorFit.m[5]; // output centre height (LDraw y, down +)
      const score = motorFit.connections * 10 - motorFit.overlap;
      if (!best || score > best.conn * 10 - best.overlap + 1e-6) best = { pins, motor: motorFit.m, conn: motorFit.connections, overlap: motorFit.overlap, y };
    }
  expect(best, "motor placement").toBeTruthy();
  console.log("motor", side, "connections", best!.conn, "overlap", best!.overlap.toFixed(2), pos(best!.motor));
  parts.push(...best!.pins);
  const motor: ModelPart = { file: "54696p01.dat", color: 71, m: best!.motor, port };
  parts.push(motor);
  // Axle 3 in the motor output, sticking out; then the wheel on the protruding end.
  const face = [motor.m[3] - 50 * motor.m[1], motor.m[7] - 50 * motor.m[5], motor.m[11] - 50 * motor.m[9]];
  const dir = [-motor.m[1], -motor.m[5], -motor.m[9]];
  const beyond = (m: Mat4) => (m[3] - face[0]) * dir[0] + (m[7] - face[1]) * dir[1] + (m[11] - face[2]) * dir[2];
  const outHoles = worldSnaps(motor, (secs) => secs.startsWith("A"));
  const axleFit = autoFit(lib!, parts, "4519.dat", outHoles, (m) => beyond(m) > 5 && beyond(m) < 25, [-40, -30, -20, -10, 0, 10, 20, 30, 40])!;
  expect(axleFit.connections).toBeGreaterThanOrEqual(1);
  parts.push({ file: "4519.dat", color: 71, m: axleFit.m });
  const axleSnaps = worldSnaps(parts[parts.length - 1], (secs) => secs.startsWith("A"));
  // Only the wheel's central axle hole may take the axle; wheel just outside the motor face.
  const wheelFit = autoFit(lib!, parts, "39367p01.dat", axleSnaps, (m) => beyond(m) > 10 && beyond(m) < 40, [-40, -30, -20, -10, 0, 10, 20, 30, 40], (s) => s.secs.startsWith("A"))!;
  console.log("wheel", side, "connections", wheelFit.connections, "overlap", wheelFit.overlap.toFixed(2), pos(wheelFit.m));
  expect(wheelFit.connections).toBeGreaterThanOrEqual(1);
  parts.push({ file: "39367p01.dat", color: 0, m: wheelFit.m });
}

function build(parts: ModelPart[]) {
  // LDraw +X is the robot's left (the LDraw -> robot mapping mirrors X and Y).
  buildSide(parts, 1, "A");
  buildSide(parts, -1, "B");
  // Towball skids in two bottom holes at one end, so the robot rests on wheels + skids.
  for (const z of [-100, 100]) {
    const hole = worldSnaps(parts[0], (secs, g) => g === "F" && secs.startsWith("R")).filter((m) => Math.abs(m[7] + 9) < 1.5 && Math.abs(m[11] - z) < 1 && Math.abs(Math.abs(m[3]) - 20) < 1);
    if (!hole.length) continue;
    const fit = autoFit(lib!, parts, "66906.dat", [hole[0]], (m) => m[7] > 0);
    if (fit && fit.connections >= 1) parts.push({ file: "66906.dat", color: 0, m: fit.m });
  }
  writeFileSync(OUT, serializeModel(parts, "spike-drivebase.ldr"));
}

describe.skipIf(!lib)("real-parts SPIKE drive base", () => {
  // The auto-fit search takes ~40 s: it only runs when the model is missing or FLLSIM_REGEN=1.
  it("builds, assembles and drives accurately", async () => {
    let parts: ModelPart[] = [{ file: "45601c01.dat", color: 14, m: IDENTITY }];
    if (existsSync(OUT) && !process.env.FLLSIM_REGEN) parts = parseModel(lib!, readFileSync(OUT, "latin1")).parts;
    else build(parts);
    // Every part must exist in the app's bundled part pack.
    const catalog = JSON.parse(readFileSync("apps/desktop/resources/ldraw/catalog.json", "utf8")) as { parts: { file: string }[] }[];
    const packed = new Set(catalog.flatMap((c) => c.parts.map((p) => p.file)));
    expect(parts.filter((p) => !packed.has(p.file)).map((p) => p.file)).toEqual([]);

    const { robot, report } = assemble(lib!, parts, { name: "SPIKE drive base (real parts)" });
    console.log("report", report);
    console.log("bodies", robot.bodies.map((b) => `${b.id} ${(b.massKg * 1000).toFixed(0)}g ${b.shapes.length}sh [${b.visuals?.map((v) => v.file).join(",")}]`));
    console.log("motors", robot.motors.map((m) => `${m.port} axis ${JSON.stringify(m.axisOut)} at ${JSON.stringify(m.anchorMm)}`));
    expect(robot.motors.map((m) => m.port).sort()).toEqual(["A", "B"]);
    expect(report.loose).toBe(0);

    // Physics: drive two wheel rotations straight.
    const sim = await Simulation.create({ season: season as SeasonConfig, robot, start: { xMm: 1000, yMm: 400, headingDeg: 0 }, footprints: false });
    sim.stepMs(500);
    const p0 = sim.robotPose();
    const api = new SpikeApi(sim);
    api.pair(0, 0, 1);
    const id = api.pairMoveForDegrees(0, 720, 0, 400, 1, 1000, 1000);
    let n = 0;
    while (api.status(id) === Status.RUNNING && n < 10000) { sim.tick(); n++; }
    sim.stepMs(300);
    const p1 = sim.robotPose();
    const d = Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm);
    console.log("drove", d.toFixed(1), "mm in", n, "ms; heading change", (p1.headingDeg - p0.headingDeg).toFixed(2));
    // 2 rotations of a 56 mm wheel = 351.9 mm
    expect(Math.abs(d - 351.9)).toBeLessThan(18);
    expect(Math.abs(p1.headingDeg - p0.headingDeg)).toBeLessThan(3);
  });
});
