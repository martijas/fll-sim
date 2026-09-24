// Runs SPIKE Prime Python programs on the official MicroPython WebAssembly build, in lockstep
// with the simulation clock. Everything is synchronous: sim time only advances when the
// program sleeps, awaits, or makes hub calls (each call costs a little simulated CPU time).

import type { SpikeApi } from "@fll-sim/sim";
// @ts-expect-error - the package ships an untyped ES module
import { loadMicroPython } from "@micropython/micropython-webassembly-pyscript/micropython.mjs";

export interface RunnerHooks {
  stdout(line: string): void;
  /** Called after every simulated millisecond (pacing, snapshots, UI input). */
  onTick?(): void;
  /** SPIKE App panels (display, graphs, app sounds). */
  app?(kind: string, args: string[]): void;
  appQuery?(kind: string, args: string[]): number;
}

export interface RunOptions {
  api: SpikeApi;
  /** Module files, path relative to /lib (e.g. "hub/light_matrix.py") -> source. */
  files: Record<string, string>;
  source: string;
  hooks: RunnerHooks;
  /** URL/path of micropython.wasm (browser: bundler URL; node: file path). */
  wasmUrl?: string;
  /** Simulated CPU time charged per hub API call (µs). */
  callCostUs?: number;
  /** Abort (as if the Stop button was pressed) when sim time exceeds this. */
  timeLimitMs?: number;
  heapBytes?: number;
}

export interface RunResult {
  ok: boolean;
  /** Formatted traceback (hub console style) when ok = false. */
  error?: string;
  errorType?: string;
  errorLine?: number;
  stopped?: boolean;
  simTimeMs: number;
}

export class SimAbort extends Error {
  constructor() {
    super("stopped");
    this.name = "SimAbort";
  }
}

const PROGRAM_FILE = "program.py";

export async function runPython(o: RunOptions): Promise<RunResult> {
  const { api, hooks } = o;
  const sim = api.sim;
  const cost = o.callCostUs ?? 40;
  const limit = o.timeLimitMs ?? Infinity;
  let debtUs = 0;

  const tick = () => {
    if (sim.timeMs >= limit) throw new SimAbort();
    sim.tick();
    hooks.onTick?.();
  };
  const charge = () => {
    debtUs += cost;
    while (debtUs >= 1000) {
      debtUs -= 1000;
      tick();
    }
  };

  const bridge = {
    now: () => sim.timeMs,
    st: (id: number) => api.status(id),
    dk: (port: number) => api.deviceKind(port),
    step: (ms: number) => {
      for (let i = 0; i < ms; i++) tick();
    },
    wait: (deadline: number, idsCsv: string) => {
      const ids = idsCsv ? idsCsv.split(",").map(Number) : [];
      do {
        tick();
        if (ids.some((id) => api.status(id) !== 1)) return;
      } while (sim.timeMs < deadline);
    },
    call: (name: string, ...args: unknown[]) => {
      charge();
      const f = (api as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
      if (typeof f !== "function") throw new Error(`bridge: unknown hub call ${name}`);
      return f.apply(api, args);
    },
    app: (kind: string, payload: string) => {
      charge();
      hooks.app?.(kind, payload.split("\x1f"));
    },
    appq: (kind: string, payload: string) => {
      charge();
      return hooks.appQuery?.(kind, payload.split("\x1f")) ?? 0;
    },
  };

  const mp = await loadMicroPython({
    url: o.wasmUrl,
    heapsize: o.heapBytes ?? 2 * 1024 * 1024,
    stdout: (line: string) => hooks.stdout(line),
    stderr: (line: string) => hooks.stdout(line),
    linebuffer: true,
  });
  mp.registerJsModule("_sim", bridge);
  mkdirs(mp.FS, "/lib");
  for (const [path, src] of Object.entries(o.files)) {
    const full = "/lib/" + path;
    mkdirs(mp.FS, full.slice(0, full.lastIndexOf("/")));
    mp.FS.writeFile(full, src);
  }
  mp.FS.writeFile("/" + PROGRAM_FILE, o.source);

  try {
    mp.runPython(`
import sys
sys.path.insert(0, '/lib')
_src = open('/${PROGRAM_FILE}').read()
_code = compile(_src, '${PROGRAM_FILE}', 'exec')
del _src
exec(_code, {'__name__': '__main__'})
`);
    return { ok: true, simTimeMs: sim.timeMs };
  } catch (e) {
    if (e instanceof SimAbort) return { ok: true, stopped: true, simTimeMs: sim.timeMs };
    const err = e as { name?: string; type?: string; message?: string };
    if (err.name !== "PythonError") throw e;
    const text = cleanTraceback(err.message ?? "");
    const line = [...text.matchAll(new RegExp(`File "${PROGRAM_FILE}", line (\\d+)`, "g"))].pop();
    if (err.type === "SystemExit") return { ok: true, simTimeMs: sim.timeMs };
    hooks.stdout(text);
    return { ok: false, error: text, errorType: err.type, errorLine: line ? Number(line[1]) : undefined, simTimeMs: sim.timeMs };
  }
}

/** Drop the runner's own <stdin> frames so tracebacks look like the hub console. */
function cleanTraceback(msg: string): string {
  return msg
    .split("\n")
    .filter((l) => !l.includes('File "<stdin>"'))
    .join("\n")
    .trimEnd();
}

function mkdirs(FS: { mkdir(p: string): void; analyzePath(p: string): { exists: boolean } }, path: string) {
  let cur = "";
  for (const part of path.split("/").filter(Boolean)) {
    cur += "/" + part;
    if (!FS.analyzePath(cur).exists) FS.mkdir(cur);
  }
}

/**
 * Program ended: like the hub, let finite motor commands that were started without `await`
 * complete, then stop every motor (coast) and let the robot come to rest.
 */
export function settle(api: SpikeApi, maxMs = 10000, onTick?: () => void) {
  const sim = api.sim;
  const end = sim.timeMs + maxMs;
  const busy = () => [...sim.motors.values()].some((m) => m.ctl.busy);
  while (sim.timeMs < end && busy()) {
    sim.tick();
    onTick?.();
  }
  for (const m of sim.motors.values()) m.ctl.stop(sim.timeMs / 1000, 0);
  for (let i = 0; i < 300; i++) {
    sim.tick();
    onTick?.();
  }
}
