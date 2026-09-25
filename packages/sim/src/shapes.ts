// Collider geometry helpers.
import { rotate, type Vec3 } from "@fll-sim/units";
import type { ShapeSpec } from "./model";

/** Axis-aligned bounds (mm, body frame) of each shape. */
export function shapeBounds(s: ShapeSpec): { min: Vec3; max: Vec3 } {
  let h: Vec3;
  if (s.kind === "box") {
    if (!s.rot) h = { x: s.sizeMm.x / 2, y: s.sizeMm.y / 2, z: s.sizeMm.z / 2 };
    else {
      const ax = rotate(s.rot, { x: s.sizeMm.x / 2, y: 0, z: 0 }), ay = rotate(s.rot, { x: 0, y: s.sizeMm.y / 2, z: 0 }), az = rotate(s.rot, { x: 0, y: 0, z: s.sizeMm.z / 2 });
      h = { x: Math.abs(ax.x) + Math.abs(ay.x) + Math.abs(az.x), y: Math.abs(ax.y) + Math.abs(ay.y) + Math.abs(az.y), z: Math.abs(ax.z) + Math.abs(ay.z) + Math.abs(az.z) };
    }
  } else if (s.kind === "sphere") h = { x: s.radiusMm, y: s.radiusMm, z: s.radiusMm };
  else {
    const r = s.radiusMm, l = s.lengthMm / 2;
    h = { x: Math.max(r, l), y: Math.max(r, l), z: Math.max(r, l) };
  }
  const p = s.posMm;
  return { min: { x: p.x - h.x, y: p.y - h.y, z: p.z - h.z }, max: { x: p.x + h.x, y: p.y + h.y, z: p.z + h.z } };
}

/** Corner points (mm, body frame) of a shape's box (cylinders: their bounding box, spheres: 6 poles). */
export function shapeCorners(s: ShapeSpec): Vec3[] {
  const p = s.posMm;
  if (s.kind === "sphere") {
    const r = s.radiusMm;
    return [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map(([x, y, z]) => ({ x: p.x + x, y: p.y + y, z: p.z + z }));
  }
  let h: Vec3;
  if (s.kind === "box") h = { x: s.sizeMm.x / 2, y: s.sizeMm.y / 2, z: s.sizeMm.z / 2 };
  else {
    const r = s.radiusMm, l = s.lengthMm / 2;
    // (unrotated cylinders lie along their axis letter; rotated ones along rot applied to +Y)
    h = s.rot || s.axis === "y" ? { x: r, y: l, z: r } : s.axis === "x" ? { x: l, y: r, z: r } : { x: r, y: r, z: l };
  }
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const c = { x: sx * h.x, y: sy * h.y, z: sz * h.z };
    const w = s.rot ? rotate(s.rot, c) : c;
    out.push({ x: p.x + w.x, y: p.y + w.y, z: p.z + w.z });
  }
  return out;
}
