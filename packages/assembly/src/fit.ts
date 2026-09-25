// Helpers for automatic fitting: connections of one candidate part to already placed parts,
// and box overlap (to reject placements that intersect other parts).
//
// Performance: a fitting search evaluates thousands of candidate placements against the same
// placed parts, so their world snaps, boxes and bounds are cached per `placed` array, and each
// candidate is only compared with parts whose bounds come near it.
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { analyzePart, type Box } from "./analyze";
import { findConnections, worldSnapFor, type WSnap } from "./index";

interface AABB { min: number[]; max: number[] }

function worldBoxes(lib: Library, file: string, m: Mat4): AABB[] {
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

function partBounds(lib: Library, file: string, m: Mat4): AABB {
  const a = analyzePart(lib, file);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
    const w = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
  }
  return { min, max };
}

interface PlacedCache { snaps: WSnap[][]; boxes: AABB[][]; bounds: AABB[] }
const cache = new WeakMap<object, PlacedCache>();

function placedCache(lib: Library, placed: { file: string; m: Mat4 }[]): PlacedCache {
  let c = cache.get(placed);
  // the array may have grown since it was cached (callers push into it)
  if (!c || c.bounds.length !== placed.length) {
    c = c ?? { snaps: [], boxes: [], bounds: [] };
    for (let i = c.bounds.length; i < placed.length; i++) {
      const p = placed[i];
      c.snaps.push(analyzePart(lib, p.file).snaps.map((s) => worldSnapFor(s, p.m, i, i, false)).filter((x): x is WSnap => !!x));
      c.boxes.push(worldBoxes(lib, p.file, p.m));
      c.bounds.push(partBounds(lib, p.file, p.m));
    }
    cache.set(placed, c);
  }
  return c;
}

const near = (a: AABB, b: AABB, margin: number) => {
  for (let k = 0; k < 3; k++) if (a.min[k] - margin > b.max[k] || b.min[k] - margin > a.max[k]) return false;
  return true;
};

/** Number of snap connections between `cand` and `placed`, overlapping box volume (LDU³/1000) and engaged depth. */
export function findConnectionsForParts(lib: Library, placed: { file: string; m: Mat4 }[], cand: { file: string; m: Mat4 }) {
  const pc = placedCache(lib, placed);
  const ci = placed.length;
  const cb = partBounds(lib, cand.file, cand.m);
  const nearby: number[] = [];
  for (let i = 0; i < placed.length; i++) if (near(cb, pc.bounds[i], 45)) nearby.push(i);
  const candSnaps = analyzePart(lib, cand.file).snaps.map((s) => worldSnapFor(s, cand.m, ci, ci, false)).filter((x): x is WSnap => !!x);
  const snaps = [...nearby.flatMap((i) => pc.snaps[i]), ...candSnaps];
  const mine = findConnections(snaps).filter((c) => c.a === ci || c.b === ci);
  const connections = mine.length;
  // Parts the candidate plugs into overlap it by design (pins in holes): only count the others.
  const joined = new Set(mine.map((c) => (c.a === ci ? c.b : c.a)));
  const cBoxes = worldBoxes(lib, cand.file, cand.m);
  let overlap = 0;
  const shrink = 5; // voxel boxes overshoot real faces by up to a voxel: allow touching parts
  for (const pi of nearby) {
    if (joined.has(pi) || !near(cb, pc.bounds[pi], 0)) continue;
    for (const b of pc.boxes[pi]) for (const c of cBoxes) {
      let v = 1;
      for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(b.max[k], c.max[k]) - Math.max(b.min[k], c.min[k]) - shrink);
      overlap += v / 1000;
    }
  }
  const depth = mine.reduce((sum, c) => sum + c.depth, 0);
  return { connections, overlap, depth };
}
export { mul };
