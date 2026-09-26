// The Advanced Driving Base and its two modular tools (dozer blade, lift arm), as bundled with
// the app: the robot's ports, the tools going on at their mounts with real connections, and the
// robot driving straight (with and without each tool).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assemble, attachTool, parseModel, type ModelPart } from "@fll-sim/assembly";
import { Simulation, SpikeApi, type SeasonConfig } from "@fll-sim/sim";
import { runPython, settle } from "../../../packages/runtime-python/src/index";
import { loadPythonFiles, micropythonWasmPath } from "../../../packages/runtime-python/src/node";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();
/**
 * Parse a bundled .ldr. parseModel (via Library.isPart) doesn't collect the built-in mount part
 * (fllsim-mount.dat is not in the part library's files), so its lines are read back here too.
 */
function load(path: string): ModelPart[] {
  const text = readFileSync(join(repo, path), "latin1");
  const parts = parseModel(lib, text).parts;
  if (!parts.some((p) => /fllsim-mount\.dat$/i.test(p.file))) {
    let label: string | undefined;
    for (const line of text.split(/\r?\n/)) {
      const l = line.match(/^\s*0\s+\/\/\s*(.+?)\s*$/);
      if (l) { label = l[1]; continue; }
      const t = line.trim().split(/\s+/);
      if (t[0] === "1" && /^fllsim-mount\.dat$/i.test(t[14] ?? "")) {
        const n = t.slice(2, 14).map(Number);
        parts.push({ file: "fllsim-mount.dat", color: 16, label, m: new Float64Array([n[3], n[4], n[5], n[0], n[6], n[7], n[8], n[1], n[9], n[10], n[11], n[2]]) });
      }
      if (t[0] === "1") label = undefined;
    }
  }
  return parts;
}
const robotParts = load("apps/desktop/resources/robots/advanced-driving-base.ldr");
const tools: Record<string, ModelPart[]> = {
  "dozer-blade": load("apps/desktop/resources/tools/dozer-blade.ldr"),
  "lift-arm": load("apps/desktop/resources/tools/lift-arm.ldr"),
};
const isTool = (p: ModelPart) => /\[tool:/.test(p.label ?? "");

/** Robot with a tool put on at its mount, as the app does it. */
function withTool(name: string) {
  const t = attachTool(robotParts, tools[name], name);
  expect(t, `${name} shares a mount with the robot`).toBeTruthy();
  return t!;
}

/** Drive about 300 mm straight ahead (a SPIKE Python program on the simulated hub). */
async function drive(parts: ModelPart[], attached?: { parts: (p: ModelPart) => boolean; pointLdu: [number, number, number] }[]) {
  const { robot } = assemble(lib, parts, { name: "ADB", breakable: true, attached });
  const sim = await Simulation.create({ season, robot, start: { xMm: 1000, yMm: 500, headingDeg: 0 }, footprints: false });
  sim.stepMs(500);
  const p0 = sim.robotPose();
  const api = new SpikeApi(sim);
  // 88 mm wheels: 300 mm = 390 degrees
  const source = `from hub import port
import motor_pair, runloop
async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.A, port.E)
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, 390, 0, velocity=400)
runloop.run(main())
`;
  await runPython({ api, files: loadPythonFiles(), source, wasmUrl: micropythonWasmPath(), timeLimitMs: sim.timeMs + 20000, hooks: { stdout: () => {} } });
  settle(api);
  sim.stepMs(300);
  const p1 = sim.robotPose();
  const [, pitch, roll] = sim.tiltAngles().map((v) => v / 10);
  return { movedMm: Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm), turnedDeg: Math.abs(p1.headingDeg - p0.headingDeg), pitch, roll };
}

describe("Advanced Driving Base", () => {
  it("has its motors and sensors on the guide's ports", () => {
    const { robot, report } = assemble(lib, robotParts, { name: "ADB" });
    // wiring page of the building guide: A and E drive (large motors), C and D turn the tool
    // gears (medium motors), B and F are the colour sensors
    expect(robot.motors.map((m) => m.port).sort()).toEqual(["A", "C", "D", "E"]);
    expect(robot.sensors.map((s) => `${s.port}:${s.type}`).sort()).toEqual(["B:color", "F:color"]);
    expect(report.loose).toBe(0);
    expect(report.mounts?.map((m) => m.name).sort()).toEqual(["front", "rear"]);
    // the wheels turn on the drive motors' outputs
    for (const port of ["A", "E"]) {
      const m = robot.motors.find((x) => x.port === port)!;
      const out = robot.bodies.find((b) => b.id === m.output)!;
      expect(out.visuals?.some((v) => v.file === "49295p01.dat"), `wheel on motor ${port}`).toBe(true);
    }
  });

  for (const [name, motor] of [["dozer-blade", "C"], ["lift-arm", "D"]] as const)
    it(`takes the ${name} at its mount, connected for real and geared to motor ${motor}`, () => {
      const t = withTool(name);
      // with the app's fallback hold: no warning that it isn't connected
      const held = assemble(lib, t.parts, { name: "ADB", attached: [{ parts: isTool, pointLdu: t.pointLdu }] });
      expect(held.report.warnings.filter((w) => /not connected/.test(w))).toEqual([]);
      // without it: the tool's own parts still reach the hub (its pins sit in the robot's holes)
      const { robot, report, bodyOfPart } = assemble(lib, t.parts, { name: "ADB" });
      expect(report.loose).toBe(0);
      const toolBodies = new Set(t.parts.map((p, i) => (isTool(p) ? bodyOfPart[i] : null)).filter((b): b is string => !!b));
      const robotBodies = new Set(t.parts.map((p, i) => (isTool(p) ? null : bodyOfPart[i])).filter((b): b is string => !!b));
      const joined = [...robot.freeJoints, ...(robot.welds ?? [])].some((j) => (toolBodies.has(j.a) && robotBodies.has(j.b)) || (toolBodies.has(j.b) && robotBodies.has(j.a)));
      expect(joined || [...toolBodies].some((b) => robotBodies.has(b)), "tool attached to the robot's bodies").toBe(true);
      // the tool's 36-tooth gear meshes with the motor's 28-tooth gear
      const out = robot.motors.find((m) => m.port === motor)!.output;
      expect(robot.gears?.some((g) => (g.a === out || g.b === out) && /28:36|36:28/.test(g.label ?? "")), `gear on motor ${motor}`).toBe(true);
    });

  for (const name of [undefined, "dozer-blade", "lift-arm"])
    it(`drives about 300 mm straight without tipping${name ? ` with the ${name}` : ""}`, async () => {
      const t = name ? withTool(name) : null;
      const r = await drive(t ? t.parts : robotParts, t ? [{ parts: isTool, pointLdu: t.pointLdu }] : undefined);
      console.log(name ?? "bare", r);
      expect(r.movedMm).toBeGreaterThan(280);
      expect(r.movedMm).toBeLessThan(320);
      expect(r.turnedDeg).toBeLessThan(3);
      expect(Math.abs(r.pitch)).toBeLessThan(10);
      expect(Math.abs(r.roll)).toBeLessThan(10);
    }, 60000);
});
