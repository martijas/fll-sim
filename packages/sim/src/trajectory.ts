// Trapezoidal motion profiles, in motor degrees and degrees/second.
// A profile is a list of constant-acceleration segments; after the last one the
// reference holds its final speed (0 for finite moves, cruise speed for run()).

export interface Segment {
  t0: number; // s, relative to profile start
  dur: number; // s (Infinity allowed for the final cruise segment)
  p0: number; // deg
  v0: number; // deg/s
  a: number; // deg/s^2
}

export class Profile {
  readonly segments: Segment[];
  /** Time (s) when the profile reaches its final state; Infinity for run(). */
  readonly endT: number;
  readonly endPos: number;

  constructor(segments: Segment[]) {
    this.segments = segments;
    const last = segments[segments.length - 1];
    this.endT = last.t0 + last.dur;
    this.endPos = Number.isFinite(last.dur) ? last.p0 + last.v0 * last.dur + 0.5 * last.a * last.dur * last.dur : NaN;
  }

  sample(t: number): { pos: number; vel: number } {
    const segs = this.segments;
    let s = segs[0];
    for (let i = 0; i < segs.length; i++) {
      s = segs[i];
      if (t < s.t0 + s.dur) break;
    }
    const dt = Math.max(0, Math.min(t - s.t0, s.dur));
    let pos = s.p0 + s.v0 * dt + 0.5 * s.a * dt * dt;
    let vel = s.v0 + s.a * dt;
    if (t >= this.endT) {
      pos = this.endPos;
      vel = 0;
    }
    return { pos, vel };
  }
}

function push(segs: Segment[], dur: number, a: number) {
  const prev = segs[segs.length - 1];
  let t0 = 0, p0: number, v0: number;
  if (prev) {
    t0 = prev.t0 + prev.dur;
    p0 = prev.p0 + prev.v0 * prev.dur + 0.5 * prev.a * prev.dur * prev.dur;
    v0 = prev.v0 + prev.a * prev.dur;
  } else {
    throw new Error("push requires a seed segment");
  }
  segs.push({ t0, dur, p0, v0, a });
}

/**
 * Move by `distance` degrees (sign gives direction) with cruise speed |speed|.
 * Starts from the current reference position/velocity so commands can be chained smoothly.
 */
export function moveProfile(p0: number, v0: number, distance: number, speed: number, accel: number, decel: number): Profile {
  const dir = distance >= 0 ? 1 : -1;
  const D = Math.abs(distance);
  const v = Math.abs(speed);
  const w0 = v0 * dir; // initial speed along the move direction (may be negative)
  const segs: Segment[] = [{ t0: 0, dur: 0, p0, v0, a: 0 }];
  if (D < 1e-9 || v < 1e-9) {
    // Nothing to do: just brake to zero.
    if (Math.abs(v0) > 1e-9) push(segs, Math.abs(v0) / decel, -Math.sign(v0) * decel);
    return new Profile(segs);
  }

  // If moving the wrong way, first stop (this consumes negative distance).
  let dRemain = D;
  let w = w0;
  if (w < 0) {
    const tStop = -w / decel;
    push(segs, tStop, dir * decel);
    dRemain += (w * w) / (2 * decel);
    w = 0;
  }
  // Peak speed reachable given accel up and decel down within dRemain.
  const needStop = (w * w) / (2 * decel);
  if (needStop >= dRemain) {
    // Already too fast to stop in time: decelerate as hard as needed (overshoot-free).
    const dNeeded = (w * w) / (2 * dRemain);
    push(segs, w / dNeeded, -dir * dNeeded);
    return new Profile(segs);
  }
  let vp: number;
  if (w <= v) {
    vp = Math.sqrt((dRemain + (w * w) / (2 * accel)) / (1 / (2 * accel) + 1 / (2 * decel)));
    vp = Math.min(vp, v);
  } else {
    vp = v; // faster than cruise: slow down to cruise first
  }
  const aUp = w <= vp ? accel : decel;
  const t1 = Math.abs(vp - w) / aUp;
  const d1 = ((w + vp) / 2) * t1;
  const t3 = vp / decel;
  const d3 = (vp / 2) * t3;
  const d2 = Math.max(0, dRemain - d1 - d3);
  const t2 = vp > 0 ? d2 / vp : 0;
  if (t1 > 0) push(segs, t1, dir * Math.sign(vp - w) * aUp);
  if (t2 > 0) push(segs, t2, 0);
  if (t3 > 0) push(segs, t3, -dir * decel);
  return new Profile(segs);
}

/** Run at `speed` (signed) forever, ramping from v0 with the given acceleration. */
export function runProfile(p0: number, v0: number, speed: number, accel: number): Profile {
  const segs: Segment[] = [{ t0: 0, dur: 0, p0, v0, a: 0 }];
  const dv = speed - v0;
  if (Math.abs(dv) > 1e-9) push(segs, Math.abs(dv) / accel, Math.sign(dv) * accel);
  push(segs, Infinity, 0);
  return new Profile(segs);
}

/** Run at `speed` for `duration` seconds total, decelerating to stop at the end. */
export function timeProfile(p0: number, v0: number, speed: number, duration: number, accel: number, decel: number): Profile {
  const segs: Segment[] = [{ t0: 0, dur: 0, p0, v0, a: 0 }];
  const v = speed;
  // Find cruise speed vp (same sign as speed) such that ramp up + cruise + ramp down fits in duration.
  const tUp = Math.abs(v - v0) / accel;
  const tDown = Math.abs(v) / decel;
  if (tUp + tDown <= duration) {
    if (tUp > 0) push(segs, tUp, Math.sign(v - v0) * accel);
    push(segs, duration - tUp - tDown, 0);
    if (tDown > 0) push(segs, tDown, -Math.sign(v) * decel);
  } else {
    // Triangle: solve for the peak so up + down == duration (assuming v0 and v same sign or v0 = 0).
    const s = Math.sign(v) || 1;
    const w0 = v0 * s;
    // (vp - w0)/a + vp/d = T  -> vp = (T + w0/a) / (1/a + 1/d)
    let vp = (duration + w0 / accel) / (1 / accel + 1 / decel);
    vp = Math.max(0, Math.min(vp, Math.abs(v)));
    const t1 = Math.max(0, (vp - w0) / accel);
    if (t1 > 0) push(segs, t1, s * accel);
    push(segs, vp / decel, -s * decel);
  }
  return new Profile(segs);
}

/** Hold a fixed position. */
export function holdProfile(p: number): Profile {
  return new Profile([{ t0: 0, dur: 0, p0: p, v0: 0, a: 0 }]);
}
