// Host-side implementation of the SPIKE Prime 3 API (docs.txt), in terms of the simulation.
// Called by the Python bridge (and later the Word Blocks runtime). All arguments are plain
// numbers/strings; ports are 0..5 (hub.port.A..F). Awaitable operations return a command id
// whose status is polled with `status(id)` (1 = RUNNING).

import { PORTS, type Port } from "./model";
import { MotorPair, type PairCmd } from "./pair";
import { Status } from "./motor";
import type { Simulation } from "./world";

export type DeviceKind = "motor" | "color" | "distance" | "force" | null;

// LPF-2 device ids as reported by device.id() on SPIKE Prime.
const DEVICE_IDS: Record<string, number> = { small: 65, medium: 75, large: 76, color: 61, distance: 62, force: 63 };

export class SpikeApi {
  private pairs: (MotorPair | null)[] = [null, null, null];
  private pairCmds = new Map<number, { pair: MotorPair; cmd: PairCmd }>();
  private awaiters = new Map<number, () => number>();
  private distanceLights = new Map<number, number[]>();
  private timerStart = 0;

  constructor(readonly sim: Simulation) {}

  private p(port: number): Port {
    const p = PORTS[port];
    if (!p) throw new RangeError(`invalid port ${port}`);
    return p;
  }
  get t() {
    return this.sim.timeMs / 1000;
  }

  // ---- generic -------------------------------------------------------------------
  now(): number {
    return this.sim.timeMs;
  }
  deviceKind(port: number): DeviceKind {
    return this.sim.deviceType(this.p(port));
  }
  deviceId(port: number): number {
    const k = this.deviceKind(port);
    if (!k) return 0;
    if (k === "motor") return DEVICE_IDS[this.sim.motor(this.p(port))!.type];
    return DEVICE_IDS[k];
  }
  /** Status of any awaitable id. */
  status(id: number): number {
    const f = this.awaiters.get(id);
    if (!f) return Status.READY;
    const s = f();
    if (s !== Status.RUNNING) this.awaiters.delete(id);
    return s;
  }
  private track(id: number, f: () => number): number {
    this.awaiters.set(id, f);
    return id;
  }

  // ---- motor -----------------------------------------------------------------------
  private m(port: number) {
    const m = this.sim.motor(this.p(port));
    if (!m) throw new Error("ENODEV");
    return m;
  }
  motorRun(port: number, velocity: number, acceleration: number) {
    this.m(port).run(this.t, velocity, acceleration);
  }
  private motorCmd(port: number, start: (m: ReturnType<SpikeApi["m"]>) => number) {
    const m = this.m(port);
    const id = start(m);
    return this.track(id, () => m.status(id));
  }
  runForDegrees(port: number, degrees: number, velocity: number, stop: number, acc: number, dec: number) {
    return this.motorCmd(port, (m) => m.runForDegrees(this.t, degrees, velocity, stop, acc, dec));
  }
  runForTime(port: number, duration: number, velocity: number, stop: number, acc: number, dec: number) {
    return this.motorCmd(port, (m) => m.runForTime(this.t, duration, velocity, stop, acc, dec));
  }
  runToAbsolutePosition(port: number, position: number, velocity: number, direction: number, stop: number, acc: number, dec: number) {
    return this.motorCmd(port, (m) => m.runToAbsolutePosition(this.t, position, velocity, direction, stop, acc, dec));
  }
  runToRelativePosition(port: number, position: number, velocity: number, stop: number, acc: number, dec: number) {
    return this.motorCmd(port, (m) => m.runToRelativePosition(this.t, position, velocity, stop, acc, dec));
  }
  motorStop(port: number, stop: number) {
    this.m(port).stop(this.t, stop);
  }
  motorSetDutyCycle(port: number, pwm: number) {
    this.m(port).setDutyCycle(pwm);
  }
  motorAbsolutePosition(port: number) {
    return this.m(port).absolutePosition();
  }
  motorRelativePosition(port: number) {
    return this.m(port).relativePosition();
  }
  motorResetRelativePosition(port: number, position: number) {
    this.m(port).resetRelativePosition(position);
  }
  motorVelocity(port: number) {
    return this.m(port).velocity();
  }
  motorDutyCycle(port: number) {
    return this.m(port).dutyCycle();
  }

  // ---- motor_pair ---------------------------------------------------------------------
  pair(slot: number, left: number, right: number) {
    this.pairs[slot] = new MotorPair(this.m(left), this.m(right));
  }
  unpair(slot: number) {
    this.pairs[slot] = null;
  }
  private mp(slot: number) {
    const p = this.pairs[slot];
    if (!p) throw new Error("PAIR");
    return p;
  }
  private pairCmd(pair: MotorPair, cmd: PairCmd) {
    const id = this.sim.allocId();
    return this.track(id, () => MotorPair.status(pair.left, pair.right, cmd));
  }
  pairMove(slot: number, steering: number, velocity: number, acc: number) {
    this.mp(slot).move(this.t, steering, velocity, acc);
  }
  pairMoveTank(slot: number, lv: number, rv: number, acc: number) {
    this.mp(slot).moveTank(this.t, lv, rv, acc);
  }
  pairMoveForDegrees(slot: number, degrees: number, steering: number, velocity: number, stop: number, acc: number, dec: number) {
    const p = this.mp(slot);
    return this.pairCmd(p, p.moveForDegrees(this.t, degrees, steering, velocity, stop, acc, dec));
  }
  pairMoveForTime(slot: number, duration: number, steering: number, velocity: number, stop: number, acc: number, dec: number) {
    const p = this.mp(slot);
    return this.pairCmd(p, p.moveForTime(this.t, duration, steering, velocity, stop, acc, dec));
  }
  pairMoveTankForDegrees(slot: number, degrees: number, lv: number, rv: number, stop: number, acc: number, dec: number) {
    const p = this.mp(slot);
    return this.pairCmd(p, p.moveTankForDegrees(this.t, degrees, lv, rv, stop, acc, dec));
  }
  pairMoveTankForTime(slot: number, lv: number, rv: number, duration: number, stop: number, acc: number, dec: number) {
    const p = this.mp(slot);
    return this.pairCmd(p, p.moveTankForTime(this.t, lv, rv, duration, stop, acc, dec));
  }
  pairStop(slot: number, stop: number) {
    this.mp(slot).stop(this.t, stop);
  }

  // ---- sensors ----------------------------------------------------------------------
  private sensor(port: number, kind: DeviceKind) {
    if (this.deviceKind(port) !== kind) throw new Error("ENODEV");
    return this.p(port);
  }
  colorSensorColor(port: number) {
    return this.sim.colorSensor(this.sensor(port, "color")).color;
  }
  colorSensorReflection(port: number) {
    return this.sim.colorSensor(this.sensor(port, "color")).reflection;
  }
  colorSensorRgbi(port: number) {
    return this.sim.colorSensor(this.sensor(port, "color")).rgbi;
  }
  distance(port: number) {
    return this.sim.distanceSensor(this.sensor(port, "distance"));
  }
  distanceSetPixel(port: number, x: number, y: number, v: number) {
    const px = this.distanceLights.get(port) ?? [0, 0, 0, 0];
    px[y * 2 + x] = v;
    this.distanceLights.set(port, px);
  }
  distanceGetPixel(port: number, x: number, y: number) {
    return (this.distanceLights.get(port) ?? [0, 0, 0, 0])[y * 2 + x] ?? 0;
  }
  distanceShow(port: number, px: number[] | string) {
    this.distanceLights.set(port, nums(px).slice(0, 4));
  }
  forceValue(port: number) {
    this.sensor(port, "force");
    return 0; // plunger physics arrives with the builder (M6)
  }

  // ---- hub ---------------------------------------------------------------------------
  lmShow(px: number[] | string) { this.sim.hub.show(nums(px)); }
  lmShowImage(id: number) { this.sim.hub.showImage(id); }
  lmClear() { this.sim.hub.clear(); }
  lmSetPixel(x: number, y: number, v: number) { this.sim.hub.setPixel(x, y, v); }
  lmGetPixel(x: number, y: number) { return this.sim.hub.getPixel(x, y); }
  lmSetOrientation(o: number) { this.sim.hub.orientation = ((o % 4) + 4) % 4; return this.sim.hub.orientation; }
  lmGetOrientation() { return this.sim.hub.orientation; }
  lmWrite(text: string, intensity: number, tpc: number) {
    const id = this.sim.hub.startWrite(this.sim.timeMs, text, intensity, tpc);
    return this.track(id, () => this.sim.hub.status(id));
  }
  lightColor(light: number, color: number) { this.sim.hub.lights[light] = color; }
  buttonPressed(b: number) { return this.sim.hub.buttonPressedMs(b, this.sim.timeMs); }
  beep(freq: number, duration: number, volume: number, waveform: number) {
    const id = this.sim.hub.beep(this.sim.timeMs, freq, duration, volume, waveform);
    return this.track(id, () => this.sim.hub.status(id));
  }
  soundStop() { this.sim.hub.stopSound(this.sim.timeMs); }
  soundVolume(v: number) { this.sim.hub.volume = Math.max(0, Math.min(100, v)); }

  tiltAngles() { return this.sim.tiltAngles(); }
  resetYaw(a: number) { this.sim.resetYaw(a); }
  angularVelocity() { return this.sim.angularVelocity(); }
  acceleration() { return this.sim.acceleration(); }
  quaternion() { return this.sim.quaternion(); }
  upFace() { return this.sim.upFace(); }
  stable() { return this.sim.stable(); }
  temperature() { return 250; }
  powerOff() { this.poweredOff = true; }
  poweredOff = false;
  deviceData(port: number): number[] {
    const k = this.deviceKind(port);
    if (k === "motor") { const m = this.m(port); return [m.velocity(), m.relativePosition(), m.absolutePosition(), m.dutyCycle()]; }
    if (k === "color") { const r = this.sim.colorSensor(this.p(port)); return [r.color, r.reflection, ...r.rgbi]; }
    if (k === "distance") return [this.distance(port)];
    return [];
  }

  timerReset() { this.timerStart = this.sim.timeMs; }
  timerMs() { return this.sim.timeMs - this.timerStart; }
}

function nums(px: number[] | string): number[] {
  return typeof px === "string" ? (px.length ? px.split(",").map(Number) : []) : px;
}
