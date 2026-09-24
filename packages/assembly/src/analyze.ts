// Per-part physical analysis (cached per file): collision shapes, mass, connection points,
// and the electronics each SPIKE part carries. All geometry here is LDU in the part's LDraw frame.

import { type Library, type Snap, bounds, flatten, normName } from "@fll-sim/ldraw";

export type Vec3 = [number, number, number];

export interface Box { c: Vec3; h: Vec3 } // centre, half-extents (LDU, part frame, axis aligned)

export type Electronics =
  | { kind: "hub" }
  | { kind: "motor"; type: "small" | "medium" | "large"; rotorSrc: number; axisOut: Vec3; point: Vec3 }
  | { kind: "color" | "distance"; point: Vec3; dir: Vec3 }
  | { kind: "force"; point: Vec3; dir: Vec3 };

export interface PartInfo {
  file: string;
  title: string;
  min: Vec3;
  max: Vec3;
  /** Collision shapes. Motors: boxes of the housing only; `rotorBoxes` for the rotating hub. */
  boxes: Box[];
  rotorBoxes?: Box[];
  cylinder?: { axis: 0 | 1 | 2; r: number; halfLen: number; c: Vec3 };
  sphere?: { r: number; c: Vec3 };
  massKg: number;
  snaps: Snap[];
  electronics?: Electronics;
  /** Pins, axles, bushes, axle-pins: merged into a neighbour instead of being their own body. */
  connector: boolean;
  friction: boolean;
  rubber: boolean;
}

// Known masses (kg); others are estimated from voxel volume. Electronics values are estimates
// to be replaced by weighing real parts.
const MASS: Record<string, number> = {
  "45601c01.dat": 0.2, "45601.dat": 0.12, "45610.dat": 0.08, "45601p01.dat": 0.2, "45601p02.dat": 0.2,
  "54696p01.dat": 0.049, "54696p02.dat": 0.049, "54675.dat": 0.072, "69730.dat": 0.072, "68488.dat": 0.036,
  "37308.dat": 0.012, "37316.dat": 0.024, "37312.dat": 0.02,
  "39367p01.dat": 0.021,
};

const ROTOR_SUBFILES = new Set(["u9363p01.dat", "u9363.dat", "u9534p01c01.dat", "u9363p02.dat"]);
const MOTORS: Record<string, "small" | "medium" | "large"> = {
  "54696p01.dat": "medium", "54696p02.dat": "medium", "54696p01c01.dat": "medium", "54696p02c01.dat": "medium",
  "54675.dat": "large", "54675c01.dat": "large", "69730.dat": "large", "69730c01.dat": "large",
  "68488.dat": "small", "68488c01.dat": "small",
};
const HUBS = new Set(["45601c01.dat", "45601.dat", "45601p01.dat", "45601p02.dat"]);

function electronicsFor(lib: Library, file: string): Electronics | undefined {
  const f = normName(file);
  if (HUBS.has(f)) return { kind: "hub" };
  if (MOTORS[f]) {
    const p = lib.get(f)!;
    const rotorSrc = p.lines.findIndex((l) => l.t === 1 && ROTOR_SUBFILES.has(l.file));
    // Output hub sits at -Y (LDraw up) and turns about the part's Y axis.
    return { kind: "motor", type: MOTORS[f], rotorSrc, axisOut: [0, -1, 0], point: [0, -50, 0] };
  }
  if (f === "37308.dat" || f === "37308c01.dat") return { kind: "color", point: [0, 0, -49], dir: [0, 0, -1] };
  if (f === "37316.dat" || f === "37316c01.dat") return { kind: "distance", point: [0, 0, -69], dir: [0, 0, -1] };
  if (f === "37312.dat" || f === "37312c01.dat") return { kind: "force", point: [0, 0, -70], dir: [0, 0, -1] };
  return undefined;
}

// ---- voxelization -------------------------------------------------------------------------------
function voxelBoxes(positions: number[], min: Vec3, max: Vec3, voxel: number): { boxes: Box[]; solidVol: number } {
  const n = [0, 1, 2].map((k) => Math.max(1, Math.ceil((max[k] - min[k]) / voxel) + 2)) as Vec3;
  const o = [0, 1, 2].map((k) => min[k] - voxel) as Vec3;
  const idx = (x: number, y: number, z: number) => (z * n[1] + y) * n[0] + x;
  const grid = new Uint8Array(n[0] * n[1] * n[2]); // 1 = surface, 2 = outside
  const mark = (p: Vec3) => {
    const x = Math.floor((p[0] - o[0]) / voxel), y = Math.floor((p[1] - o[1]) / voxel), z = Math.floor((p[2] - o[2]) / voxel);
    if (x >= 0 && y >= 0 && z >= 0 && x < n[0] && y < n[1] && z < n[2]) grid[idx(x, y, z)] = 1;
  };
  for (let i = 0; i < positions.length; i += 9) {
    const a: Vec3 = [positions[i], positions[i + 1], positions[i + 2]];
    const b: Vec3 = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c: Vec3 = [positions[i + 6], positions[i + 7], positions[i + 8]];
    const len = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
    const steps = Math.max(1, Math.ceil(len / (voxel * 0.5)));
    for (let u = 0; u <= steps; u++)
      for (let v = 0; v <= steps - u; v++) {
        const s = u / steps, t = v / steps;
        mark([a[0] + (b[0] - a[0]) * s + (c[0] - a[0]) * t, a[1] + (b[1] - a[1]) * s + (c[1] - a[1]) * t, a[2] + (b[2] - a[2]) * s + (c[2] - a[2]) * t]);
      }
  }
  // Flood fill the outside from the padded border.
  const stack: number[] = [0];
  grid[0] = 2;
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % n[0], y = Math.floor(k / n[0]) % n[1], z = Math.floor(k / (n[0] * n[1]));
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const X = x + dx, Y = y + dy, Z = z + dz;
      if (X < 0 || Y < 0 || Z < 0 || X >= n[0] || Y >= n[1] || Z >= n[2]) continue;
      const j = idx(X, Y, Z);
      if (grid[j] === 0) {
        grid[j] = 2;
        stack.push(j);
      }
    }
  }
  // Greedy merge of solid voxels (surface or enclosed) into boxes.
  const solid = (x: number, y: number, z: number) => grid[idx(x, y, z)] !== 2;
  const used = new Uint8Array(grid.length);
  const boxes: Box[] = [];
  let count = 0;
  for (let z = 0; z < n[2]; z++)
    for (let y = 0; y < n[1]; y++)
      for (let x = 0; x < n[0]; x++) {
        if (!solid(x, y, z) || used[idx(x, y, z)]) continue;
        let x1 = x;
        while (x1 + 1 < n[0] && solid(x1 + 1, y, z) && !used[idx(x1 + 1, y, z)]) x1++;
        let y1 = y;
        grow: while (y1 + 1 < n[1]) {
          for (let xx = x; xx <= x1; xx++) if (!solid(xx, y1 + 1, z) || used[idx(xx, y1 + 1, z)]) break grow;
          y1++;
        }
        let z1 = z;
        growz: while (z1 + 1 < n[2]) {
          for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) if (!solid(xx, yy, z1 + 1) || used[idx(xx, yy, z1 + 1)]) break growz;
          z1++;
        }
        for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[idx(xx, yy, zz)] = 1;
        count += (x1 - x + 1) * (y1 - y + 1) * (z1 - z + 1);
        boxes.push({
          c: [o[0] + ((x + x1 + 1) / 2) * voxel, o[1] + ((y + y1 + 1) / 2) * voxel, o[2] + ((z + z1 + 1) / 2) * voxel],
          h: [((x1 - x + 1) * voxel) / 2, ((y1 - y + 1) * voxel) / 2, ((z1 - z + 1) * voxel) / 2],
        });
      }
  return { boxes, solidVol: count * voxel ** 3 };
}

/** Voxelize at increasing coarseness until the box count is manageable. */
function collisionBoxes(positions: number[], maxBoxes = 24): { boxes: Box[]; solidVol: number } {
  if (!positions.length) return { boxes: [], solidVol: 0 };
  const b = bounds(positions);
  const ext = Math.max(...[0, 1, 2].map((k) => b.max[k] - b.min[k]));
  let voxel = Math.max(4, ext / 40);
  let best = voxelBoxes(positions, b.min, b.max, voxel);
  const vol = best.solidVol;
  while (best.boxes.length > maxBoxes && voxel < ext) {
    voxel *= 1.5;
    best = voxelBoxes(positions, b.min, b.max, voxel);
  }
  // Keep the fine-voxel volume for mass (coarse voxels overestimate).
  return { boxes: best.boxes, solidVol: vol };
}

const LDU3_TO_MM3 = 0.4 ** 3;
const ABS_KG_PER_MM3 = 1.05e-6;
/** Fine voxels still include some air around thin walls. */
const FILL = 0.31;

const cache = new WeakMap<Library, Map<string, PartInfo>>();

export function analyzePart(lib: Library, file: string): PartInfo {
  const f = normName(file);
  let m = cache.get(lib);
  if (!m) cache.set(lib, (m = new Map()));
  const hit = m.get(f);
  if (hit) return hit;

  const part = lib.get(f);
  const title = part?.title ?? f;
  const el = electronicsFor(lib, f);
  const full = flatten(lib, f, 16, {});
  const bb = full.mesh.positions.length ? bounds(full.mesh.positions) : { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3 };
  const lower = title.toLowerCase();
  const connector = /^technic (pin|axle|bush)|^technic axle|axle pin|^technic pin/.test(lower) && !/connector|joiner|beam|block/.test(lower);
  const friction = /friction/.test(lower);
  const rubber = /tyre|tire|rubber|tread|traction/.test(lower) || (/wheel/.test(lower) && /tyre/.test(lower));

  let boxes: Box[] = [];
  let rotorBoxes: Box[] | undefined;
  let solidVol = 0;
  if (el?.kind === "motor") {
    // Split housing / rotor geometry by top-level subfile.
    for (const [i, l] of part!.lines.entries()) {
      if (l.t !== 1) continue;
      const sub = flatten(lib, l.file, 16, {});
      const pos: number[] = [];
      for (let k = 0; k < sub.mesh.positions.length; k += 3) {
        const x = sub.mesh.positions[k], y = sub.mesh.positions[k + 1], z = sub.mesh.positions[k + 2];
        pos.push(l.m[0] * x + l.m[1] * y + l.m[2] * z + l.m[3], l.m[4] * x + l.m[5] * y + l.m[6] * z + l.m[7], l.m[8] * x + l.m[9] * y + l.m[10] * z + l.m[11]);
      }
      const r = collisionBoxes(pos, 16);
      if (i === el.rotorSrc) rotorBoxes = r.boxes;
      else boxes.push(...r.boxes);
      solidVol += r.solidVol;
    }
  } else {
    const r = collisionBoxes(full.mesh.positions);
    boxes = r.boxes;
    solidVol = r.solidVol;
  }

  let cylinder: PartInfo["cylinder"];
  let sphere: PartInfo["sphere"];
  const ext = [0, 1, 2].map((k) => bb.max[k] - bb.min[k]) as Vec3;
  const c = [0, 1, 2].map((k) => (bb.max[k] + bb.min[k]) / 2) as Vec3;
  if (/wheel|tyre|tire/.test(lower) && !/arch|axle|hub|well|cover/.test(lower)) {
    // Round part: axis = the extent that differs from the other two.
    const axis = ([0, 1, 2] as const).reduce((best, k) => {
      const others = [0, 1, 2].filter((j) => j !== k);
      const score = Math.abs(ext[others[0]] - ext[others[1]]) - ext[k] * 0.01;
      const bestOthers = [0, 1, 2].filter((j) => j !== best);
      return score < Math.abs(ext[bestOthers[0]] - ext[bestOthers[1]]) - ext[best] * 0.01 ? k : best;
    }, 2 as 0 | 1 | 2);
    const r = Math.max(...[0, 1, 2].filter((k) => k !== axis).map((k) => ext[k])) / 2;
    cylinder = { axis, r, halfLen: ext[axis] / 2, c };
  } else if (/^ball\b|technic ball\b|ball joint ball/.test(lower) && Math.max(...ext) - Math.min(...ext) < 2) {
    sphere = { r: Math.max(...ext) / 2, c };
  }

  const massKg = MASS[f] ?? Math.max(0.0002, solidVol * LDU3_TO_MM3 * ABS_KG_PER_MM3 * FILL);
  const info: PartInfo = { file: f, title, min: bb.min, max: bb.max, boxes, rotorBoxes, cylinder, sphere, massKg, snaps: full.snaps, electronics: el, connector, friction, rubber };
  m.set(f, info);
  return info;
}
