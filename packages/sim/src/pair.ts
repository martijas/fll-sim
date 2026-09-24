// motor_pair: two motors driven with time-synchronized profiles. The LEFT motor is mirrored
// on a standard drive base, so the pair negates it: positive velocity drives forward.

import type { MotorController } from "./motor";
import { Status, Stop } from "./motor";
import { Profile, moveProfile, runProfile, timeProfile } from "./trajectory";

/** LEGO steering: 0 straight, ±50 pivot on one wheel, ±100 spin in place. Returns [left, right] factors. */
export function steeringFactors(steering: number): [number, number] {
  const s = Math.max(-100, Math.min(100, steering));
  if (s >= 0) return [1, 1 - s / 50];
  return [1 + s / 50, 1];
}

export interface PairCmd {
  left: number; // motor command ids
  right: number;
}

export class MotorPair {
  constructor(readonly left: MotorController, readonly right: MotorController) {}

  private maxSpeed() {
    return Math.min(this.left.spec.maxSpeed, this.right.spec.maxSpeed);
  }

  /** Scale a normalized profile to a motor: factor k multiplies position deltas, speeds and accels. */
  private scaled(m: MotorController, t: number, sign: number, build: (p0: number, v0: number) => Profile) {
    const r = m.referenceState(t);
    return build(r.pos * sign, r.vel * sign);
  }

  private start(t: number, lp: Profile, rp: Profile, stop: number, finite: boolean, lTarget: number, rTarget: number): PairCmd {
    return {
      left: this.left.runProfile(t, lp, stop, finite, lTarget),
      right: this.right.runProfile(t, rp, stop, finite, rTarget),
    };
  }

  /**
   * Shared starting speed for a synchronized move, in "forward" units of the faster wheel.
   * Both wheels start from the same fraction of it so they stay time-synchronized (a new
   * command right after a spin must not let each wheel ramp from its own speed).
   */
  private commonV0(t: number, kl: number, kr: number): number {
    const vl = -this.left.referenceState(t).vel, vr = this.right.referenceState(t).vel;
    const parts: number[] = [];
    if (Math.abs(kl) > 1e-6) parts.push(vl / kl);
    if (Math.abs(kr) > 1e-6) parts.push(vr / kr);
    if (!parts.length) return 0;
    const v = parts.reduce((a, b) => a + b, 0) / parts.length;
    return Math.max(0, v); // never start "backwards" along the new move direction
  }

  /** Signed per-wheel speeds in "forward" units (before left inversion). */
  private tank(lv: number, rv: number) {
    const max = this.maxSpeed();
    const k = Math.max(1, Math.abs(lv) / max, Math.abs(rv) / max);
    return [lv / k, rv / k];
  }

  move(t: number, steering: number, velocity: number, acc: number) {
    const [fl, fr] = steeringFactors(steering);
    return this.moveTank(t, velocity * fl, velocity * fr, acc);
  }

  moveTank(t: number, lv: number, rv: number, acc: number): PairCmd {
    const [l, r] = this.tank(lv, rv);
    const vmax = Math.max(Math.abs(l), Math.abs(r)) || 1;
    const a = clampAcc(acc);
    this.left.clearSmart();
    this.right.clearSmart();
    const lp = this.scaled(this.left, t, -1, (p, v) => runProfile(p, v, l, (a * Math.abs(l)) / vmax || a));
    const rp = this.scaled(this.right, t, 1, (p, v) => runProfile(p, v, r, (a * Math.abs(r)) / vmax || a));
    return this.start(t, negate(lp), rp, Stop.CONTINUE, false, NaN, NaN);
  }

  moveForDegrees(t: number, degrees: number, steering: number, velocity: number, stop: number, acc: number, dec: number) {
    const [fl, fr] = steeringFactors(steering);
    return this.moveTankForDegrees(t, degrees, velocity * fl, velocity * fr, stop, acc, dec);
  }

  /** `degrees` is travelled by the faster wheel; the other scales proportionally. */
  moveTankForDegrees(t: number, degrees: number, lv: number, rv: number, stop: number, acc: number, dec: number): PairCmd {
    const [l, r] = this.tank(lv, rv);
    const vmax = Math.max(Math.abs(l), Math.abs(r));
    const D = Math.abs(degrees) * (degrees < 0 ? -1 : 1);
    const a = clampAcc(acc), d = clampAcc(dec);
    const kl = vmax > 0 ? l / vmax : 0, kr = vmax > 0 ? r / vmax : 0;
    const dirD = D < 0 ? -1 : 1;
    const vc = this.commonV0(t, kl * dirD, kr * dirD) * dirD;
    const mk = (m: MotorController, sign: number, v: number) => {
      const k = vmax > 0 ? v / vmax : 0; // signed fraction
      const base = m.smartStart() * sign;
      const target = base + D * k;
      const r0 = m.referenceState(t);
      const p0 = r0.pos * sign, v0 = vc * k;
      const ak = Math.max(1e-6, a * Math.abs(k)), dk = Math.max(1e-6, d * Math.abs(k));
      const prof = Math.abs(k) < 1e-9 ? moveProfile(p0, v0, 0, 0, a, d) : moveProfile(p0, v0, target - p0, Math.abs(v), ak, dk);
      return { prof: sign < 0 ? negate(prof) : prof, target: target * sign };
    };
    const L = mk(this.left, -1, l), R = mk(this.right, 1, r);
    return this.start(t, L.prof, R.prof, stop, true, L.target, R.target);
  }

  moveForTime(t: number, durationMs: number, steering: number, velocity: number, stop: number, acc: number, dec: number) {
    const [fl, fr] = steeringFactors(steering);
    return this.moveTankForTime(t, velocity * fl, velocity * fr, durationMs, stop, acc, dec);
  }

  moveTankForTime(t: number, lv: number, rv: number, durationMs: number, stop: number, acc: number, dec: number): PairCmd {
    const [l, r] = this.tank(lv, rv);
    const vmax = Math.max(Math.abs(l), Math.abs(r)) || 1;
    const a = clampAcc(acc), d = clampAcc(dec);
    const T = Math.max(0, durationMs) / 1000;
    this.left.clearSmart();
    this.right.clearSmart();
    const lp = this.scaled(this.left, t, -1, (p, v) => timeProfile(p, v, l, T, Math.max(1e-6, (a * Math.abs(l)) / vmax), Math.max(1e-6, (d * Math.abs(l)) / vmax)));
    const rp = this.scaled(this.right, t, 1, (p, v) => timeProfile(p, v, r, T, Math.max(1e-6, (a * Math.abs(r)) / vmax), Math.max(1e-6, (d * Math.abs(r)) / vmax)));
    return this.start(t, negate(lp), rp, stop, true, NaN, NaN);
  }

  stop(t: number, stop: number) {
    this.left.stop(t, stop);
    this.right.stop(t, stop);
  }

  /** Combined status: RUNNING until both finish; STALLED/CANCELLED if either did. */
  static status(left: MotorController, right: MotorController, cmd: PairCmd): number {
    const a = left.status(cmd.left), b = right.status(cmd.right);
    if (a === Status.RUNNING || b === Status.RUNNING) {
      if (a === Status.STALLED || b === Status.STALLED) return Status.STALLED;
      return Status.RUNNING;
    }
    if (a === Status.STALLED || b === Status.STALLED) return Status.STALLED;
    if (a === Status.CANCELLED || b === Status.CANCELLED) return Status.CANCELLED;
    return Status.READY;
  }
}

function clampAcc(a: number) {
  return Math.max(1, Math.min(10000, a || 1000));
}

/** Mirror a profile (used for the inverted left motor). */
function negate(p: Profile): Profile {
  return new Profile(p.segments.map((s) => ({ t0: s.t0, dur: s.dur, p0: -s.p0, v0: -s.v0, a: -s.a })));
}
