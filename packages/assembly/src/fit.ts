// Helpers for automatic fitting: connections of one candidate part to already placed parts,
// and box overlap (to reject placements that intersect other parts).
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { analyzePart, type Box } from "./analyze";
import { findConnections, worldSnapFor } from "./index";

function worldBoxes(lib: Library, file: string, m: Mat4): { min: number[]; max: number[] }[] {
  const inf = analyzePart(lib, file);
  const boxes: Box[] = [...inf.boxes, ...(inf.rotorBoxes ?? [])];
  return boxes.map((b) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const p = [b.c[0] + sx * b.h[0], b.c[1] + sy * b.h[1], b.c[2] + sz * b.h[2]];
      const w = [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
    }
    return { min, max };
  });
}

/** Number of snap connections between `cand` and `placed`, and overlapping box volume (LDU³/1000). */
export function findConnectionsForParts(lib: Library, placed: { file: string; m: Mat4 }[], cand: { file: string; m: Mat4 }) {
  const all = [...placed, cand];
  const ci = all.length - 1;
  const snaps = all.flatMap((p, i) => analyzePart(lib, p.file).snaps.map((s) => worldSnapFor(s, p.m, i, i, false)).filter((x): x is NonNullable<typeof x> => !!x));
  const connections = findConnections(snaps).filter((c) => c.a === ci || c.b === ci).length;
  const cb = worldBoxes(lib, cand.file, cand.m);
  let overlap = 0;
  const shrink = 1.5; // allow touching
  for (const p of placed) for (const b of worldBoxes(lib, p.file, p.m)) for (const c of cb) {
    let v = 1;
    for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(b.max[k], c.max[k]) - Math.max(b.min[k], c.min[k]) - shrink);
    overlap += v / 1000;
  }
  return { connections, overlap };
}
export { mul };
