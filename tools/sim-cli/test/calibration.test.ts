// The calibration kit's programs and analysis recover a simulated robot's own wheel size and track.
import { describe, expect, it } from "vitest";
import { Simulation, SpikeApi, makeDriveBase, type SeasonConfig } from "@fll-sim/sim";
import { runPython, settle } from "@fll-sim/runtime-python";
import { loadPythonFiles, micropythonWasmPath } from "@fll-sim/runtime-python/node";
import season from "../../../seasons/2026-27/season.json";
import { calibrationTests, metrics, parseCalLog } from "../../../apps/desktop/src/renderer/src/lib/calibration";
import { PRESETS, toDriveBaseOptions } from "../../../apps/desktop/src/renderer/src/lib/robotConfig";

const files = loadPythonFiles();
const cfg = { ...PRESETS[0], wheelDiameterMm: 62.4, trackWidthMm: 108 }; // an unusual robot

async function run(source: string) {
  const sim = await Simulation.create({ season: season as SeasonConfig, robot: makeDriveBase(toDriveBaseOptions(cfg)), start: { xMm: 400, yMm: 250, headingDeg: 0 }, footprints: false });
  sim.stepMs(200);
  const p0 = sim.robotPose();
  const api = new SpikeApi(sim);
  const out: string[] = [];
  await runPython({ api, files, source, wasmUrl: micropythonWasmPath(), timeLimitMs: sim.timeMs + 20000, hooks: { stdout: (l) => out.push(l) } });
  settle(api);
  const p1 = sim.robotPose();
  return { out, movedMm: Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm) };
}

describe("calibration kit", () => {
  it("measures the robot's effective wheel diameter and track width", async () => {
    const tests = calibrationTests(cfg);
    const drive = await run(tests.find((t) => t.id === "drive")!.python);
    const spin = await run(tests.find((t) => t.id === "spin")!.python);
    const m = metrics(parseCalLog([...drive.out, ...spin.out].join("\n")), drive.movedMm);
    expect(m.wheelMm!).toBeGreaterThan(cfg.wheelDiameterMm - 1.5);
    expect(m.wheelMm!).toBeLessThan(cfg.wheelDiameterMm + 1.5);
    expect(m.trackMm!).toBeGreaterThan(cfg.trackWidthMm - 4);
    expect(m.trackMm!).toBeLessThan(cfg.trackWidthMm + 4);
  }, 60000);
});
