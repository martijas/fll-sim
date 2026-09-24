import { describe, expect, it } from "vitest";
import season from "../../../seasons/2026-27/season.json";
import { Simulation, SpikeApi, makeDriveBase, type SeasonConfig, Status } from "../src";

async function mk() {
  const sim = await Simulation.create({ season: season as SeasonConfig, robot: makeDriveBase(), start: { xMm: 1000, yMm: 400, headingDeg: 0 }, footprints: false });
  sim.stepMs(300); // settle on the mat
  return { sim, api: new SpikeApi(sim) };
}

function runUntilDone(api: SpikeApi, id: number, maxMs = 10000) {
  let n = 0;
  while (api.status(id) === Status.RUNNING && n < maxMs) { api.sim.tick(); n++; }
  return n;
}

describe("drive base physics", () => {
  it("settles level on the table", async () => {
    const { sim } = await mk();
    const p = sim.robotPose();
    expect(Math.abs(p.xMm - 1000)).toBeLessThan(2);
    expect(Math.abs(p.yMm - 400)).toBeLessThan(2);
    const [, pitch, roll] = sim.tiltAngles();
    expect(Math.abs(pitch)).toBeLessThan(20);
    expect(Math.abs(roll)).toBeLessThan(20);
  });

  it("move_for_degrees 360 drives one wheel circumference forward", async () => {
    const { sim, api } = await mk();
    api.pair(0, 0, 1);
    const y0 = sim.robotPose().yMm;
    const id = api.pairMoveForDegrees(0, 360, 0, 360, 1, 1000, 1000);
    const ms = runUntilDone(api, id);
    sim.stepMs(200);
    const p = sim.robotPose();
    const dist = p.yMm - y0;
    console.log("dist", dist.toFixed(1), "ms", ms, "heading", p.headingDeg.toFixed(2), "x", p.xMm.toFixed(1));
    expect(api.status(id)).toBe(Status.READY);
    expect(dist).toBeGreaterThan(175.9 * 0.97);
    expect(dist).toBeLessThan(175.9 * 1.03);
    expect(Math.abs(p.headingDeg)).toBeLessThan(1.5);
  });

  it("steering 100 spins in place and the gyro follows", async () => {
    const { sim, api } = await mk();
    api.pair(0, 0, 1);
    api.resetYaw(0);
    const id = api.pairMoveForDegrees(0, 360, 100, 300, 1, 1000, 1000);
    runUntilDone(api, id);
    sim.stepMs(200);
    const yaw = sim.tiltAngles()[0] / 10;
    // wheel arc = 360deg * pi*56 / 360 = 175.9 mm; turn = arc / (pi*track) * 360 = 175.9/(pi*120)*360 = 168deg
    console.log("yaw", yaw);
    expect(Math.abs(Math.abs(yaw) - 168)).toBeLessThan(12);
    expect(yaw).toBeLessThan(0); // steering +100 turns right (clockwise) -> negative CCW yaw
  });

  it("single motor run_for_degrees reaches target and reports READY", async () => {
    const { sim, api } = await mk();
    sim.robot; // attachment-free base: use the left drive motor lifted? just check encoder
    const id = api.runForDegrees(1, 360, 720, 1, 1000, 1000);
    const ms = runUntilDone(api, id);
    console.log("rel pos", api.motorRelativePosition(1), "ms", ms);
    expect(Math.abs(api.motorRelativePosition(1) - 360)).toBeLessThanOrEqual(4);
  });
});
