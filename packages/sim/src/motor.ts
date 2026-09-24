// SPIKE Prime angular motor model: trajectory generator + PID controller (firmware side)
// and a DC motor torque model (physics side). Angles are motor degrees; positive =
// clockwise when looking at the motor's output face (LEGO convention).

import { Profile, holdProfile, moveProfile, runProfile, timeProfile } from "./trajectory";

export type MotorType = "small" | "medium" | "large";

export interface MotorSpec {
  /** Maximum regulated speed (deg/s), per the SPIKE docs. */
  maxSpeed: number;
  /** Unloaded speed at 100% duty (deg/s). */
  noLoadSpeed: number;
  /** Stall torque at 100% duty (N·m). */
  stallTorque: number;
  /** Gearbox Coulomb friction (N·m) and viscous friction (N·m per rad/s). */
  frictionTorque: number;
  viscous: number;
  /** Rotor inertia reflected to the output shaft (kg·m²). */
  reflectedInertia: number;
  massKg: number;
}

// Speeds from docs.txt. Torques/inertia are starting estimates to be calibrated
// against real motors (see Verification in the plan).
export const MOTOR_SPECS: Record<MotorType, MotorSpec> = {
  small: { maxSpeed: 660, noLoadSpeed: 780, stallTorque: 0.09, frictionTorque: 0.012, viscous: 0.0002, reflectedInertia: 2e-5, massKg: 0.036 },
  medium: { maxSpeed: 1110, noLoadSpeed: 1290, stallTorque: 0.18, frictionTorque: 0.02, viscous: 0.0003, reflectedInertia: 5e-5, massKg: 0.049 },
  large: { maxSpeed: 1050, noLoadSpeed: 1220, stallTorque: 0.25, frictionTorque: 0.03, viscous: 0.0004, reflectedInertia: 8e-5, massKg: 0.072 },
};

export const Status = { READY: 0, RUNNING: 1, STALLED: 2, CANCELLED: 3, ERROR: 4, DISCONNECTED: 5 } as const;
export const Stop = { COAST: 0, BRAKE: 1, HOLD: 2, CONTINUE: 3, SMART_COAST: 4, SMART_BRAKE: 5 } as const;
export const Direction = { CLOCKWISE: 0, COUNTERCLOCKWISE: 1, SHORTEST_PATH: 2, LONGEST_PATH: 3 } as const;

type Mode = "coast" | "brake" | "track" | "duty";

interface Command {
  id: number;
  profile: Profile;
  startT: number; // sim seconds
  stop: number;
  /** Finite commands complete; run() never does. */
  finite: boolean;
  /** Target for SMART_* compensation. */
  target: number;
}

const CONTROL_PERIOD = 0.005; // firmware control loop, s
const KP = 0.03; // duty per degree
const KI = 0.25; // duty per degree·s
const KD = 0.0006; // duty per deg/s
const STALL_TIME = 0.3; // s saturated and not moving
const DONE_TOL = 1; // deg
const SETTLE_MAX = 0.15; // s after the profile ends before completing anyway

let nextCommandId = 1;

export class MotorController {
  readonly spec: MotorSpec;
  readonly type: MotorType;
  /** Measured state (continuous; encoders report rounded values). */
  angle = 0;
  speed = 0;
  /** Offset so relative_position can be reset. */
  relOffset = 0;
  /** Absolute zero offset (the physical marker position), degrees. */
  absOffset = 0;

  mode: Mode = "coast";
  duty = 0; // -1..1
  private cmd: Command | null = null;
  private integ = 0;
  private lastControlT = -1;
  private stallT = 0;
  private smartTarget: number | null = null;
  private statuses = new Map<number, number>();

  constructor(type: MotorType) {
    this.type = type;
    this.spec = MOTOR_SPECS[type];
  }

  // ---- queries -----------------------------------------------------------
  relativePosition(): number {
    return Math.round(this.angle - this.relOffset);
  }
  absolutePosition(): number {
    // SPIKE 3 reports -180..179
    let a = Math.round(this.angle - this.absOffset) % 360;
    if (a >= 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  }
  velocity(): number {
    return Math.round(this.speed);
  }
  dutyCycle(): number {
    return Math.round(this.duty * 10000);
  }
  status(id: number): number {
    return this.statuses.get(id) ?? Status.READY;
  }
  /** A finite command (degrees/time/position) is still executing. */
  get busy(): boolean {
    return !!this.cmd && this.cmd.finite && this.statuses.get(this.cmd.id) === Status.RUNNING;
  }

  // ---- commands ----------------------------------------------------------
  private clampSpeed(v: number) {
    return Math.max(-this.spec.maxSpeed, Math.min(this.spec.maxSpeed, v));
  }
  private clampAcc(a: number) {
    return Math.max(1, Math.min(10000, a || 1000));
  }
  private refState(t: number): { pos: number; vel: number } {
    if (this.cmd && this.mode === "track") return this.cmd.profile.sample(t - this.cmd.startT);
    return { pos: this.angle, vel: this.speed };
  }
  private begin(t: number, profile: Profile, stop: number, finite: boolean, target: number): number {
    this.cancel();
    const id = nextCommandId++;
    this.cmd = { id, profile, startT: t, stop, finite, target };
    this.statuses.set(id, Status.RUNNING);
    this.mode = "track";
    this.stallT = 0;
    return id;
  }
  private cancel() {
    if (this.cmd && this.statuses.get(this.cmd.id) === Status.RUNNING) this.statuses.set(this.cmd.id, Status.CANCELLED);
  }
  /** Start position for a relative move, honouring SMART_* compensation. */
  private startPos(): number {
    return this.smartTarget ?? this.angle;
  }

  run(t: number, velocity: number, acceleration: number): number {
    const r = this.refState(t);
    this.smartTarget = null;
    return this.begin(t, runProfile(r.pos, r.vel, this.clampSpeed(velocity), this.clampAcc(acceleration)), Stop.CONTINUE, false, NaN);
  }

  runForDegrees(t: number, degrees: number, velocity: number, stop: number, acc: number, dec: number): number {
    const r = this.refState(t);
    const base = this.startPos();
    const v = this.clampSpeed(velocity);
    // Direction is sign(degrees) * sign(velocity), like the hub.
    const dist = Math.abs(degrees) * Math.sign(degrees || 1) * Math.sign(v || 1);
    const target = base + dist;
    const p = moveProfile(r.pos, r.vel, target - r.pos, Math.abs(v), this.clampAcc(acc), this.clampAcc(dec));
    return this.begin(t, p, stop, true, target);
  }

  runForTime(t: number, durationMs: number, velocity: number, stop: number, acc: number, dec: number): number {
    const r = this.refState(t);
    this.smartTarget = null;
    const p = timeProfile(r.pos, r.vel, this.clampSpeed(velocity), Math.max(0, durationMs) / 1000, this.clampAcc(acc), this.clampAcc(dec));
    return this.begin(t, p, stop, true, NaN);
  }

  runToRelativePosition(t: number, position: number, velocity: number, stop: number, acc: number, dec: number): number {
    const r = this.refState(t);
    const target = this.relOffset + position;
    const p = moveProfile(r.pos, r.vel, target - r.pos, Math.abs(this.clampSpeed(velocity)), this.clampAcc(acc), this.clampAcc(dec));
    return this.begin(t, p, stop, true, target);
  }

  runToAbsolutePosition(t: number, position: number, velocity: number, direction: number, stop: number, acc: number, dec: number): number {
    const r = this.refState(t);
    const cur = this.angle - this.absOffset;
    const curMod = ((cur % 360) + 360) % 360;
    const want = ((position % 360) + 360) % 360;
    const cw = (want - curMod + 360) % 360; // positive (clockwise) distance
    const ccw = cw === 0 ? 0 : cw - 360;
    let d: number;
    switch (direction) {
      case Direction.CLOCKWISE: d = cw; break;
      case Direction.COUNTERCLOCKWISE: d = ccw; break;
      case Direction.LONGEST_PATH: d = Math.abs(cw) >= Math.abs(ccw) ? cw : ccw; break;
      default: d = Math.abs(cw) <= Math.abs(ccw) ? cw : ccw;
    }
    const target = this.angle + d;
    const p = moveProfile(r.pos, r.vel, target - r.pos, Math.abs(this.clampSpeed(velocity)), this.clampAcc(acc), this.clampAcc(dec));
    return this.begin(t, p, stop, true, target);
  }

  /** Synchronized-pair helper: caller supplies a prebuilt profile. */
  runProfile(t: number, profile: Profile, stop: number, finite: boolean, target: number): number {
    return this.begin(t, profile, stop, finite, target);
  }
  referenceState(t: number) {
    return this.refState(t);
  }
  smartStart(): number {
    return this.startPos();
  }
  clearSmart() {
    this.smartTarget = null;
  }

  stop(t: number, stop: number) {
    this.cancel();
    this.cmd = null;
    this.applyStop(t, stop, NaN);
  }

  setDutyCycle(duty10000: number) {
    this.cancel();
    this.cmd = null;
    this.mode = "duty";
    this.duty = Math.max(-1, Math.min(1, duty10000 / 10000));
  }

  resetRelativePosition(position: number) {
    this.relOffset = this.angle - position;
    this.smartTarget = null;
  }

  private applyStop(t: number, stop: number, target: number) {
    this.integ = 0;
    switch (stop) {
      case Stop.COAST:
        this.mode = "coast"; this.smartTarget = null; break;
      case Stop.SMART_COAST:
        this.mode = "coast"; this.smartTarget = Number.isFinite(target) ? target : null; break;
      case Stop.HOLD:
        this.mode = "track";
        this.cmd = { id: 0, profile: holdProfile(Number.isFinite(target) ? target : this.angle), startT: t, stop, finite: false, target };
        this.smartTarget = null;
        break;
      case Stop.CONTINUE:
        // keep whatever reference is active (profile already holds its final speed)
        break;
      case Stop.SMART_BRAKE:
        this.mode = "brake"; this.smartTarget = Number.isFinite(target) ? target : null; break;
      default:
        this.mode = "brake"; this.smartTarget = null;
    }
  }

  // ---- control (called every physics tick) --------------------------------
  /** Update firmware state from the measured angle (deg) and speed (deg/s). */
  update(t: number, angle: number, speed: number) {
    this.angle = angle;
    this.speed = speed;
    if (this.lastControlT >= 0 && t - this.lastControlT < CONTROL_PERIOD - 1e-9) return;
    const dtc = this.lastControlT < 0 ? CONTROL_PERIOD : t - this.lastControlT;
    this.lastControlT = t;
    if (this.mode !== "track" || !this.cmd) return;
    const c = this.cmd;
    const tr = t - c.startT;
    const ref = c.profile.sample(tr);
    const err = ref.pos - angle;
    this.integ = Math.max(-2, Math.min(2, this.integ + err * dtc));
    // Feed-forward: speed / back-EMF, plus gearbox friction in the direction we need to move.
    const want = Math.abs(ref.vel) > 1 ? Math.sign(ref.vel) : Math.abs(err) > 0.5 ? Math.sign(err) : 0;
    const ff = ref.vel / this.spec.noLoadSpeed + (want * this.spec.frictionTorque) / this.spec.stallTorque;
    let duty = ff + KP * err + KI * this.integ + KD * (ref.vel - speed);
    duty = Math.max(-1, Math.min(1, duty));
    this.duty = duty;

    if (c.id === 0) return; // HOLD has no status
    // Stall detection: saturated and barely moving while the reference wants to move.
    if (Math.abs(duty) > 0.97 && Math.abs(speed) < 30 && Math.abs(err) > 15) this.stallT += dtc;
    else this.stallT = 0;
    if (this.stallT >= STALL_TIME) {
      this.statuses.set(c.id, Status.STALLED);
      this.cmd = null;
      this.applyStop(t, c.stop === Stop.CONTINUE ? Stop.BRAKE : c.stop, NaN);
      return;
    }
    if (c.finite && tr >= c.profile.endT && (Math.abs(err) <= DONE_TOL || tr >= c.profile.endT + SETTLE_MAX)) {
      this.statuses.set(c.id, Status.READY);
      if (c.stop === Stop.CONTINUE) {
        // Keep running at the final speed of the move.
        const v = ref.vel;
        this.cmd = { id: 0, profile: runProfile(ref.pos, v, v, 1000), startT: t, stop: Stop.CONTINUE, finite: false, target: NaN };
        return;
      }
      this.cmd = null;
      this.applyStop(t, c.stop, c.target);
    }
  }

  /**
   * Output torque (N·m, positive = clockwise on the output) for the current electrical
   * mode, given the output speed in deg/s. Includes back-EMF and gearbox friction.
   */
  torque(speedDps: number): number {
    const s = this.spec;
    const w = speedDps / s.noLoadSpeed; // normalized speed
    let tau = 0;
    if (this.mode === "track" || this.mode === "duty") tau = s.stallTorque * (this.duty - w);
    else if (this.mode === "brake") tau = -s.stallTorque * w; // shorted windings
    // Gearbox friction: smooth Coulomb + viscous.
    const wr = (speedDps * Math.PI) / 180;
    tau -= s.frictionTorque * Math.tanh(speedDps / 5) + s.viscous * wr;
    return tau;
  }
}
