import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLlsp3, type ScratchProject } from "@fll-sim/llsp3";
import { Simulation, SpikeApi, makeDriveBase, type SeasonConfig, type DriveBaseOptions } from "@fll-sim/sim";
import { runPython, settle } from "@fll-sim/runtime-python";
import { loadPythonFiles, micropythonWasmPath } from "@fll-sim/runtime-python/node";
import season from "../../../seasons/2026-27/season.json";
import { PNG } from "pngjs";
import { compileBlocks } from "../src";

const MAT = "resources/2026-27-bioglow/derived/mat-wireframe.png";
const matImage = existsSync(MAT) ? (() => { const p = PNG.sync.read(readFileSync(MAT)); return { width: p.width, height: p.height, data: p.data }; })() : null;

const START = { xMm: Number(process.env.GX ?? 300), yMm: Number(process.env.GY ?? 350), headingDeg: Number(process.env.GH ?? -90) };
const GUIDED = "resources/2026-27-bioglow/code/guided-mission-bioglow-11.llsp3";
const files = loadPythonFiles();

async function runBlocks(project: ScratchProject, robot: DriveBaseOptions, start = { xMm: 300, yMm: 200, headingDeg: 0 }, timeLimitMs = 60000) {
  const { python, warnings } = compileBlocks(project);
  const sim = await Simulation.create({ season: season as SeasonConfig, robot: makeDriveBase(robot), start, mat: matImage });
  sim.stepMs(200);
  const api = new SpikeApi(sim);
  const out: string[] = [];
  const t0 = sim.timeMs;
  const res = await runPython({ api, files, source: python, wasmUrl: micropythonWasmPath(), timeLimitMs: t0 + timeLimitMs, hooks: { stdout: (l) => out.push(l) } });
  if (!res.stopped) settle(api);
  return { python, warnings, sim, api, out, res, t0 };
}

// Build a tiny Scratch project from a list of statement blocks under "when program starts".
function project(stmts: Record<string, unknown>[], extraBlocks: Record<string, unknown> = {}, variables: Record<string, [string, unknown]> = {}): ScratchProject {
  const blocks: Record<string, unknown> = { hat: { opcode: "flipperevents_whenProgramStarts", next: stmts.length ? "s0" : null, parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 } };
  stmts.forEach((s, i) => (blocks[`s${i}`] = { next: i + 1 < stmts.length ? `s${i + 1}` : null, parent: i ? `s${i - 1}` : "hat", fields: {}, inputs: {}, shadow: false, topLevel: false, ...s }));
  Object.assign(blocks, extraBlocks);
  return { targets: [{ isStage: true, name: "Stage", variables, lists: {}, broadcasts: {}, blocks: {} }, { isStage: false, name: "s", variables: {}, lists: {}, broadcasts: {}, blocks: blocks as never }] };
}
const menu = (opcode: string, value: string) => ({ opcode, next: null, parent: null, inputs: {}, fields: { [`field_${opcode}`]: [value, null] }, shadow: true, topLevel: false });

describe("Word Blocks compiler + runtime", () => {
  it("move 20 cm forward uses the 17.6 cm/rotation default", async () => {
    const p = project(
      [
        { opcode: "flippermove_setMovementPair", inputs: { PAIR: [1, "pairMenu"] } },
        { opcode: "flippermove_move", inputs: { DIRECTION: [1, "dirMenu"], VALUE: [1, [4, "20"]] }, fields: { UNIT: ["cm", null] } },
      ],
      { pairMenu: menu("flippermove_movement-port-selector", "AB"), dirMenu: menu("flippermove_custom-icon-direction", "forward") },
    );
    const { sim, res, python } = await runBlocks(p, {});
    expect(res.ok, res.error + "\n" + python).toBe(true);
    // 20 cm at 17.6 cm per rotation = 409 deg; real wheel travel = 409/360 * 175.9 mm = 199.9 mm
    expect(Math.abs(sim.robotPose().yMm - 200 - 200)).toBeLessThan(6);
  });

  it("variables, repeat, if/else and operators follow Scratch semantics", async () => {
    const p = project(
      [
        { opcode: "data_setvariableto", inputs: { VALUE: [1, [10, "0"]] }, fields: { VARIABLE: ["n", "v1"] } },
        { opcode: "control_repeat", inputs: { TIMES: [1, [6, "5"]], SUBSTACK: [2, "inc"] } },
      ],
      {
        inc: { opcode: "data_changevariableby", next: null, parent: "s1", inputs: { VALUE: [1, [4, "1.5"]] }, fields: { VARIABLE: ["n", "v1"] }, shadow: false, topLevel: false },
      },
      { v1: ["n", 0] },
    );
    const { python } = compileBlocks(p);
    expect(python).toContain("for _ in range(int(rt.num(5))):");
    expect(python).toContain('rt.change_var(V, "n", 1.5)');
    const r = await runBlocks(p, {});
    expect(r.res.ok, r.res.error).toBe(true);
  });

  it.skipIf(!existsSync(GUIDED) || !matImage)("runs FIRST's BIOGLOW guided mission", async () => {
    const proj = readLlsp3(new Uint8Array(readFileSync(GUIDED)));
    if (proj.kind !== "word-blocks") throw new Error("expected word blocks");
    const { python, warnings, unsupported } = { ...compileBlocks(proj.project) };
    console.log(python);
    console.log("warnings:", warnings);
    expect(unsupported).toEqual([]);
    // Robot wired like the guided mission expects: drive C (left) + D (right), colour sensor B, arm motor E.
    const r = await runBlocks(proj.project, { leftPort: "C", rightPort: "D", colorPorts: [{ port: "B", xMm: 0, zMm: -88 }], distancePort: null, attachmentPorts: ["E"] }, START, 60000);
    console.log("result", r.res, "pose", r.sim.robotPose(), "out", r.out, "sim s", (r.sim.timeMs - r.t0) / 1000);
    expect(r.res.ok, r.res.error).toBe(true);
    expect(r.res.stopped).toBeFalsy(); // found the black line and finished every step
  });
});
