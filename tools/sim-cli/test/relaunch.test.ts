// Between launches of a match the robot can be swapped (another tool on) where it stands, and the
// next program drives the new robot while the field stays as it was.
import { describe, expect, it } from "vitest";
import { Simulation, SpikeApi, makeDriveBase, type SeasonConfig } from "@fll-sim/sim";
import { runPython, settle } from "@fll-sim/runtime-python";
import { loadPythonFiles, micropythonWasmPath } from "@fll-sim/runtime-python/node";
import season from "../../../seasons/2026-27/season.json";

const files = loadPythonFiles();
const drive = (ports: string, deg: number) => `
from hub import port
import motor_pair, runloop
async def main():
    motor_pair.pair(motor_pair.PAIR_1, port.${ports[0]}, port.${ports[1]})
    await motor_pair.move_for_degrees(motor_pair.PAIR_1, ${deg}, 0, velocity=500)
runloop.run(main())
`;

describe("relaunch with another robot", () => {
  it("replaces the robot in place and keeps simulating", async () => {
    const sim = await Simulation.create({ season: season as SeasonConfig, robot: makeDriveBase({}), start: { xMm: 400, yMm: 250, headingDeg: 0 } });
    sim.stepMs(200);
    const api = new SpikeApi(sim);
    const bodies0 = sim.bodies.length;
    await runPython({ api, files, source: drive("AB", 360), wasmUrl: micropythonWasmPath(), timeLimitMs: sim.timeMs + 10000, hooks: {} });
    settle(api);
    const p1 = sim.robotPose();
    expect(p1.yMm - 250).toBeGreaterThan(150);
    // the team swaps to a robot driving on C/D, where it stands
    sim.replaceRobot(makeDriveBase({ leftPort: "C", rightPort: "D", colorPorts: [], distancePort: null, attachmentPorts: [] }), p1);
    sim.stepMs(200);
    expect(sim.bodies.length).toBeLessThanOrEqual(bodies0);
    expect(sim.motor("A")).toBeNull();
    const p2 = sim.robotPose();
    expect(Math.hypot(p2.xMm - p1.xMm, p2.yMm - p1.yMm)).toBeLessThan(5);
    const api2 = new SpikeApi(sim);
    const r = await runPython({ api: api2, files, source: drive("CD", 360), wasmUrl: micropythonWasmPath(), timeLimitMs: sim.timeMs + 10000, hooks: {} });
    settle(api2);
    expect(r.ok, r.error).toBe(true);
    expect(sim.robotPose().yMm - p2.yMm).toBeGreaterThan(150);
  }, 60000);
});
