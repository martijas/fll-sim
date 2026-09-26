// SPIKE Prime Driving Base 2 and its accessories (models/robot-db2.ts, models/tool-db2-*.ts):
// the published .ldr files match the scripts, the ports are right, each accessory connects to
// the robot at its mount for real, the arm is geared to motor E, and the robot drives straight.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assemble, attachTool, parseModel, type ModelPart } from "@fll-sim/assembly";
import { MOUNT_PART } from "@fll-sim/ldraw";
import { Simulation, SpikeApi, Status, type SeasonConfig } from "@fll-sim/sim";
import { build as buildRobot } from "../models/robot-db2";
import { build as buildArm } from "../models/tool-db2-arm";
import { build as buildForce } from "../models/tool-db2-force";
import { build as buildDistance } from "../models/tool-db2-distance";
import { loadLib } from "../src/lib";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();
const ldr = (rel: string) => readFileSync(join(repo, "apps/desktop/resources", rel), "latin1");
const TOOLS = { arm: buildArm, force: buildForce, distance: buildDistance };
const FILES = { robot: "robots/driving-base-2.ldr", arm: "tools/db2-arm.ldr", force: "tools/db2-force.ldr", distance: "tools/db2-distance.ldr" };
const robotParts = buildRobot(lib).parts;
const toolCache = new Map<string, ModelPart[]>();
const toolParts = (name: keyof typeof TOOLS) => toolCache.get(name) ?? toolCache.set(name, TOOLS[name](lib).parts).get(name)!;
// The ball caster's 19 mm ball (52629) has no connection data in LDraw: the assembler keeps it
// as a loose body resting in the caster's socket (it rolls there like the real one).
const BALL_LOOSE = 1;
const quiet = (w: string[]) => w.filter((x) => !/locked to its own housing/.test(x));

function withTool(name: keyof typeof TOOLS) {
  const r = attachTool(robotParts, toolParts(name), name)!;
  expect(r, `${name} shares a mount with the robot`).toBeTruthy();
  return r;
}

async function sim(parts: ModelPart[]) {
  const { robot, report, bodyOfPart } = assemble(lib, parts, { name: "Driving Base 2" });
  const s = await Simulation.create({ season, robot, start: { xMm: 1000, yMm: 400, headingDeg: 0 }, footprints: false });
  s.stepMs(500);
  return { s, api: new SpikeApi(s), robot, report, bodyOfPart };
}

describe("Driving Base 2", () => {
  it("published .ldr files match the scripts and use only parts from the app's part pack", () => {
    const catalog = JSON.parse(readFileSync(join(repo, "apps/desktop/resources/ldraw/catalog.json"), "utf8")) as { parts: { file: string }[] }[];
    const packed = new Set(catalog.flatMap((c) => c.parts.map((p) => p.file)));
    const check = (file: string, scripted: ModelPart[]) => {
      const text = ldr(file);
      const { parts, missing } = parseModel(lib, text);
      expect(missing).toEqual([]);
      // (mount points are parts too)
      const real = scripted;
      const key = (p: ModelPart) => `${p.file}@${[p.m[3], p.m[7], p.m[11]].map((v) => Math.round(v)).join(",")}`;
      expect(parts.map(key).sort()).toEqual(real.map(key).sort());
      expect(parts.map((p) => p.port ?? "").join("")).toBe(real.map((p) => p.port ?? "").join(""));
      expect(parts.filter((p) => p.file === MOUNT_PART).length).toBeGreaterThan(0);
      expect(parts.filter((p) => !packed.has(p.file) && p.file !== MOUNT_PART).map((p) => p.file)).toEqual([]);
    };
    check(FILES.robot, robotParts);
    for (const n of Object.keys(TOOLS) as (keyof typeof TOOLS)[]) check(FILES[n], toolParts(n));
  });

  it("has drive motors on C (left) and D (right), accessory motor on E, wheels on the outputs", () => {
    const { robot, report, bodyOfPart } = assemble(lib, robotParts, { name: "Driving Base 2" });
    expect(robot.motors.map((m) => m.port).sort()).toEqual(["C", "D", "E"]);
    expect(report.loose).toBe(BALL_LOOSE);
    expect(quiet(report.warnings).filter((w) => !/1 part group is not connected/.test(w))).toEqual([]);
    expect(report.mounts?.map((m) => m.name).sort()).toEqual(["db2-arm", "db2-distance", "db2-force"]);
    // LDraw +X is the robot's left: C drives the +X wheel, D the -X wheel
    const wheels = robotParts.map((p, i) => ({ p, i })).filter(({ p }) => p.file === "39367p01.dat");
    expect(wheels).toHaveLength(2);
    for (const { p, i } of wheels) {
      const port = p.m[3] > 0 ? "C" : "D";
      const motor = robot.motors.find((m) => m.port === port)!;
      expect(bodyOfPart[i], `wheel at x=${p.m[3]} turns with motor ${port}`).toBe(motor.output);
    }
  });

  it("drives 300 mm straight without tipping", async () => {
    const { s, api } = await sim(robotParts);
    const p0 = s.robotPose();
    api.pair(0, 2, 3); // C = left, D = right
    const id = api.pairMoveForDegrees(0, 614, 0, 400, 1, 1000, 1000); // 614° of a 56 mm wheel ≈ 300 mm
    let n = 0, tilt = 0;
    while (api.status(id) === Status.RUNNING && n < 10000) {
      s.tick();
      n++;
      const t = s.tiltAngles();
      tilt = Math.max(tilt, Math.abs(t[1]), Math.abs(t[2]));
    }
    s.stepMs(300);
    const p1 = s.robotPose();
    const d = Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm);
    const dh = Math.abs(((p1.headingDeg - p0.headingDeg + 540) % 360) - 180);
    expect(p1.yMm - p0.yMm).toBeGreaterThan(0); // forwards
    expect(Math.abs(d - 300)).toBeLessThan(15);
    expect(dh).toBeLessThan(3);
    expect(tilt / 10).toBeLessThan(5);
  });

  for (const name of Object.keys(TOOLS) as (keyof typeof TOOLS)[]) {
    it(`${name}: attaches at its mount and connects for real`, () => {
      const r = withTool(name);
      expect(r.mount).toBe(`db2-${name}`);
      // with the mount's rigid-hold fallback, and without it: nothing may come loose
      const held = assemble(lib, r.parts, { attached: [{ parts: (p) => (p.label ?? "").includes(`[tool:${name}]`), pointLdu: r.pointLdu }] });
      expect(held.report.warnings.filter((w) => /tool is not connected/.test(w))).toEqual([]);
      const real = assemble(lib, r.parts);
      expect(real.report.loose, "no tool part left loose without the fallback hold").toBe(BALL_LOOSE);
      const tool = r.parts.map((p, i) => i).filter((i) => (r.parts[i].label ?? "").includes("[tool:"));
      const hub = r.parts.findIndex((p) => p.file === "45601c01.dat");
      expect(tool.some((i) => real.bodyOfPart[i] === real.bodyOfPart[hub]), "part of the tool is rigid with the hub").toBe(true);
    });
  }

  it("force sensor on A, distance sensor on F", () => {
    const r1 = assemble(lib, withTool("force").parts);
    expect(r1.robot.sensors?.map((s) => `${s.port}:${s.type}`)).toEqual(["A:force"]);
    const r2 = assemble(lib, withTool("distance").parts);
    expect(r2.robot.sensors?.map((s) => `${s.port}:${s.type}`)).toEqual(["F:distance"]);
  });

  it("arm: motor E turns the arm through the 12T gears", async () => {
    const r = withTool("arm");
    const { s, api, robot, bodyOfPart } = await sim(r.parts);
    const e = robot.motors.find((m) => m.port === "E")!;
    const arm = r.parts.findIndex((p) => /double-bent liftarm/.test(p.label ?? ""));
    expect(robot.gears?.some((g) => [g.a, g.b].includes(e.output) && [g.a, g.b].includes(bodyOfPart[arm]))).toBe(true);
    const body = s.bodies.find((b) => b.id === bodyOfPart[arm])!.body;
    const q0 = body.rotation();
    const id = api.runForDegrees(4, 90, 300, 1, 1000, 1000);
    let n = 0;
    while (api.status(id) === Status.RUNNING && n < 5000) { s.tick(); n++; }
    s.stepMs(200);
    const q1 = body.rotation();
    const turned = (2 * Math.acos(Math.min(1, Math.abs(q0.w * q1.w + q0.x * q1.x + q0.y * q1.y + q0.z * q1.z))) * 180) / Math.PI;
    expect(turned).toBeGreaterThan(45);
  });
});
