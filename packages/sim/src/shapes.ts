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
