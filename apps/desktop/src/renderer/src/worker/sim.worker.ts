/// <reference lib="webworker" />
// Simulation worker: physics + MicroPython in lockstep, paced against wall-clock time.
import { PORTS, Simulation, SpikeApi, type Port } from "@fll-sim/sim";
import { SimAbort, runPython, settle } from "@fll-sim/runtime-python";
import wasmUrl from "@micropython/micropython-webassembly-pyscript/micropython.wasm?url";
import { CTRL, type Frame, type FromWorker, type ToWorker } from "./protocol";

const pyModules = import.meta.glob("../../../../../../packages/runtime-python/python/**/*.py", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const files: Record<string, string> = {};
for (const [k, v] of Object.entries(pyModules)) files[k.split("/python/")[1]] = v;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as DedicatedWorkerGlobalScope).postMessage(m, transfer);

let sim: Simulation;
let api: SpikeApi;
let ctrl: Int32Array;
let running = false;
let lastFrame = 0;
let anchorWall = 0;
let anchorSim = 0;
let anchorSpeed = 1;

function speed() {
  return Math.max(1, Atomics.load(ctrl, CTRL.SPEED_X100)) / 100;
}

function frame(): Frame {
  const motors = [];
  const sensors = [];
  for (const p of PORTS as Port[]) {
    const m = sim.motor(p);
    if (m) motors.push({ port: p, relPos: m.relativePosition(), absPos: m.absolutePosition(), speed: m.velocity(), duty: m.dutyCycle() });
    const k = sim.deviceType(p);
    if (k === "color") {
      const r = sim.colorSensor(p);
      sensors.push({ port: p, type: "color", value: `refl ${r.reflection}  color ${r.color}` });
    } else if (k === "distance") sensors.push({ port: p, type: "distance", value: `${sim.distanceSensor(p)} mm` });
  }
  return {
    type: "frame",
    timeMs: sim.timeMs,
    transforms: sim.transforms(),
    pixels: sim.hub.pixels,
    lights: { ...sim.hub.lights },
    pose: sim.robotPose(),
    yaw: sim.tiltAngles()[0],
    motors,
    sensors,
    running,
  };
}

function flushHub() {
  if (sim.hub.events.length) {
    post({ type: "hub", events: sim.hub.events.splice(0) });
  }
}

function emitFrame(force = false) {
  const now = performance.now();
  if (!force && now - lastFrame < 16) return;
  lastFrame = now;
  const f = frame();
  post(f, [f.transforms.buffer]);
  flushHub();
}

/** Called after every simulated ms while a program runs. */
function onTick() {
  // Buttons
  sim.hub.buttonDown[1] = Atomics.load(ctrl, CTRL.BTN_LEFT) ? (sim.hub.buttonDown[1] >= 0 ? sim.hub.buttonDown[1] : sim.timeMs) : -1;
  sim.hub.buttonDown[2] = Atomics.load(ctrl, CTRL.BTN_RIGHT) ? (sim.hub.buttonDown[2] >= 0 ? sim.hub.buttonDown[2] : sim.timeMs) : -1;
  if (sim.timeMs % 4 !== 0) return;
  // Interrupted (a match goes on): end the program here, without resetting anything
  if (Atomics.load(ctrl, CTRL.STOP)) {
    Atomics.store(ctrl, CTRL.STOP, 0);
    throw new SimAbort();
  }
  // Pause
  if (Atomics.load(ctrl, CTRL.PAUSE)) {
    emitFrame(true);
    while (Atomics.load(ctrl, CTRL.PAUSE)) Atomics.wait(ctrl, CTRL.WAKE, 0, 50);
    reanchor();
  }
  // Pace
  const s = speed();
  if (s !== anchorSpeed) reanchor();
  if (s < 64) {
    const targetWall = anchorWall + (sim.timeMs - anchorSim) / s;
    const ahead = targetWall - performance.now();
    if (ahead > 1) Atomics.wait(ctrl, CTRL.WAKE, 0, ahead);
  }
  emitFrame();
}

function reanchor() {
  anchorWall = performance.now();
  anchorSim = sim.timeMs;
  anchorSpeed = speed();
}

// Messages are handled strictly in order (init is async).
let queue: Promise<void> = Promise.resolve();
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  queue = queue.then(() => handle(ev.data));
};

async function handle(m: ToWorker) {
  try {
    if (m.type === "init") {
      ctrl = new Int32Array(m.ctrl);
      const mat = m.mat ? { width: m.mat.width, height: m.mat.height, data: new Uint8ClampedArray(m.mat.data) } : null;
      sim = await Simulation.create({ season: m.season, robot: m.robot, start: m.start, mat, fieldModels: m.fieldModels, footprints: m.footprints, colorCalibration: m.colorCalibration });
      api = new SpikeApi(sim);
      sim.stepMs(250); // let the robot settle on the mat
      post({ type: "scene", bodies: sim.scene, bodyIds: sim.bodies.map((b) => b.id) });
      emitFrame(true);
    } else if (m.type === "run") {
      running = true;
      reanchor();
      const result = await runPython({ api, files, source: m.source, wasmUrl, timeLimitMs: m.timeLimitMs ? sim.timeMs + m.timeLimitMs : undefined, hooks: { stdout: (line) => post({ type: "stdout", line }), onTick, app: (kind, args) => post({ type: "app", kind, args }) } });
      if (!result.stopped) settle(api, 10000, onTick);
      else {
        // stopped (interrupted or out of time): the motors brake and the robot comes to rest
        for (const mb of sim.motors.values()) mb.ctl.stop(sim.timeMs / 1000, 1);
        sim.stepMs(300);
      }
      running = false;
      emitFrame(true);
      post({ type: "done", result, snapshot: sim.snapshot() });
    } else if (m.type === "replaceRobot") {
      sim.replaceRobot(m.robot, m.pose ?? sim.robotPose());
      sim.stepMs(150);
      post({ type: "scene", bodies: sim.scene, bodyIds: sim.bodies.map((b) => b.id) });
      emitFrame(true);
    } else if (m.type === "snapshot") {
      post({ type: "snapshot", snapshot: sim.snapshot() });
    }
  } catch (e) {
    running = false;
    post({ type: "fatal", message: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) });
  }
}
