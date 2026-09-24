// Snap-to-snap placement: position a part so one of its snaps lines up with a target snap.
import { type Library, type Mat4, type Snap, flatten, mul } from "@fll-sim/ldraw";

/** Orthonormalize a snap frame (drop scale), keeping its position. */
export function snapFrame(m: Mat4): Mat4 {
  const r = new Float64Array(m);
  for (let c = 0; c < 3; c++) {
    const l = Math.hypot(r[c], r[4 + c], r[8 + c]) || 1;
    r[c] /= l; r[4 + c] /= l; r[8 + c] /= l;
  }
  return r;
}

export function invert(m: Mat4): Mat4 {
  // affine inverse for rotation(+scale) matrices
  const [a, b, c, x, d, e, f, y, g, h, i, z] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const r = [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det, (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
  return new Float64Array([r[0], r[1], r[2], -(r[0] * x + r[1] * y + r[2] * z), r[3], r[4], r[5], -(r[3] * x + r[4] * y + r[5] * z), r[6], r[7], r[8], -(r[6] * x + r[7] * y + r[8] * z)]);
}

/** Rotation about local Y by `deg`, optional 180° flip about X, then offset along Y (LDU). */
function adjust(deg: number, flip: boolean, offset: number): Mat4 {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  const ry = new Float64Array([c, 0, s, 0, 0, 1, 0, offset, -s, 0, c, 0]);
  const fx = flip ? new Float64Array([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0]) : new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  return mul(ry, fx);
}

export interface PlaceOptions {
  angleDeg?: number;
  flip?: boolean;
  offset?: number;
}

/** Part matrix placing `partSnap` (in part frame) onto `target` (model frame). */
export function placeOnSnap(target: Mat4, partSnap: Mat4, o: PlaceOptions = {}): Mat4 {
  return mul(mul(snapFrame(target), adjust(o.angleDeg ?? 0, o.flip ?? false, o.offset ?? 0)), invert(snapFrame(partSnap)));
}

export function partSnaps(lib: Library, file: string): Snap[] {
  return flatten(lib, file, 16, { geometry: false }).snaps.filter((s) => s.kind === "cyl");
}

// ---- automatic fitting ------------------------------------------------------------------------------
import { analyzePart } from "./analyze";
import { findConnectionsForParts } from "./fit";

export interface FitCandidate { m: Mat4; connections: number; overlap: number; score: number }

/**
 * Try every snap of `file` against each target snap (model frame), all 90° rotations, both
 * flips and a few slide offsets; keep the placement with most connections and least overlap.
 */
export function autoFit(
  lib: Library,
  placed: { file: string; m: Mat4 }[],
  file: string,
  targets: Mat4[],
  filter?: (m: Mat4) => boolean,
  offsets = [-20, -10, 0, 10, 20],
  ownFilter?: (s: Snap) => boolean,
): FitCandidate | null {
  const own = partSnaps(lib, file).filter((s) => !ownFilter || ownFilter(s));
  let best: FitCandidate | null = null;
  for (const t of targets)
    for (const s of own)
      for (const angleDeg of [0, 90, 180, 270])
        for (const flip of [false, true])
          for (const offset of offsets) {
            const m = placeOnSnap(t, s.m, { angleDeg, flip, offset });
            if (filter && !filter(m)) continue;
            const { connections, overlap } = findConnectionsForParts(lib, placed, { file, m });
            const score = connections * 10 - overlap;
            if (!best || score > best.score) best = { m, connections, overlap, score };
          }
  return best;
}
export { analyzePart };
