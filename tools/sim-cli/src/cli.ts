#!/usr/bin/env -S npx tsx
// Headless runner: execute a SPIKE Python program (.py or .llsp3) on the simulated field.
//   pnpm sim run program.llsp3 --start 230,180,0 --trace trace.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PNG } from "pngjs";
import { readLlsp3 } from "@fll-sim/llsp3";
import { compileBlocks } from "@fll-sim/runtime-blocks";
import { Simulation, SpikeApi, makeDriveBase, type MatImage, type Port, type SeasonConfig } from "@fll-sim/sim";
import { runPython, settle } from "@fll-sim/runtime-python";
import { loadPythonFiles, micropythonWasmPath } from "@fll-sim/runtime-python/node";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    season: { type: "string", default: "2026-27" },
    start: { type: "string", default: "230,180,0" },
    mat: { type: "string" },
    trace: { type: "string" },
    "time-limit": { type: "string", default: "150" },
    drive: { type: "string", default: "A,B" },
    color: { type: "string", default: "C,D" },
    distance: { type: "string", default: "E" },
    motors: { type: "string", default: "F" },
    "show-python": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const [cmd, fileArg] = positionals;
// `pnpm sim` runs from this package's directory; resolve paths against where the user ran it.
const userPath = (p: string) => resolve(process.env.INIT_CWD ?? process.cwd(), p);
const file = fileArg ? userPath(fileArg) : fileArg;
if (values.help || cmd !== "run" || !file) {
  console.log(`usage: sim-cli run <program.py|program.llsp3> [options]
  --start x,y,heading   start pose in mat mm / degrees (default 230,180,0 = left launch area)
  --season id           season pack (default 2026-27)
  --mat image.png       mat texture for the colour sensor (to scale, 2 px/mm)
  --trace out.json      write the robot pose every 10 ms
  --time-limit s        stop after this much simulated time (default 150 = one match)
  --drive L,R           drive motor ports (default A,B)
  --color P,..          downward colour sensor ports (default C,D; "none")
  --distance P          forward distance sensor port (default E; "none")
  --motors P,..         attachment motor ports (default F; "none")
  --show-python         print the Python a Word Blocks project compiles to`);
  process.exit(cmd === "run" && !file ? 2 : 0);
}

const season = JSON.parse(readFileSync(join(repo, "seasons", values.season!, "season.json"), "utf8")) as SeasonConfig;
let source: string;
if (file.endsWith(".llsp3")) {
  const p = readLlsp3(new Uint8Array(readFileSync(file)));
  if (p.kind === "word-blocks") {
    const c = compileBlocks(p.project);
    for (const w of c.warnings) console.error(`warning: ${w}`);
    source = c.python;
    if (values["show-python"]) console.error(source);
  } else source = p.source;
} else source = readFileSync(file, "utf8");

let mat: MatImage | null = null;
const matPath = values.mat ? userPath(values.mat) : (season.mat.image?.default ? join(repo, season.mat.image.default) : undefined);
try {
  if (matPath) {
    const png = PNG.sync.read(readFileSync(matPath));
    mat = { width: png.width, height: png.height, data: png.data };
  }
} catch {
  console.error(`(no mat image at ${matPath}; colour sensor sees a plain white mat)`);
}

const [x, y, h] = values.start!.split(",").map(Number);
const list = (s: string | undefined) => (!s || s === "none" ? [] : (s.split(",").map((v) => v.trim().toUpperCase()) as Port[]));
const [left, right] = list(values.drive);
const colors = list(values.color);
const robot = makeDriveBase({
  leftPort: left,
  rightPort: right,
  colorPorts: colors.map((port, i) => ({ port, xMm: (i - (colors.length - 1) / 2) * 48, zMm: -88 })),
  distancePort: list(values.distance)[0] ?? null,
  attachmentPorts: list(values.motors),
});
const sim = await Simulation.create({ season, robot, start: { xMm: x, yMm: y, headingDeg: h }, mat });
sim.stepMs(250);
const t0 = sim.timeMs;
const api = new SpikeApi(sim);
const trace: { t: number; x: number; y: number; heading: number }[] = [];
const onTick = () => {
  if (values.trace && sim.timeMs % 10 === 0) {
    const p = sim.robotPose();
    trace.push({ t: sim.timeMs - t0, x: +p.xMm.toFixed(1), y: +p.yMm.toFixed(1), heading: +p.headingDeg.toFixed(2) });
  }
};
const wall = performance.now();
const res = await runPython({
  api,
  files: loadPythonFiles(),
  source,
  wasmUrl: micropythonWasmPath(),
  timeLimitMs: t0 + Number(values["time-limit"]) * 1000,
  hooks: { stdout: (l) => console.log(l), onTick },
});
if (!res.stopped) settle(api, 10000, onTick);
const p = sim.robotPose();
console.error(
  `\n${res.ok ? (res.stopped ? "stopped (time limit)" : "finished") : "ERROR"} after ${((sim.timeMs - t0) / 1000).toFixed(2)} s sim time ` +
    `(${((performance.now() - wall) / 1000).toFixed(2)} s wall) — final pose x=${p.xMm.toFixed(1)} y=${p.yMm.toFixed(1)} heading=${p.headingDeg.toFixed(1)}°`,
);
if (values.trace) writeFileSync(userPath(values.trace), JSON.stringify({ start: { x, y, heading: h }, samples: trace }));
process.exit(res.ok ? 0 : 1);
