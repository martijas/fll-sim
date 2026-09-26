// Driving Base 1 (scripted from the official building guide): the saved .ldr assembles into a
// robot with its drive motors on C/D and the accessory motor on E, and drives straight.
import { describe, expect, it } from "vitest";
import { assemble, findMounts, parseModel } from "@fll-sim/assembly";
import { Simulation, SpikeApi, Status, type SeasonConfig } from "@fll-sim/sim";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLib } from "../src/lib";
import { build } from "../models/robot-db1";

const repo = join(__dirname, "../../..");
const season = JSON.parse(readFileSync(join(repo, "seasons/2026-27/season.json"), "utf8")) as SeasonConfig;
const lib = loadLib();
const text = readFileSync(join(repo, "apps/desktop/resources/robots/driving-base-1.ldr"), "latin1");

describe("Driving Base 1", () => {
  const { parts, missing } = parseModel(lib, text);

  it("assembles with every part connected, the ports of the wiring page and its mount", () => {
    expect(missing).toEqual([]);
    const { robot, report } = assemble(lib, parts, { name: "Driving Base 1" });
    expect(report.loose).toBe(0);
    expect(robot.motors.map((m) => m.port).sort()).toEqual(["C", "D", "E"]);
    // drive motors turn about the robot's left-right axis, on opposite sides; the accessory
    // output is vertical
    const by = Object.fromEntries(robot.motors.map((m) => [m.port, m]));
    expect(Math.abs(by.C.axisOut.x)).toBeCloseTo(1, 3);
    expect(Math.abs(by.D.axisOut.x)).toBeCloseTo(1, 3);
    expect(Math.sign(by.C.anchorMm.x)).toBe(-Math.sign(by.D.anchorMm.x));
    expect(Math.abs(by.E.axisOut.y)).toBeCloseTo(1, 3);
    // the wheels are on the drive motors' outputs (the output bodies carry the wheels)
    for (const port of ["C", "D"]) {
      const out = robot.bodies.find((b) => b.id === by[port].output)!;
      expect(out.visuals?.some((v) => v.file === "39367p01.dat")).toBe(true);
    }
    // the mount point (parseModel doesn't return fllsim-mount.dat lines yet: check the script's
    // parts and that the saved file carries the mount line)
    const mounts = findMounts(build(lib).parts);
    expect(mounts.map((m) => m.name)).toEqual(["accessory"]);
    expect(text).toMatch(/0 \/\/ accessory\n1 16 20 -110 -100 1 0 0 0 1 0 0 0 1 fllsim-mount\.dat/);
    // stands on y = 0 (tyre bottoms)
    const wheels = parts.filter((p) => p.file === "39367p01.dat");
    for (const w of wheels) expect(w.m[7] + 70).toBeCloseTo(0, 1);
  });

  it("drives about 300 mm forward, straight and without tipping", async () => {
    const { robot } = assemble(lib, parts, { name: "Driving Base 1" });
    const sim = await Simulation.create({ season, robot, start: { xMm: 1000, yMm: 400, headingDeg: 0 }, footprints: false });
    sim.stepMs(500);
    const p0 = sim.robotPose();
    const [, pitch0, roll0] = sim.tiltAngles();
    const api = new SpikeApi(sim);
    api.pair(0, 2, 3); // C = left, D = right
    // 56 mm wheels: 300 mm = 614 degrees
    const id = api.pairMoveForDegrees(0, 614, 0, 400, 1, 1000, 1000);
    let n = 0, maxTilt = 0;
    while (api.status(id) === Status.RUNNING && n < 10000) {
      sim.tick();
      n++;
      const [, pitch, roll] = sim.tiltAngles();
      maxTilt = Math.max(maxTilt, Math.abs(pitch - pitch0), Math.abs(roll - roll0));
    }
    sim.stepMs(300);
    const p1 = sim.robotPose();
    const d = Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm);
    // forward = along the starting heading (0 = north, +y on the mat)
    const h = (p0.headingDeg * Math.PI) / 180;
    const along = -(p1.xMm - p0.xMm) * Math.sin(h) + (p1.yMm - p0.yMm) * Math.cos(h);
    console.log(`drove ${d.toFixed(1)} mm (${along.toFixed(1)} forward), heading change ${(p1.headingDeg - p0.headingDeg).toFixed(2)} deg, max tilt ${(maxTilt / 10).toFixed(1)} deg`);
    expect(Math.abs(d - 300)).toBeLessThan(20);
    expect(along).toBeGreaterThan(280);
    expect(Math.abs(p1.headingDeg - p0.headingDeg)).toBeLessThan(3);
    expect(maxTilt).toBeLessThan(50); // decidegrees: under 5 degrees of pitch/roll change
  }, 60000);
});
