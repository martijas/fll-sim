import type { FieldModel, HubEvent, RobotModel, SceneBody, SeasonConfig, StartPose } from "@fll-sim/sim";
import type { RunResult } from "@fll-sim/runtime-python";
import { CTRL, type Frame, type FromWorker, type MatPayload, type ToWorker } from "../worker/protocol";
import SimWorker from "../worker/sim.worker.ts?worker";

export interface SimCallbacks {
  scene(bodies: SceneBody[], ids: string[]): void;
  frame(f: Frame): void;
  stdout(line: string): void;
  hub(events: HubEvent[]): void;
  done(r: RunResult): void;
  fatal(msg: string): void;
}

/**
 * Owns the simulation worker. Stop/reset terminate the worker and start a fresh one:
 * a running MicroPython program cannot be interrupted any other way, and this also
 * guarantees every run starts from an identical state.
 */
export class SimController {
  private worker: Worker | null = null;
  private ctrlBuf = new SharedArrayBuffer(CTRL.SIZE * 4);
  readonly ctrl = new Int32Array(this.ctrlBuf);
  running = false;

  constructor(
    private cb: SimCallbacks,
    private cfg: { season: SeasonConfig; mat: MatPayload | null; robot: RobotModel; start: StartPose; fieldModels: FieldModel[]; footprints: boolean },
  ) {
    Atomics.store(this.ctrl, CTRL.SPEED_X100, 100);
  }

  private send(m: ToWorker) {
    this.worker!.postMessage(m);
  }

  boot() {
    this.worker?.terminate();
    const w = new SimWorker();
    this.worker = w;
    this.running = false;
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      switch (m.type) {
        case "scene": this.cb.scene(m.bodies, m.bodyIds); break;
        case "frame": this.cb.frame(m); break;
        case "stdout": this.cb.stdout(m.line); break;
        case "hub": this.cb.hub(m.events); break;
        case "done": this.running = false; this.cb.done(m.result); break;
        case "fatal": this.running = false; this.cb.fatal(m.message); break;
        case "app": this.cb.stdout(`[app] ${m.kind} ${m.args.join(" ")}`); break;
      }
    };
    w.onerror = (e) => this.cb.fatal(e.message);
    // Mat data is copied (not transferred) so reboots can reuse it.
    const mat = this.cfg.mat ? { ...this.cfg.mat, data: this.cfg.mat.data.slice(0) } : null;
    this.send({ type: "init", season: this.cfg.season, mat, robot: this.cfg.robot, start: this.cfg.start, ctrl: this.ctrlBuf, fieldModels: this.cfg.fieldModels, footprints: this.cfg.footprints });
  }

  setStart(start: StartPose) {
    this.cfg.start = start;
    this.boot();
  }

  run(source: string, timeLimitMs?: number) {
    this.setPaused(false);
    this.running = true;
    this.send({ type: "run", source, timeLimitMs });
  }

  stop() {
    this.boot();
  }

  setPaused(p: boolean) {
    Atomics.store(this.ctrl, CTRL.PAUSE, p ? 1 : 0);
    Atomics.notify(this.ctrl, CTRL.WAKE);
  }
  get paused() {
    return Atomics.load(this.ctrl, CTRL.PAUSE) === 1;
  }
  setSpeed(x: number) {
    Atomics.store(this.ctrl, CTRL.SPEED_X100, Math.round(x * 100));
    Atomics.notify(this.ctrl, CTRL.WAKE);
  }
  setButton(which: "left" | "right", down: boolean) {
    Atomics.store(this.ctrl, which === "left" ? CTRL.BTN_LEFT : CTRL.BTN_RIGHT, down ? 1 : 0);
  }
  dispose() {
    this.worker?.terminate();
  }
}
