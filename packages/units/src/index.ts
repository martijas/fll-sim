// Unit conventions used across the simulator.
//
// - App / season data: millimetres, mat frame (origin = mat south-west corner, +x east, +y north).
// - Physics world: metres, right-handed, +x east, +y up, +z south (Three.js convention).
//   World origin is the south-west inside corner of the table border walls, on the table surface.
// - LDraw: LDU, -y up. 1 LDU = 0.4 mm.

export const LDU_MM = 0.4;
export const STUD_MM = 8;
export const PLATE_MM = 3.2;
export const BRICK_MM = 9.6;

export const mmToM = (mm: number) => mm / 1000;
export const mToMm = (m: number) => m * 1000;
export const lduToMm = (ldu: number) => ldu * LDU_MM;
export const studsToMm = (studs: number) => studs * STUD_MM;
export const degToRad = (d: number) => (d * Math.PI) / 180;
export const radToDeg = (r: number) => (r * 180) / Math.PI;

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

/** Placement of the mat inside the table interior, in mm. */
export interface MatPlacement {
  /** Mat SW corner offset from table interior SW corner (mm). */
  offsetX: number;
  offsetY: number;
}

/** Mat-frame point (mm) -> physics world point (m). `h` is height above table surface in mm. */
export function matToWorld(p: { x: number; y: number }, mat: MatPlacement, h = 0): Vec3 {
  return { x: mmToM(mat.offsetX + p.x), y: mmToM(h), z: -mmToM(mat.offsetY + p.y) };
}

/** Physics world point (m) -> mat frame (mm). */
export function worldToMat(w: Vec3, mat: MatPlacement): { x: number; y: number; h: number } {
  return { x: mToMm(w.x) - mat.offsetX, y: -mToMm(w.z) - mat.offsetY, h: mToMm(w.y) };
}

/** Heading in the mat frame (deg, 0 = facing +y/north, positive = counterclockwise seen from above) -> world yaw about +y (rad). */
export function matHeadingToWorldYaw(headingDeg: number): number {
  // Robot local forward is -z (north) at yaw 0; CCW from above is +rotation about +y.
  return degToRad(headingDeg);
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const s = Math.sin(angle / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
}

export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatConj(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = q v q*
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3) => Math.sqrt(dot(a, a));

/** Wrap an angle in degrees into [-180, 180). */
export function wrapDeg(d: number): number {
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return r;
}
