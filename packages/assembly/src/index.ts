// LDraw model -> articulated physics model.
//
// 1. Every placed part's snaps (studs, anti-studs, pin holes, pins, axles, axle holes) are
//    transformed into the model frame and matched male->female when coaxial and overlapping.
// 2. Matches classify as rigid (stud clutch, axle in axle hole) or revolute (pin/axle in a
//    round hole). Parts are unioned into rigid clusters; two clusters linked by hinges on two
//    or more distinct axis lines are also rigid. Pins/axles merge into a neighbour.
// 3. SPIKE motors are split into housing + rotor nodes joined by a motorized revolute joint.
// 4. Each cluster becomes a body with box/cylinder colliders and real-part visuals.
//
// Frames: LDraw model frame (LDU, -Y up, front -Z) -> robot frame (mm, +Y up, forward -Z)
// via (x, y, z) -> (-x, -y, z) * 0.4.

import { type Library, type Mat4, type PlacedPart, type Snap, flatten, mul, normName, splitMpd } from "@fll-sim/ldraw";
import type { BodySpec, MotorJointSpec, FreeJointSpec, Port, RobotModel, SensorSpec, ShapeSpec } from "@fll-sim/sim";
import type { Quat } from "@fll-sim/units";
import { analyzePart, type Box, type PartInfo, type Vec3 } from "./analyze";

export { analyzePart } from "./analyze";
export type { PartInfo } from "./analyze";

export const LDU = 0.4;

// ---- model parsing (with FLL Sim port metadata) ------------------------------------------------
export interface ModelPart extends PlacedPart {
  /** Port for electronics: "0 !FLLSIM PORT A" on the line before the part. */
  port?: Port;
}

/** Parse an .ldr/.mpd (including Studio .io exports saved as .mpd) into placed parts. */
export function parseModel(lib: Library, text: string): { parts: ModelPart[]; local: Map<string, string>; missing: string[] } {
  const { main, files } = splitMpd(text);
  const r = flatten(lib, main, 16, { collectParts: true, geometry: false, local: files });
  // Port annotations ("0 !FLLSIM PORT X" before a part line in the main file), keyed by the
  // part's position so they stay attached even if other lines fail to load.
  const portAt = new Map<string, Port>();
  let pending: Port | undefined;
  for (const line of (files.get(main) ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*0\s+!FLLSIM\s+PORT\s+([A-F])/i);
    if (m) pending = m[1].toUpperCase() as Port;
    else if (/^\s*1\s/.test(line)) {
      const t = line.trim().split(/\s+/);
      if (pending) portAt.set(`${normName(t.slice(14).join(" "))}@${Number(t[2]).toFixed(1)},${Number(t[3]).toFixed(1)},${Number(t[4]).toFixed(1)}`, pending);
      pending = undefined;
    }
  }
  const parts: ModelPart[] = r.parts.map((p) => ({ ...p, port: portAt.get(`${p.file}@${p.m[3].toFixed(1)},${p.m[7].toFixed(1)},${p.m[11].toFixed(1)}`) }));
  const notParts = [...new Set(r.missing)];
  return { parts, local: files, missing: notParts };
}

export function serializeModel(parts: ModelPart[], name = "robot.ldr"): string {
  const out = [`0 ${name.replace(/\.ldr$/i, "")}`, `0 Name: ${name}`, "0 Author: FLL Sim", ""];
  for (const p of parts) {
    if (p.port) out.push(`0 !FLLSIM PORT ${p.port}`);
    const m = p.m;
    const f = (v: number) => +v.toFixed(4);
    out.push(`1 ${p.color} ${f(m[3])} ${f(m[7])} ${f(m[11])} ${f(m[0])} ${f(m[1])} ${f(m[2])} ${f(m[4])} ${f(m[5])} ${f(m[6])} ${f(m[8])} ${f(m[9])} ${f(m[10])} ${p.file}`);
  }
  return out.join("\n") + "\n";
}

// ---- snap geometry ---------------------------------------------------------------------------------
interface Sec { shape: string; r: number; len: number }
export interface WSnap {
  part: number;
  node: number; // physics node index (part, or motor rotor)
  gender: "M" | "F";
  o: Vec3; // origin (model frame, LDU)
  a: Vec3; // unit axis
  t0: number; // extent along axis relative to o
  t1: number;
  r: number; // max radius
  axle: boolean; // has axle ("A") sections
  round: boolean; // has round ("R") sections
  stud: boolean;
  friction: boolean;
}

function parseSecs(secs: string, yScale: number): Sec[] {
  const tok = secs.trim().split(/\s+/);
  const out: Sec[] = [];
  for (let i = 0; i + 2 < tok.length; i += 3) out.push({ shape: tok[i], r: Number(tok[i + 1]), len: Number(tok[i + 2]) * yScale });
  return out;
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scalev = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function worldSnapFor(s: Snap, m: Mat4, part: number, node: number, friction: boolean): WSnap | null {
  if (s.kind !== "cyl" || !s.secs) return null;
  const w = mul(m, s.m);
  const ycol: Vec3 = [w[1], w[5], w[9]];
  const yScale = Math.hypot(...ycol) || 1;
  const secs = parseSecs(s.secs, yScale);
  if (!secs.length) return null;
  const L = secs.reduce((a, x) => a + x.len, 0);
  const a = norm(ycol);
  const [t0, t1] = s.center ? [-L / 2, L / 2] : [-L, 0];
  return {
    part, node, gender: s.gender, o: [w[3], w[7], w[11]], a, t0, t1,
    r: Math.max(...secs.map((x) => x.r)),
    axle: secs.some((x) => x.shape === "A"),
    round: secs.some((x) => x.shape === "R"),
    stud: /stud/i.test(s.id ?? "") || (s.caps === "one" && L <= 4.5 && secs.every((x) => x.shape === "R")),
    friction,
  };
}

export type ConnKind = "rigid" | "revolute";
export interface Connection { a: number; b: number; kind: ConnKind; point: Vec3; axis: Vec3; friction: boolean }

/** Find male/female snap matches between different nodes. */
export function findConnections(snaps: WSnap[]): Connection[] {
  const cell = 40;
  const key = (p: Vec3) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  const females = new Map<string, WSnap[]>();
  for (const s of snaps) if (s.gender === "F") {
    // index the whole extent so long holes are found from any side
    const steps = Math.max(1, Math.ceil((s.t1 - s.t0) / cell));
    const keys = new Set<string>();
    for (let i = 0; i <= steps; i++) keys.add(key(addv(s.o, scalev(s.a, s.t0 + ((s.t1 - s.t0) * i) / steps))));
    for (const k of keys) (females.get(k) ?? females.set(k, []).get(k)!).push(s);
  }
  const out: Connection[] = [];
  const seen = new Set<string>();
  for (const m of snaps) {
    if (m.gender !== "M") continue;
    const cands = new Set<WSnap>();
    const steps = Math.max(1, Math.ceil((m.t1 - m.t0) / cell));
    for (let i = 0; i <= steps; i++) {
      const p = addv(m.o, scalev(m.a, m.t0 + ((m.t1 - m.t0) * i) / steps));
      const [cx, cy, cz] = [Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
        for (const f of females.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) cands.add(f);
    }
    for (const f of cands) {
      if (f.node === m.node || f.part === m.part) continue;
      if (Math.abs(Math.abs(dot(m.a, f.a)) - 1) > 0.01) continue; // parallel
      const d = sub(m.o, f.o);
      const perp = sub(d, scalev(f.a, dot(d, f.a)));
      if (Math.hypot(...perp) > 1.5) continue; // coaxial
      if (m.r > f.r + 0.6) continue; // fits
      // overlap along the shared axis
      const s = dot(m.a, f.a) > 0 ? 1 : -1;
      const mo = dot(d, f.a);
      const m0 = mo + Math.min(m.t0 * s, m.t1 * s), m1 = mo + Math.max(m.t0 * s, m.t1 * s);
      const overlap = Math.min(m1, f.t1) - Math.max(m0, f.t0);
      if (overlap < 0.9) continue;
      const k = `${Math.min(m.node, f.node)}-${Math.max(m.node, f.node)}-${Math.round(dot(m.o, f.a))}-${key(m.o)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const rigid = m.stud || f.stud || (m.axle && f.axle && !f.round) || (m.axle && f.axle && !m.round);
      const mid = addv(f.o, scalev(f.a, (Math.max(m0, f.t0) + Math.min(m1, f.t1)) / 2));
      out.push({ a: m.node, b: f.node, kind: rigid ? "rigid" : "revolute", point: mid, axis: f.a, friction: m.friction || f.friction });
    }
  }
  return out;
}

// ---- clustering -------------------------------------------------------------------------------------
class DSU {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.p[x] !== x) x = this.p[x] = this.p[this.p[x]];
    return x;
  }
  union(a: number, b: number) {
    this.p[this.find(a)] = this.find(b);
  }
}

/** Distinct axis lines among revolute connections. */
function distinctAxes(conns: Connection[]): number {
  const lines: { p: Vec3; a: Vec3 }[] = [];
  for (const c of conns) {
    const same = lines.some((l) => Math.abs(Math.abs(dot(l.a, c.axis)) - 1) < 0.01 && Math.hypot(...cross(sub(c.point, l.p), l.a)) < 2);
    if (!same) lines.push({ p: c.point, a: c.axis });
  }
  return lines.length;
}

export interface AssembleOptions {
  /** Default port assignment for electronics without a !FLLSIM PORT line (in part order). */
  autoPorts?: boolean;
  name?: string;
}

export interface AssemblyReport {
  bodies: number;
  joints: number;
  motors: number;
  loose: number;
  warnings: string[];
}

interface Node { part: number; rotor: boolean }

/** Build a physics RobotModel from placed LDraw parts. */
export function assemble(lib: Library, parts: ModelPart[], o: AssembleOptions = {}): { robot: RobotModel; report: AssemblyReport } {
  const warnings: string[] = [];
  const infos = parts.map((p) => analyzePart(lib, p.file));

  // Nodes: one per part, plus a rotor node per motor.
  const nodes: Node[] = parts.map((_, i) => ({ part: i, rotor: false }));
  const rotorNode = new Map<number, number>();
  infos.forEach((inf, i) => {
    if (inf.electronics?.kind === "motor") {
      rotorNode.set(i, nodes.length);
      nodes.push({ part: i, rotor: true });
    }
  });

  // Snaps in model frame.
  const snaps: WSnap[] = [];
  infos.forEach((inf, i) => {
    const el = inf.electronics;
    for (const s of inf.snaps) {
      const node = el?.kind === "motor" && s.src === el.rotorSrc ? rotorNode.get(i)! : i;
      const w = worldSnapFor(s, parts[i].m, i, node, inf.friction);
      if (w) snaps.push(w);
    }
  });
  const conns = findConnections(snaps);

  // Rigid unions, never merging a motor's housing with its own rotor.
  const dsu = new DSU(nodes.length);
  const forbidden = [...rotorNode.entries()].map(([h, r]) => [h, r] as const);
  const canUnion = (a: number, b: number) => {
    const ra = dsu.find(a), rb = dsu.find(b);
    if (ra === rb) return false;
    for (const [h, r] of forbidden) {
      const fh = dsu.find(h), fr = dsu.find(r);
      if ((fh === ra && fr === rb) || (fh === rb && fr === ra)) return false;
    }
    return true;
  };
  for (const c of conns) if (c.kind === "rigid" && canUnion(c.a, c.b)) dsu.union(c.a, c.b);

  // Connectors (pins/axles): merge into the neighbour they're held most firmly by.
  for (let i = 0; i < parts.length; i++) {
    if (!infos[i].connector) continue;
    const mine = conns.filter((c) => c.a === i || c.b === i);
    if (!mine.length) continue;
    const other = (c: Connection) => (c.a === i ? c.b : c.a);
    const pick = mine.find((c) => c.kind === "rigid") ?? mine.find((c) => c.friction) ?? mine[0];
    if (canUnion(i, other(pick))) dsu.union(i, other(pick));
  }

  // Iterate: clusters joined by hinges on >= 2 distinct axes are rigid.
  for (let iter = 0; iter < 20; iter++) {
    const pairs = new Map<string, Connection[]>();
    for (const c of conns) {
      const a = dsu.find(c.a), b = dsu.find(c.b);
      if (a === b) continue;
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      (pairs.get(k) ?? pairs.set(k, []).get(k)!).push(c);
    }
    let changed = false;
    for (const [k, cs] of pairs) {
      const [a, b] = k.split(",").map(Number);
      if (cs.some((c) => c.kind === "rigid") || distinctAxes(cs) >= 2) {
        if (canUnion(a, b)) {
          dsu.union(a, b);
          changed = true;
        } else if (cs.every((c) => c.kind === "revolute") && distinctAxes(cs) >= 2) warnings.push("A motor's output is locked to its own housing");
      }
    }
    if (!changed) break;
  }

  // Clusters -> bodies.
  const clusterOf = nodes.map((_, i) => dsu.find(i));
  const clusterIds = [...new Set(clusterOf)];
  const bodyIndex = new Map(clusterIds.map((c, i) => [c, i]));

  // Model -> robot frame: C = diag(-1, -1, 1), scale 0.4, then shift so the model rests on y = 0
  // and is centred in x/z.
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  parts.forEach((p, i) => {
    const inf = infos[i];
    for (const corner of corners(inf.min, inf.max)) {
      const w = toRobot(p.m, corner);
      minY = Math.min(minY, w[1]);
      minX = Math.min(minX, w[0]); maxX = Math.max(maxX, w[0]);
      minZ = Math.min(minZ, w[2]); maxZ = Math.max(maxZ, w[2]);
    }
  });
  const shift: Vec3 = [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2];
  const R = (m: Mat4, p: Vec3): Vec3 => addv(toRobot(m, p), shift);

  const bodies: BodySpec[] = clusterIds.map((cid, bi) => ({ id: `body${bi}`, massKg: 0, shapes: [], visuals: [] }));
  const rotorOfBody = new Map<number, { axis: Vec3; inertia: number }>();
  nodes.forEach((n, ni) => {
    const b = bodies[bodyIndex.get(clusterOf[ni])!];
    const p = parts[n.part], inf = infos[n.part];
    const el = inf.electronics;
    const isMotor = el?.kind === "motor";
    // mass split for motors: rotor gets 15 %
    const mass = isMotor ? inf.massKg * (n.rotor ? 0.15 : 0.85) : inf.massKg;
    b.massKg += mass;
    const boxes = isMotor ? (n.rotor ? inf.rotorBoxes ?? [] : inf.boxes) : inf.boxes;
    const col = colorHex(lib, p.color);
    const material = inf.rubber ? "rubber" : "plastic";
    const shapes: ShapeSpec[] = [];
    if (!isMotor && inf.cylinder) {
      const cy = inf.cylinder;
      const axisPart: Vec3 = [0, 0, 0];
      axisPart[cy.axis] = 1;
      shapes.push({ kind: "cylinder", radiusMm: cy.r * LDU, lengthMm: cy.halfLen * 2 * LDU, axis: "y", rot: quatAligningY(dirToRobot(p.m, axisPart)), posMm: v3(R(p.m, cy.c)), color: col, material, massKg: mass });
    } else if (!isMotor && inf.sphere) {
      shapes.push({ kind: "sphere", radiusMm: inf.sphere.r * LDU, posMm: v3(R(p.m, inf.sphere.c)), color: col, material: "steel", massKg: mass });
    } else {
      const vol = boxes.reduce((s, x) => s + x.h[0] * x.h[1] * x.h[2], 0) || 1;
      for (const bx of boxes) shapes.push(boxShape(p.m, bx, R, col, material, (mass * bx.h[0] * bx.h[1] * bx.h[2]) / vol));
    }
    b.shapes.push(...shapes);
    // Visuals (whole part, or the motor's housing / rotor subfile).
    const vis = b.visuals!;
    if (isMotor) {
      const pf = lib.get(p.file)!;
      pf.lines.forEach((l, li) => {
        if (l.t !== 1) return;
        if ((li === el.rotorSrc) !== n.rotor) return;
        vis.push({ file: l.file, color: l.color === 16 ? p.color : l.color, m: visualMatrix(mul(p.m, l.m), shift) });
      });
    } else vis.push({ file: p.file, color: p.color, m: visualMatrix(p.m, shift) });
    if (isMotor && n.rotor) rotorOfBody.set(bodyIndex.get(clusterOf[ni])!, { axis: dirToRobot(p.m, el.axisOut), inertia: motorInertia(el.type) });
  });
  for (const [bi, r] of rotorOfBody) bodies[bi].extraInertia = { axis: { x: r.axis[0], y: r.axis[1], z: r.axis[2] }, kgm2: r.inertia };

  // Motors (ports: annotated, else auto-assigned in part order).
  const motors: MotorJointSpec[] = [];
  const sensors: SensorSpec[] = [];
  const free = ["A", "B", "C", "D", "E", "F"] as Port[];
  const used = new Set(parts.map((p) => p.port).filter(Boolean) as Port[]);
  const nextPort = () => {
    const p = free.find((x) => !used.has(x));
    if (p) used.add(p);
    return p;
  };
  let hub: RobotModel["hub"] | null = null;
  parts.forEach((p, i) => {
    const el = infos[i].electronics;
    if (!el) return;
    if (el.kind === "hub") {
      if (hub) {
        warnings.push("More than one hub: using the first");
        return;
      }
      hub = { body: bodies[bodyIndex.get(clusterOf[i])!].id, posMm: v3(R(p.m, [0, -40, 0])), rot: rotToQuat(p.m) };
      return;
    }
    const port = p.port ?? (o.autoPorts === false ? undefined : nextPort());
    if (!port) {
      warnings.push(`${infos[i].title}: no port assigned`);
      return;
    }
    if (el.kind === "motor") {
      const h = bodies[bodyIndex.get(clusterOf[i])!].id;
      const r = bodies[bodyIndex.get(clusterOf[rotorNode.get(i)!])!].id;
      motors.push({ id: `motor${port}`, housing: h, output: r, anchorMm: v3(R(p.m, el.point)), axisOut: v3(dirToRobot(p.m, el.axisOut)), port, motor: el.type });
    } else if (el.kind === "color" || el.kind === "distance" || el.kind === "force") {
      sensors.push({ port, type: el.kind, body: bodies[bodyIndex.get(clusterOf[i])!].id, posMm: v3(R(p.m, el.point)), dir: v3(dirToRobot(p.m, el.dir)) });
    }
  });
  if (!hub) warnings.push("No SPIKE hub in the model: the program has nothing to run on");

  // Free (unpowered) hinges between clusters.
  const freeJoints: FreeJointSpec[] = [];
  const motorPairs = new Set(motors.map((m) => [m.housing, m.output].sort().join("|")));
  const pairConns = new Map<string, Connection[]>();
  for (const c of conns) {
    const a = bodyIndex.get(dsu.find(c.a))!, b = bodyIndex.get(dsu.find(c.b))!;
    if (a === b) continue;
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    (pairConns.get(k) ?? pairConns.set(k, []).get(k)!).push(c);
  }
  for (const [k, cs] of pairConns) {
    const [a, b] = k.split(",").map(Number);
    if (motorPairs.has([bodies[a].id, bodies[b].id].sort().join("|"))) continue;
    const c = cs[0];
    freeJoints.push({ id: `hinge${freeJoints.length}`, a: bodies[a].id, b: bodies[b].id, anchorMm: v3(addv(toRobotPoint(c.point), shift)), axis: v3(norm(dirToRobotVec(c.axis))), friction: cs.some((x) => x.friction) });
  }

  // Loose bodies (not connected to the hub's body by any path).
  const adj = new Map<string, Set<string>>();
  const link = (x: string, y: string) => {
    (adj.get(x) ?? adj.set(x, new Set()).get(x)!).add(y);
    (adj.get(y) ?? adj.set(y, new Set()).get(y)!).add(x);
  };
  for (const m of motors) link(m.housing, m.output);
  for (const j of freeJoints) link(j.a, j.b);
  const hubBody = (hub as RobotModel["hub"] | null)?.body ?? bodies[0]?.id;
  const reach = new Set<string>([hubBody]);
  const q = [hubBody];
  while (q.length) for (const n of adj.get(q.pop()!) ?? []) if (!reach.has(n)) { reach.add(n); q.push(n); }
  const loose = bodies.filter((b) => !reach.has(b.id)).length;
  if (loose) warnings.push(`${loose} part group${loose > 1 ? "s are" : " is"} not connected to the hub and will fall off`);

  // Footprint.
  let fw = 0, fl = 0, fh = 0;
  for (const b of bodies) for (const s of b.shapes) {
    const r = s.kind === "box" ? Math.max(s.sizeMm.x, s.sizeMm.y, s.sizeMm.z) / 2 : s.radiusMm;
    fw = Math.max(fw, Math.abs(s.posMm.x) + r);
    fl = Math.max(fl, Math.abs(s.posMm.z) + r);
    fh = Math.max(fh, s.posMm.y + r);
  }
  const robot: RobotModel = {
    name: o.name ?? "LDraw robot",
    bodies,
    motors,
    freeJoints,
    sensors,
    hub: hub ?? { body: bodies[0]?.id ?? "body0", posMm: { x: 0, y: 40, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    footprintMm: { w: fw * 2, l: fl * 2, h: fh },
  };
  return { robot, report: { bodies: bodies.length, joints: freeJoints.length, motors: motors.length, loose, warnings } };
}

// ---- frame helpers -------------------------------------------------------------------------------
const C: Vec3 = [-1, -1, 1];
function toRobotPoint(p: Vec3): Vec3 {
  return [p[0] * C[0] * LDU, p[1] * C[1] * LDU, p[2] * C[2] * LDU];
}
function dirToRobotVec(d: Vec3): Vec3 {
  return [d[0] * C[0], d[1] * C[1], d[2] * C[2]];
}
function toRobot(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
  const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
  const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
  return toRobotPoint([x, y, z]);
}
function dirToRobot(m: Mat4, d: Vec3): Vec3 {
  return norm(dirToRobotVec([m[0] * d[0] + m[1] * d[1] + m[2] * d[2], m[4] * d[0] + m[5] * d[1] + m[6] * d[2], m[8] * d[0] + m[9] * d[1] + m[10] * d[2]]));
}
const v3 = (p: Vec3) => ({ x: p[0], y: p[1], z: p[2] });
function corners(min: Vec3, max: Vec3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** Rotation (robot frame) of a part: C * R * C, made proper if the part is mirrored. */
function robotRot(m: Mat4): number[] {
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  // normalize columns (parts may be scaled in LDraw)
  for (let c = 0; c < 3; c++) {
    const l = Math.hypot(r[c], r[3 + c], r[6 + c]) || 1;
    r[c] /= l; r[3 + c] /= l; r[6 + c] /= l;
  }
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i * 3 + j] = C[i] * r[i * 3 + j] * C[j];
  const det = out[0] * (out[4] * out[8] - out[5] * out[7]) - out[1] * (out[3] * out[8] - out[5] * out[6]) + out[2] * (out[3] * out[7] - out[4] * out[6]);
  if (det < 0) for (let i = 0; i < 3; i++) out[i * 3] = -out[i * 3];
  return out;
}

function matToQuat(r: number[]): Quat {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = r;
  const tr = m00 + m11 + m22;
  let x, y, z, w;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4;
  }
  const l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}

const rotToQuat = (m: Mat4) => matToQuat(robotRot(m));

function quatAligningY(d: Vec3): Quat {
  // rotation taking +Y to d
  const y: Vec3 = [0, 1, 0];
  const c = dot(y, d);
  if (c > 0.9999) return { x: 0, y: 0, z: 0, w: 1 };
  if (c < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };
  const ax = norm(cross(y, d));
  const ang = Math.acos(c);
  const s = Math.sin(ang / 2);
  return { x: ax[0] * s, y: ax[1] * s, z: ax[2] * s, w: Math.cos(ang / 2) };
}

function boxShape(m: Mat4, bx: Box, R: (m: Mat4, p: Vec3) => Vec3, color: string, material: "rubber" | "plastic", massKg: number): ShapeSpec {
  const sx = Math.hypot(m[0], m[4], m[8]), sy = Math.hypot(m[1], m[5], m[9]), sz = Math.hypot(m[2], m[6], m[10]);
  return {
    kind: "box",
    sizeMm: { x: bx.h[0] * 2 * sx * LDU, y: bx.h[1] * 2 * sy * LDU, z: bx.h[2] * 2 * sz * LDU },
    posMm: v3(R(m, bx.c)),
    rot: rotToQuat(m),
    color,
    material,
    massKg,
  };
}

/** Row-major 3x4 matrix taking part LDU coordinates to robot mm. */
function visualMatrix(m: Mat4, shift: Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < 3; i++) {
    out.push(C[i] * m[i * 4] * LDU, C[i] * m[i * 4 + 1] * LDU, C[i] * m[i * 4 + 2] * LDU, C[i] * m[i * 4 + 3] * LDU + shift[i]);
  }
  return out;
}

function colorHex(lib: Library, code: number): string {
  const c = lib.color(code).rgb;
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function motorInertia(type: "small" | "medium" | "large") {
  return type === "small" ? 2e-5 : type === "large" ? 8e-5 : 5e-5;
}

export { normName };
export { placeOnSnap, partSnaps, snapFrame, invert, autoFit, type FitCandidate } from "./place";
