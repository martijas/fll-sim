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

import { BAND_PART, MOUNT_PART, type Library, type Mat4, type PlacedPart, type Snap, flatten, mul, normName, splitMpd } from "@fll-sim/ldraw";
import type { BodySpec, MotorJointSpec, FreeJointSpec, GearSpec, Material, Port, RobotModel, SensorSpec, ShapeSpec } from "@fll-sim/sim";
import type { Quat } from "@fll-sim/units";
import { analyzePart, type Box, type PartInfo, type Vec3 } from "./analyze";
import { invert } from "./place";

export { analyzePart } from "./analyze";
export type { PartInfo } from "./analyze";

export const LDU = 0.4;

// ---- model parsing (with FLL Sim port metadata) ------------------------------------------------
export interface ModelPart extends PlacedPart {
  /** Port for electronics: "0 !FLLSIM PORT A" on the line before the part. */
  port?: Port;
  /** Building-instruction step (1-based), from LDraw "0 STEP" lines. */
  step?: number;
  /** Free-text label from a "0 // label" comment line before the part (e.g. "seed 1"). */
  label?: string;
}

/** Parse an .ldr/.mpd (including Studio .io exports saved as .mpd) into placed parts. */
export function parseModel(lib: Library, text: string): { parts: ModelPart[]; local: Map<string, string>; missing: string[] } {
  const { main, files } = splitMpd(text);
  const r = flatten(lib, main, 16, { collectParts: true, geometry: false, local: files });
  // Port annotations ("0 !FLLSIM PORT X" before a part line in the main file), keyed by the
  // part's position so they stay attached even if other lines fail to load.
  const portAt = new Map<string, Port>();
  const stepAt = new Map<string, number>();
  const labelAt = new Map<string, string>();
  let pendingLabel: string | undefined;
  let pending: Port | undefined;
  let step = 1;
  let sawStep = false;
  for (const line of (files.get(main) ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*0\s+!FLLSIM\s+PORT\s+([A-F])/i);
    const lm = line.match(/^\s*0\s+\/\/\s*(.+?)\s*$/);
    if (lm) pendingLabel = lm[1];
    if (m) pending = m[1].toUpperCase() as Port;
    else if (/^\s*0\s+(STEP|ROTSTEP)\b/i.test(line)) {
      step++;
      sawStep = true;
    } else if (/^\s*1\s/.test(line)) {
      const t = line.trim().split(/\s+/);
      const key = `${normName(t.slice(14).join(" "))}@${Number(t[2]).toFixed(1)},${Number(t[3]).toFixed(1)},${Number(t[4]).toFixed(1)}`;
      if (pending) portAt.set(key, pending);
      if (!stepAt.has(key)) stepAt.set(key, step);
      if (pendingLabel) labelAt.set(key, pendingLabel);
      pending = undefined;
      pendingLabel = undefined;
    }
  }
  const keyOf = (p: PlacedPart) => `${p.file}@${p.m[3].toFixed(1)},${p.m[7].toFixed(1)},${p.m[11].toFixed(1)}`;
  const parts: ModelPart[] = r.parts.map((p) => ({ ...p, port: portAt.get(keyOf(p)), step: sawStep ? stepAt.get(keyOf(p)) : undefined, label: labelAt.get(keyOf(p)) }));
  const notParts = [...new Set(r.missing)];
  return { parts, local: files, missing: notParts };
}

export function serializeModel(parts: ModelPart[], name = "robot.ldr"): string {
  const out = [`0 ${name.replace(/\.ldr$/i, "")}`, `0 Name: ${name}`, "0 Author: FLL Sim", ""];
  const stepped = parts.some((p) => p.step !== undefined);
  let step = 1;
  for (const p of stepped ? [...parts].sort((a, b) => (a.step ?? 1) - (b.step ?? 1)) : parts) {
    while (stepped && (p.step ?? 1) > step) {
      out.push("0 STEP");
      step++;
    }
    if (p.label) out.push(`0 // ${p.label}`);
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
  rMin: number; // smallest radius (the part of a pin/axle that enters a hole)
  axle: boolean; // has axle ("A") sections
  round: boolean; // has round ("R") sections
  stud: boolean;
  friction: boolean;
  /** Sections along the axis as [from, to] intervals relative to `o` (first listed at the +axis end). */
  secs: { shape: string; r: number; t0: number; t1: number }[];
  /** a clip holding a bar */
  clip?: boolean;
  /** click-hinge / hinge-brick fingers (connect only to complementary fingers) */
  finger?: boolean;
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
  if ((s.kind !== "cyl" && s.kind !== "clp" && s.kind !== "fgr") || !s.secs) return null;
  const w = mul(m, s.m);
  const ycol: Vec3 = [w[1], w[5], w[9]];
  const yScale = Math.hypot(...ycol) || 1;
  const secs = parseSecs(s.secs, yScale);
  if (!secs.length) return null;
  const L = secs.reduce((a, x) => a + x.len, 0);
  const a = norm(ycol);
  const [t0, t1] = s.center ? [-L / 2, L / 2] : [-L, 0];
  // LDCad lists sections starting from the snap's +Y end.
  let cur = t1;
  const placedSecs = secs.map((x) => {
    const sec = { shape: x.shape.replace(/_/g, "") || "R", r: x.r, t0: cur - x.len, t1: cur };
    cur -= x.len;
    return sec;
  });
  return {
    secs: placedSecs,
    part, node, gender: s.gender, o: [w[3], w[7], w[11]], a, t0, t1,
    r: Math.max(...secs.map((x) => x.r)),
    rMin: Math.min(...secs.map((x) => x.r)),
    axle: secs.some((x) => x.shape === "A"),
    round: secs.some((x) => x.shape === "R"),
    stud: s.kind === "cyl" && (/stud/i.test(s.id ?? "") || (s.caps === "one" && L <= 4.5 && secs.every((x) => x.shape === "R"))),
    friction,
    clip: s.kind === "clp",
    finger: s.kind === "fgr",
  };
}

export type ConnKind = "rigid" | "revolute";
export interface Connection {
  a: number; b: number; kind: ConnKind; point: Vec3; axis: Vec3;
  /** a friction pin's ridged section turns in the hole */
  friction: boolean;
  /** resisting torque (N·m) when this connection turns, see JOINT_FRICTION */
  frictionNm: number;
  /** only an axle turns in a round hole: it can slide along the hole too */
  slides: boolean;
  /** a stud in an anti-stud (clutch) */
  stud?: boolean;
  /** engaged length (LDU) */ depth: number;
}

/**
 * Turning resistance of Technic connections (N·m per engaged connection). Friction pins (black,
 * blue, dark grey 3L…) have ridges that grip the hole and hold a beam against gravity;
 * frictionless pins (light grey, tan) and axles in round holes turn almost freely.
 * Rough values, to be calibrated against real parts.
 */
export const JOINT_FRICTION = {
  frictionPin: 0.006, freePin: 0.0002, axleInRoundHole: 0.0003,
  /** a bar in a clip turns stiffly and holds its angle */
  clip: 0.01,
  /** a bar in an axle hole, hollow stud or cone: snug */
  barInAxleHole: 0.005,
  /** click hinges / hinge bricks hold their angle (clicks) */
  clickHinge: 0.03,
};

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
      if (!!m.finger !== !!f.finger) continue; // fingers only mesh with fingers
      if (Math.abs(Math.abs(dot(m.a, f.a)) - 1) > 0.01) continue; // parallel
      if ((m.stud || f.stud) && dot(m.a, f.a) < 0) continue; // studs only clip in one direction
      const d = sub(m.o, f.o);
      const perp = sub(d, scalev(f.a, dot(d, f.a)));
      if (Math.hypot(...perp) > 1.5) continue; // coaxial
      if (m.rMin > f.r + 0.6) continue; // the narrowest section must fit the hole
      // overlap along the shared axis
      const s = dot(m.a, f.a) > 0 ? 1 : -1;
      const mo = dot(d, f.a);
      const m0 = mo + Math.min(m.t0 * s, m.t1 * s), m1 = mo + Math.max(m.t0 * s, m.t1 * s);
      const overlap = Math.min(m1, f.t1) - Math.max(m0, f.t0);
      if (overlap < 0.9) continue;
      // A stud has exactly one seated position: the anti-stud's origin (the part's underside)
      // sits on the stud's base (the top surface it stands on).
      if ((m.stud || f.stud) && Math.abs(mo) > 1.5) continue;
      if (m.finger) {
        // complementary fingers: same radius and length, side by side on the same axis
        if (Math.abs(m.r - f.r) > 1 || Math.abs(m.t1 - m.t0 - (f.t1 - f.t0)) > 1.5 || Math.abs(overlap - (f.t1 - f.t0)) > 2) continue;
        const k = `${Math.min(m.node, f.node)}-${Math.max(m.node, f.node)}-${m.o.map((v) => Math.round(v)).join(",")}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const mid = addv(f.o, scalev(f.a, (Math.max(m0, f.t0) + Math.min(m1, f.t1)) / 2));
        out.push({ a: m.node, b: f.node, kind: "revolute", point: mid, axis: f.a, friction: true, frictionNm: JOINT_FRICTION.clickHinge, slides: false, depth: overlap });
        continue;
      }
      // Section by section: what actually sits inside the hole?
      let axleInAxle = 0, roundIn = 0, pinInRound = 0, barInAxle = 0, barSnug = 0, bad = 0;
      if (!(m.stud || f.stud)) {
        for (const ms of m.secs) {
          const a0 = mo + Math.min(ms.t0 * s, ms.t1 * s), a1 = mo + Math.max(ms.t0 * s, ms.t1 * s);
          for (const fs of f.secs) {
            const ov = Math.min(a1, fs.t1) - Math.max(a0, fs.t0);
            if (ov < 0.9) continue;
            const mShape = ms.shape.startsWith("A") ? "A" : "R", fShape = fs.shape.startsWith("A") ? "A" : "R";
            if (ms.r > fs.r + 0.6 && !(mShape === "A" && fShape === "R")) {
              // a wider section (e.g. a collar) inside a narrower hole section
              if (ms.r > fs.r + 2.1) bad += ov;
              continue;
            }
            if (mShape === "A" && fShape === "A") axleInAxle += ov;
            else if (fShape === "A" && ms.r <= 4.5) { roundIn += ov; barInAxle += ov; } // a bar turns in an axle hole
            else if (fShape === "R") {
              roundIn += ov;
              if (mShape === "R") pinInRound += ov;
              if (mShape === "R" && ms.r <= 4.5 && Math.abs(ms.r - fs.r) < 0.6) barSnug += ov; // a bar in a hollow stud / cone
            }
            else bad += ov; // round pin in an axle hole
          }
        }
        if (bad > 2 || axleInAxle + roundIn < 0.9) continue;
      }
      // one connection per (node pair, male snap position): duplicate snap entries don't double count
      const k = `${Math.min(m.node, f.node)}-${Math.max(m.node, f.node)}-${m.o.map((v) => Math.round(v)).join(",")}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const rigid = m.stud || f.stud || axleInAxle >= 0.9;
      const mid = addv(f.o, scalev(f.a, (Math.max(m0, f.t0) + Math.min(m1, f.t1)) / 2));
      // friction only where a friction pin's pin section (not its axle end) turns in the hole
      const friction = (m.friction && pinInRound >= 0.9) || (f.friction && roundIn >= 0.9 && !m.stud);
      const frictionNm = f.clip || m.clip ? JOINT_FRICTION.clip : barInAxle >= 0.9 || barSnug >= 0.9 ? JOINT_FRICTION.barInAxleHole : friction ? JOINT_FRICTION.frictionPin : pinInRound >= 0.9 ? JOINT_FRICTION.freePin : JOINT_FRICTION.axleInRoundHole;
      const slides = !rigid && !m.stud && !f.stud && !m.clip && !f.clip && pinInRound < 0.9 && barInAxle < 0.9 && roundIn >= 0.9;
      out.push({ a: m.node, b: f.node, kind: rigid ? "rigid" : "revolute", point: mid, axis: f.a, friction, frictionNm, slides, stud: m.stud || f.stud, depth: m.stud || f.stud ? overlap : axleInAxle + roundIn });
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
  /**
   * Parts with no working connection (flexible hose segments, decorative pieces without snap
   * data) for which this returns true are glued to whatever they touch. Loose game pieces must
   * return false so they stay free.
   */
  glue?: (part: ModelPart, index: number) => boolean;
  /** Whether glued part `part` may stick to `target` (default: any). */
  glueTo?: (part: ModelPart, target: ModelPart) => boolean;
  /**
   * Small groups (≤ 4 parts) held on by only 1-2 studs can be knocked off: they stay separate
   * bodies with a breakable hold (STUD_CLUTCH_N per stud) instead of joining the rest.
   */
  breakable?: boolean;
  /** Bars in clips, cones and hollow studs don't turn (a mission model's decorations hold firm). */
  lockBars?: boolean;
  /** Parts with the same key become one rigid body (e.g. a game piece), whatever connects them. */
  rigidGroup?: (part: ModelPart) => string | null;
  /** Fewer, bigger colliders: mostly solid parts become a single box (for large field models). */
  coarse?: boolean;
  /** Default port assignment for electronics without a !FLLSIM PORT line (in part order). */
  autoPorts?: boolean;
  name?: string;
  /**
   * A tool put on at a mount (see attachTool): if nothing of it connects to the rest, its part
   * nearest `pointLdu` is held rigidly to the robot's part nearest that point.
   */
  attached?: { parts: (part: ModelPart, index: number) => boolean; pointLdu: Vec3 }[];
}

/** A mount point of a robot or tool (see MOUNT_PART): its name (label) and frame (model LDU). */
export interface Mount { name: string; m: Mat4; part: number }

export interface AssemblyReport {
  bodies: number;
  joints: number;
  motors: number;
  /** meshing gear pairs */
  gears: number;
  loose: number;
  warnings: string[];
  /** Mount points (and the body each is on). */
  mounts?: (Mount & { body: string })[];
}

interface Node { part: number; rotor: boolean }

export const isMount = (p: { file: string }) => normName(p.file) === MOUNT_PART;

/** The mount points in a model, in part order. */
export function findMounts(parts: ModelPart[]): Mount[] {
  const out: Mount[] = [];
  parts.forEach((p, i) => { if (isMount(p)) out.push({ name: (p.label ?? "").trim() || "mount", m: p.m, part: i }); });
  return out;
}

/**
 * Put a tool on a robot: the tool's parts are moved so its mount lies exactly on the robot's
 * mount with the same name (`mount`, or the first name they share). Returns the combined parts
 * (the tool's mounts left out, its parts labelled "[tool:<name>]"), or null if they share none.
 */
export function attachTool(robot: ModelPart[], tool: ModelPart[], toolName: string, mount?: string): { parts: ModelPart[]; mount: string; pointLdu: Vec3 } | null {
  const rm = findMounts(robot), tm = findMounts(tool);
  const pair = rm.flatMap((r) => tm.filter((t) => t.name === r.name && (!mount || r.name === mount)).map((t) => [r, t] as const))[0];
  if (!pair) return null;
  const [r, t] = pair;
  const x = mul(r.m, invert(t.m));
  const tag = `[tool:${toolName}]`;
  const moved = tool.filter((p) => !isMount(p)).map((p) => ({ ...p, m: mul(x, p.m), label: p.label ? `${p.label} ${tag}` : tag, step: undefined }));
  return { parts: [...robot, ...moved], mount: r.name, pointLdu: [r.m[3], r.m[7], r.m[11]] };
}

/** Build a physics RobotModel from placed LDraw parts (mount points are left out of the physics). */
export function assemble(lib: Library, parts: ModelPart[], o: AssembleOptions = {}): { robot: RobotModel; report: AssemblyReport; bodyOfPart: string[]; toModelMm: (ldu: Vec3) => { x: number; y: number; z: number } } {
  const mounts = findMounts(parts);
  if (!mounts.length) return assembleParts(lib, parts, o);
  const keep = parts.map((_, i) => i).filter((i) => !isMount(parts[i]));
  const r = assembleParts(lib, keep.map((i) => parts[i]), { ...o, attached: o.attached?.map((a) => ({ ...a, parts: (p, j) => a.parts(p, keep[j]) })) });
  const bodyOfKept = new Map(keep.map((i, j) => [i, r.bodyOfPart[j]]));
  // a mount belongs to the body of the part nearest it
  const nearest = (m: Mat4) => {
    let best = keep[0], d = Infinity;
    for (const i of keep) {
      const q = parts[i].m, dd = (q[3] - m[3]) ** 2 + (q[7] - m[7]) ** 2 + (q[11] - m[11]) ** 2;
      if (dd < d) { d = dd; best = i; }
    }
    return best;
  };
  const bodyOfPart = parts.map((p, i) => bodyOfKept.get(i) ?? bodyOfKept.get(nearest(p.m))!);
  return { ...r, bodyOfPart, report: { ...r.report, mounts: mounts.map((m) => ({ ...m, body: bodyOfPart[m.part] })) } };
}

function assembleParts(lib: Library, parts: ModelPart[], o: AssembleOptions = {}): { robot: RobotModel; report: AssemblyReport; bodyOfPart: string[]; toModelMm: (ldu: Vec3) => { x: number; y: number; z: number } } {
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
  let conns = findConnections(snaps);
  // "[locked]" in a part's label: it stands in for a part with axle holes (LDraw lacks the real
  // one), so what turns in its round holes is held fast instead.
  const locked = (n: number) => /\[locked\]/.test(parts[nodes[n].part].label ?? "");
  // (lockBars: bars in clips, cones and hollow studs hold firm, e.g. a mission model's decorations)
  const barJoint = (c: Connection) => c.frictionNm === JOINT_FRICTION.clip || c.frictionNm === JOINT_FRICTION.barInAxleHole;
  conns = conns.map((c) => (c.kind === "revolute" && (locked(c.a) || locked(c.b) || (o.lockBars && barJoint(c))) ? { ...c, kind: "rigid" as const, slides: false } : c));

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
  // Strings/chains don't join what they tie: their segments ride along with one end, and the
  // simulator gets a rope between the two ends.
  const ropeGroups = findRopeGroups(parts, infos);
  if (ropeGroups.length) {
    const isRope = (n: number) => infos[nodes[n].part].rope;
    conns = conns.filter((c) => !isRope(c.a) && !isRope(c.b));
    for (const g of ropeGroups) for (const i of g.segments) dsu.union(i, g.tie0);
  }
  // Rubber bands: ride along with what their first end is hooked on (a spring pulls the ends).
  const bandGroups = findBands(parts, infos);
  for (const b of bandGroups) dsu.union(b.part, b.tie0);
  // Weak stud links (1-2 studs between two parts) wait until the end: a small group held on by
  // them can come off (see `breakable`).
  const studsBetween = new Map<string, number>();
  const pairKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (const c of conns) if (c.stud) studsBetween.set(pairKey(c.a, c.b), (studsBetween.get(pairKey(c.a, c.b)) ?? 0) + 1);
  const weak = (c: Connection) => !!o.breakable && !!c.stud && (studsBetween.get(pairKey(c.a, c.b)) ?? 0) <= 2;
  for (const c of conns) if (c.kind === "rigid" && !weak(c) && canUnion(c.a, c.b)) dsu.union(c.a, c.b);

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
      if (cs.some((c) => c.kind === "rigid" && !weak(c)) || distinctAxes(cs.filter((c) => !weak(c))) >= 2) {
        if (canUnion(a, b)) {
          dsu.union(a, b);
          changed = true;
        } else if (cs.every((c) => c.kind === "revolute") && distinctAxes(cs) >= 2) warnings.push("A motor's output is locked to its own housing");
      }
    }
    if (!changed) break;
  }

  // Glue connectionless parts (hoses, decorations without snap data) to what they touch.
  if (o.glue) {
    const boxes = parts.map((p, i) => {
      const inf = infos[i];
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const c of corners(inf.min, inf.max)) {
        const w = [p.m[0] * c[0] + p.m[1] * c[1] + p.m[2] * c[2] + p.m[3], p.m[4] * c[0] + p.m[5] * c[1] + p.m[6] * c[2] + p.m[7], p.m[8] * c[0] + p.m[9] * c[1] + p.m[10] * c[2] + p.m[11]];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
      }
      return { min, max };
    });
    const touching = (a: number, b: number) => {
      // generous: flexible hose segments are drawn with gaps between them
      for (let k = 0; k < 3; k++) if (boxes[a].min[k] > boxes[b].max[k] + 12 || boxes[b].min[k] > boxes[a].max[k] + 12) return false;
      return true;
    };
    for (let pass = 0; pass < 80; pass++) {
      let changed = false;
      // clusters that are connected to something else stay as they are
      const connected = new Set<number>();
      for (const c of conns) {
        const a = dsu.find(c.a), b = dsu.find(c.b);
        if (a !== b) { connected.add(a); connected.add(b); }
      }
      const members = new Map<number, number[]>();
      parts.forEach((_, i) => (members.get(dsu.find(i)) ?? members.set(dsu.find(i), []).get(dsu.find(i))!).push(i));
      for (const [root, idx] of members) {
        if (connected.has(root) || !idx.every((i) => o.glue!(parts[i], i))) continue;
        // prefer gluing onto a non-glue cluster; otherwise onto another glue part (hose chains)
        let target = -1;
        for (const i of idx) for (let j = 0; j < parts.length; j++) {
          if (dsu.find(j) === root || !touching(i, j) || (o.glueTo && !o.glueTo(parts[i], parts[j]))) continue;
          if (target < 0 || !o.glue!(parts[j], j)) target = j;
        }
        if (target >= 0 && canUnion(idx[0], target)) {
          dsu.union(idx[0], target);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // Tools put on at a mount: held to the robot at the mount if none of their parts connect to it.
  for (const at of o.attached ?? []) {
    const inTool = parts.map((p, i) => at.parts(p, i));
    if (!inTool.some(Boolean) || inTool.every(Boolean)) continue;
    // everything connected to the tool (by any joint)
    const comp = new DSU(nodes.length);
    for (const c of conns) comp.union(c.a, c.b);
    for (let i = 0; i < nodes.length; i++) comp.union(i, dsu.find(i));
    const toolRoots = new Set(parts.map((_, i) => i).filter((i) => inTool[i]).map((i) => comp.find(i)));
    if (parts.some((_, i) => !inTool[i] && toolRoots.has(comp.find(i)))) continue; // it connects for real
    const d2 = (i: number) => (parts[i].m[3] - at.pointLdu[0]) ** 2 + (parts[i].m[7] - at.pointLdu[1]) ** 2 + (parts[i].m[11] - at.pointLdu[2]) ** 2;
    const pick = (want: boolean) => parts.map((_, i) => i).filter((i) => inTool[i] === want && !infos[i].band && !infos[i].rope).sort((a, b) => d2(a) - d2(b))[0];
    const a = pick(true), b = pick(false);
    if (a !== undefined && b !== undefined && canUnion(a, b)) dsu.union(a, b);
    else warnings.push("A tool is not connected to the robot at its mount");
  }

  // Weak stud links: a small group (≤ 4 parts) held on by ≤ 2 studs stays its own body with a
  // breakable hold; everything else is joined as usual.
  const weakHolds: { a: number; b: number; point: Vec3; studs: number }[] = [];
  if (o.breakable) {
    const size = new Map<number, number>();
    parts.forEach((_, i) => size.set(dsu.find(i), (size.get(dsu.find(i)) ?? 0) + 1));
    const links = new Map<string, { a: number; b: number; pts: Vec3[] }>();
    for (const c of conns) {
      if (c.kind !== "rigid" || !weak(c)) continue;
      const ra = dsu.find(c.a), rb = dsu.find(c.b);
      if (ra === rb) continue;
      const k = pairKey(ra, rb);
      const l = links.get(k) ?? { a: c.a, b: c.b, pts: [] };
      l.pts.push(c.point);
      links.set(k, l);
    }
    // a group is detachable when it's small and its only grip on the rest is ≤ 2 studs to one neighbour
    const grip = new Map<number, { studs: number; neighbours: Set<number> }>();
    for (const l of links.values()) {
      const ra = dsu.find(l.a), rb = dsu.find(l.b);
      for (const [x, y] of [[ra, rb], [rb, ra]]) {
        const g = grip.get(x) ?? { studs: 0, neighbours: new Set<number>() };
        g.studs += l.pts.length;
        g.neighbours.add(y);
        grip.set(x, g);
      }
    }
    const detachable = (r: number) => {
      const g = grip.get(r);
      return !!g && (size.get(r) ?? 1) <= 4 && g.studs <= 2 && g.neighbours.size === 1;
    };
    const held: typeof links extends Map<string, infer V> ? V[] : never = [];
    for (const l of links.values()) {
      const ra = dsu.find(l.a), rb = dsu.find(l.b);
      const da = detachable(ra), db = detachable(rb);
      // (two equally small bits holding only each other: one piece)
      if (da !== db || (da && db && (size.get(ra) ?? 1) !== (size.get(rb) ?? 1))) held.push(l);
      else if (canUnion(l.a, l.b)) dsu.union(l.a, l.b);
    }
    for (const l of held) {
      const p = l.pts.reduce((acc, x) => addv(acc, scalev(x, 1 / l.pts.length)), [0, 0, 0] as Vec3);
      weakHolds.push({ a: l.a, b: l.b, point: p, studs: l.pts.length });
    }
  }

  if (o.rigidGroup) {
    const first = new Map<string, number>();
    parts.forEach((p, i) => {
      const k = o.rigidGroup!(p);
      if (k === null) return;
      if (first.has(k)) dsu.union(first.get(k)!, i);
      else first.set(k, i);
    });
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
    const material = inf.material;
    const shapes: ShapeSpec[] = [];
    if (inf.rope || inf.band) {
      // (a string/chain segment or a rubber band: drawn, but it doesn't collide; the rope or
      // spring does its job)
    } else if (!isMotor && inf.cylinder) {
      const cy = inf.cylinder;
      const axisPart: Vec3 = [0, 0, 0];
      axisPart[cy.axis] = 1;
      shapes.push({ kind: "cylinder", radiusMm: cy.r * LDU, lengthMm: cy.halfLen * 2 * LDU, axis: "y", rot: quatAligningY(dirToRobot(p.m, axisPart)), posMm: v3(R(p.m, cy.c)), color: col, material, massKg: mass });
    } else if (!isMotor && inf.sphere) {
      shapes.push({ kind: "sphere", radiusMm: inf.sphere.r * LDU, posMm: v3(R(p.m, inf.sphere.c)), color: col, material: "steel", massKg: mass });
    } else {
      const vol = boxes.reduce((s, x) => s + x.h[0] * x.h[1] * x.h[2], 0) || 1;
      const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b.c[k] - b.h[k])));
      const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.c[k] + b.h[k])));
      const hull = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) / 8;
      // coarse: a mostly solid part (brick, plate, beam) becomes one oriented box
      if (o.coarse && boxes.length > 1 && vol / hull > 0.55)
        shapes.push(boxShape(p.m, { c: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as Vec3, h: [0, 1, 2].map((k) => (hi[k] - lo[k]) / 2) as Vec3 }, R, col, material, mass));
      else for (const bx of boxes) shapes.push(boxShape(p.m, bx, R, col, material, (mass * bx.h[0] * bx.h[1] * bx.h[2]) / vol));
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
    if (p.label && !(b.labels ??= []).includes(p.label)) b.labels.push(p.label);
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
    const hinge: FreeJointSpec = { id: `hinge${freeJoints.length}`, a: bodies[a].id, b: bodies[b].id, anchorMm: v3(addv(toRobotPoint(c.point), shift)), axis: v3(norm(dirToRobotVec(c.axis))), friction: cs.some((x) => x.friction), frictionNm: cs.filter((x) => x.kind === "revolute").reduce((t, x) => t + x.frictionNm, 0) };
    const rev = cs.filter((x) => x.kind === "revolute");
    if (rev.length && rev.every((x) => x.slides)) {
      const range = slideRange(parts, infos, rev, (i) => bodyIndex.get(clusterOf[i])!);
      if (range) hinge.slide = { body: bodies[bodyIndex.get(clusterOf[rev[0].a])!].id, minMm: range[0] * LDU, maxMm: range[1] * LDU, frictionN: AXLE_SLIDE_FRICTION_N };
    }
    freeJoints.push(hinge);
  }

  const gears = findGears(parts, infos, parts.map((_, i) => bodies[bodyIndex.get(clusterOf[i])!].id), freeJoints, motors, shift);
  const bodyOfIdx = (i: number) => bodies[bodyIndex.get(clusterOf[i])!].id;
  const ropes = ropeGroups
    .filter((g) => bodyOfIdx(g.tie0) !== bodyOfIdx(g.tie1))
    .map((g) => ({ a: bodyOfIdx(g.tie0), b: bodyOfIdx(g.tie1), anchorAMm: v3(addv(toRobotPoint(g.end0), shift)), anchorBMm: v3(addv(toRobotPoint(g.end1), shift)), lengthMm: g.length * LDU }));
  const bands = bandGroups
    .filter((g) => bodyOfIdx(g.tie0) !== bodyOfIdx(g.tie1))
    .map((g) => ({ a: bodyOfIdx(g.tie0), b: bodyOfIdx(g.tie1), anchorAMm: v3(addv(toRobotPoint(g.end0), shift)), anchorBMm: v3(addv(toRobotPoint(g.end1), shift)), restMm: g.rest * LDU, nPerMm: g.nPerMm }));
  const welds = weakHolds
    .filter((h) => dsu.find(h.a) !== dsu.find(h.b))
    .map((h) => ({ a: bodies[bodyIndex.get(clusterOf[h.a])!].id, b: bodies[bodyIndex.get(clusterOf[h.b])!].id, pointMm: v3(addv(toRobotPoint(h.point), shift)), breakN: h.studs * STUD_CLUTCH_N }));

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
    gears,
    ...(welds.length ? { welds } : {}),
    ...(ropes.length ? { ropes } : {}),
    ...(bands.length ? { bands } : {}),
    sensors,
    hub: hub ?? { body: bodies[0]?.id ?? "body0", posMm: { x: 0, y: 40, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 } },
    footprintMm: { w: fw * 2, l: fl * 2, h: fh },
  };
  const bodyOfPart = parts.map((_, i) => bodies[bodyIndex.get(clusterOf[i])!].id);
  return { robot, report: { bodies: bodies.length, joints: freeJoints.length, motors: motors.length, gears: gears.length, loose, warnings }, bodyOfPart, toModelMm: (p: Vec3) => v3(addv(toRobotPoint(p), shift)) };
}

/**
 * Strings and chains: their segments are grouped into ropes; each rope ties the two parts at its
 * ends (whatever touches the end segments) and is as long as the path along its segments (LDU).
 */
interface RopeGroup { segments: number[]; tie0: number; tie1: number; end0: Vec3; end1: Vec3; length: number }
function findRopeGroups(parts: ModelPart[], infos: PartInfo[]): RopeGroup[] {
  const centre = (i: number): Vec3 => {
    const inf = infos[i], m = parts[i].m;
    const c = [(inf.min[0] + inf.max[0]) / 2, (inf.min[1] + inf.max[1]) / 2, (inf.min[2] + inf.max[2]) / 2];
    return [m[0] * c[0] + m[1] * c[1] + m[2] * c[2] + m[3], m[4] * c[0] + m[5] * c[1] + m[6] * c[2] + m[7], m[8] * c[0] + m[9] * c[1] + m[10] * c[2] + m[11]];
  };
  const box = (i: number) => {
    const inf = infos[i], m = parts[i].m;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const k of corners(inf.min, inf.max)) {
      const w = [m[0] * k[0] + m[1] * k[1] + m[2] * k[2] + m[3], m[4] * k[0] + m[5] * k[1] + m[6] * k[2] + m[7], m[8] * k[0] + m[9] * k[1] + m[10] * k[2] + m[11]];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], w[a]); hi[a] = Math.max(hi[a], w[a]); }
    }
    return { lo, hi };
  };
  const touch = (x: ReturnType<typeof box>, y: ReturnType<typeof box>, tol: number) => [0, 1, 2].every((a) => x.lo[a] <= y.hi[a] + tol && y.lo[a] <= x.hi[a] + tol);
  const seg = parts.map((_, i) => i).filter((i) => infos[i].rope);
  if (!seg.length) return [];
  const boxes = new Map(seg.map((i) => [i, box(i)]));
  const group = new Map<number, number>(seg.map((i) => [i, i]));
  const find = (x: number): number => (group.get(x) === x ? x : (group.set(x, find(group.get(x)!)), group.get(x)!));
  for (const i of seg) for (const j of seg) if (i < j && touch(boxes.get(i)!, boxes.get(j)!, 6)) group.set(find(i), find(j));
  const groups = new Map<number, number[]>();
  for (const i of seg) (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i);
  const out: RopeGroup[] = [];
  for (const g of groups.values()) {
    // walk the rope from one end: start at the segment furthest from the group's middle
    const cs = new Map(g.map((i) => [i, centre(i)]));
    const mid = g.reduce((acc, i) => addv(acc, scalev(cs.get(i)!, 1 / g.length)), [0, 0, 0] as Vec3);
    let cur = g.reduce((best, i) => (Math.hypot(...sub(cs.get(i)!, mid)) > Math.hypot(...sub(cs.get(best)!, mid)) ? i : best), g[0]);
    const path = [cur];
    const left = new Set(g.filter((i) => i !== cur));
    let length = 0;
    while (left.size) {
      let next = -1, dmin = Infinity;
      for (const j of left) { const d = Math.hypot(...sub(cs.get(j)!, cs.get(cur)!)); if (d < dmin) { dmin = d; next = j; } }
      length += dmin;
      left.delete(next);
      path.push(next);
      cur = next;
    }
    const tiedTo = (end: number) => {
      const be = boxes.get(end)!;
      let best = -1, dmin = Infinity;
      parts.forEach((_, j) => {
        if (infos[j].rope || !touch(be, box(j), 6)) return;
        const d = Math.hypot(...sub(centre(j), cs.get(end)!));
        if (d < dmin) { dmin = d; best = j; }
      });
      return best;
    };
    const e0 = path[0], e1 = path[path.length - 1];
    const tie0 = tiedTo(e0), tie1 = tiedTo(e1);
    if (tie0 < 0 || tie1 < 0) continue;
    out.push({ segments: g, tie0, tie1, end0: cs.get(e0)!, end1: cs.get(e1)!, length });
  }
  return out;
}

/** A rubber band part stretched from `a` to `b` (model frame, LDU). */
export function bandPart(a: Vec3, b: Vec3, label?: string): ModelPart {
  const x = sub(b, a);
  const u = norm(x);
  // any two unit vectors perpendicular to the band, scaled to its thickness (1.5 LDU radius)
  const helper: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const y = scalev(norm(cross(u, helper)), 1.5), z = scalev(norm(cross(u, norm(cross(u, helper)))), 1.5);
  // (keep it right-handed: det > 0)
  const det = dot(x, cross(y, z));
  const zz = det < 0 ? scalev(z, -1) : z;
  return { file: BAND_PART, color: 0, m: new Float64Array([x[0], y[0], zz[0], a[0], x[1], y[1], zz[1], a[1], x[2], y[2], zz[2], a[2]]), label };
}

/** A rubber band's pull per mm of stretch beyond its rest length (LEGO bands: ~0.02-0.1 N/mm). */
export const BAND_N_PER_MM = 0.05;
/** Unless its label says otherwise ("rest=60%"), a band is placed stretched to 1/0.6 of its length. */
const BAND_REST = 0.6;

/**
 * Rubber bands (FLL Sim's band part): the ends are the placement's origin and origin + X column;
 * each end is hooked on the nearest other part there. Label options: "rest=50%" (unstretched
 * length as a share of the placed length), "k=0.08" (N per mm of stretch).
 */
interface BandGroup { part: number; tie0: number; tie1: number; end0: Vec3; end1: Vec3; rest: number; nPerMm: number }
function findBands(parts: ModelPart[], infos: PartInfo[]): BandGroup[] {
  const out: BandGroup[] = [];
  parts.forEach((p, i) => {
    if (!infos[i].band) return;
    const m = p.m;
    const end0: Vec3 = [m[3], m[7], m[11]], end1: Vec3 = [m[3] + m[0], m[7] + m[4], m[11] + m[8]];
    const hookedOn = (pt: Vec3) => {
      let best = -1, dmin = 12; // within 12 LDU of the part's box
      parts.forEach((q, j) => {
        if (infos[j].band || infos[j].rope) return;
        const inf = infos[j], mm = q.m;
        // distance from the point to the part's box, in the part's own frame
        const d = sub(pt, [mm[3], mm[7], mm[11]]);
        const local: Vec3 = [mm[0] * d[0] + mm[4] * d[1] + mm[8] * d[2], mm[1] * d[0] + mm[5] * d[1] + mm[9] * d[2], mm[2] * d[0] + mm[6] * d[1] + mm[10] * d[2]];
        const out3 = [0, 1, 2].map((k) => Math.max(inf.min[k] - local[k], 0, local[k] - inf.max[k]));
        const dist = Math.hypot(...out3);
        if (dist < dmin) { dmin = dist; best = j; }
      });
      return best;
    };
    const tie0 = hookedOn(end0), tie1 = hookedOn(end1);
    if (tie0 < 0 || tie1 < 0) return;
    const len = Math.hypot(m[0], m[4], m[8]);
    const rest = /rest=(\d+(?:\.\d+)?)%/.exec(p.label ?? "");
    const k = /k=(\d+(?:\.\d+)?)/.exec(p.label ?? "");
    out.push({ part: i, tie0, tie1, end0, end1, rest: len * (rest ? Number(rest[1]) / 100 : BAND_REST), nPerMm: k ? Number(k[1]) : BAND_N_PER_MM });
  });
  return out;
}

/** How hard (N) one stud's clutch holds before a part pops off (LEGO: roughly 1-3 N). */
const STUD_CLUTCH_N = 2;

// ---- sliding axles --------------------------------------------------------------------------------
/** An axle slides easily in a round hole (a loose one falls through a beam under its own weight). */
const AXLE_SLIDE_FRICTION_N = 0.005;

/**
 * How far (LDU, along the hole axis, + = the connection's axis direction) the axle side of these
 * axle-in-round-hole connections can slide: until something on the axle (bush, gear, beam…) hits
 * a part of the other body on the axle's line, and never so far that the axle leaves its holes.
 * Null when it can't really move.
 */
function slideRange(parts: ModelPart[], infos: PartInfo[], cs: Connection[], bodyOfPart: (i: number) => number): [number, number] | null {
  const c = cs[0];
  const u = norm(c.axis), P = c.point;
  const axleBody = bodyOfPart(c.a), holeBody = bodyOfPart(c.b);
  const axles = new Set(cs.map((x) => x.a)), holes = new Set(cs.map((x) => x.b));
  // a part's extent along the axis and how far it reaches out from the axis line (LDU)
  const extent = (i: number) => {
    let lo = Infinity, hi = -Infinity, reach = 0, minPerp = Infinity;
    const inf = infos[i], m = parts[i].m;
    for (const k of corners(inf.min, inf.max)) {
      const w: Vec3 = [m[0] * k[0] + m[1] * k[1] + m[2] * k[2] + m[3], m[4] * k[0] + m[5] * k[1] + m[6] * k[2] + m[7], m[8] * k[0] + m[9] * k[1] + m[10] * k[2] + m[11]];
      const d = sub(w, P), t = dot(d, u);
      lo = Math.min(lo, t); hi = Math.max(hi, t);
      const perp = Math.hypot(...sub(d, scalev(u, t)));
      reach = Math.max(reach, perp); minPerp = Math.min(minPerp, perp);
    }
    // on the axle's line: its box (roughly) surrounds the line
    const inf2 = infos[i], mid: Vec3 = [(inf2.min[0] + inf2.max[0]) / 2, (inf2.min[1] + inf2.max[1]) / 2, (inf2.min[2] + inf2.max[2]) / 2];
    const cw: Vec3 = [m[0] * mid[0] + m[1] * mid[1] + m[2] * mid[2] + m[3], m[4] * mid[0] + m[5] * mid[1] + m[6] * mid[2] + m[7], m[8] * mid[0] + m[9] * mid[1] + m[10] * mid[2] + m[11]];
    const dc = sub(cw, P);
    const centreOff = Math.hypot(...sub(dc, scalev(u, dot(dc, u))));
    return { lo, hi, reach, onLine: centreOff < reach - 4 };
  };
  let min = -400, max = 400;
  // stay engaged: at least 4 LDU of axle inside the holes
  const ax = [...axles].map(extent), ho = [...holes].map(extent);
  const a0 = Math.min(...ax.map((e) => e.lo)), a1 = Math.max(...ax.map((e) => e.hi));
  const h0 = Math.min(...ho.map((e) => e.lo)), h1 = Math.max(...ho.map((e) => e.hi));
  max = Math.min(max, h1 - 4 - a0);
  min = Math.max(min, h0 + 4 - a1);
  // stops: wide parts on the axle side vs parts of the hole side, both on the axle's line
  const walls: { lo: number; hi: number }[] = [];
  const blockers: { lo: number; hi: number }[] = [];
  parts.forEach((_, i) => {
    const b = bodyOfPart(i);
    if (b !== axleBody && b !== holeBody) return;
    const e = extent(i);
    if (!e.onLine) return;
    if (b === holeBody) walls.push(e);
    else if (!axles.has(i) && e.reach > 8) blockers.push(e);
  });
  for (const p of blockers)
    for (const w of walls) {
      if (p.hi <= w.lo + 1) max = Math.min(max, w.lo - p.hi);
      else if (p.lo >= w.hi - 1) min = Math.max(min, -(p.lo - w.hi));
      else { min = Math.max(min, 0); max = Math.min(max, 0); } // already interlocked
    }
  if (max - min < 1) return null;
  return [Math.min(0, min), Math.max(0, max)];
}

// ---- gears ----------------------------------------------------------------------------------------
/** Pitch radius of LEGO Technic gears: 1.25 LDU per tooth (8t + 24t axles are 2 studs apart). */
const PITCH_PER_TOOTH = 1.25;
/** A LEGO worm advances the gear one tooth per turn: lead / 2π = one tooth's pitch radius step. */
const WORM_LEAD_PER_RAD = PITCH_PER_TOOTH;
/** Worm drives can't be back-driven (the gear can't turn the worm): extra friction on the worm. */
const WORM_SELF_LOCK_NM = 0.02;

/**
 * Find meshing gear pairs: parallel spur/double-bevel gears whose centre distance matches their
 * teeth, perpendicular bevels whose axes (nearly) meet, and worms beside a perpendicular gear.
 */
function findGears(parts: ModelPart[], infos: PartInfo[], bodyOf: string[], freeJoints: FreeJointSpec[], motors: MotorJointSpec[], shift: Vec3): GearSpec[] {
  interface G { i: number; kind: string; teeth: number; r: number; c: Vec3; a: Vec3; body: string; frame: string; joint?: FreeJointSpec }
  const gs: G[] = [];
  parts.forEach((p, i) => {
    const g = infos[i].gear;
    if (!g) return;
    const c = addv(toRobot(p.m, g.c), shift); // mm, model frame
    const a = norm(dirToRobot(p.m, g.axis));
    // the body it turns in: the hinge (or motor) on its axis
    let frame = bodyOf[i], joint: FreeJointSpec | undefined;
    const onAxis = (anchor: { x: number; y: number; z: number }, axis: { x: number; y: number; z: number }) => {
      if (Math.abs(dot(a, [axis.x, axis.y, axis.z])) < 0.99) return false;
      const d = sub([anchor.x, anchor.y, anchor.z], c);
      return Math.hypot(...sub(d, scalev(a, dot(d, a)))) < 2;
    };
    for (const j of freeJoints) if ((j.a === bodyOf[i] || j.b === bodyOf[i]) && onAxis(j.anchorMm, j.axis)) { frame = j.a === bodyOf[i] ? j.b : j.a; joint = j; break; }
    for (const m of motors) if (m.output === bodyOf[i] && onAxis(m.anchorMm, m.axisOut)) { frame = m.housing; break; }
    gs.push({ i, kind: g.kind, teeth: g.teeth, r: g.teeth * PITCH_PER_TOOTH * LDU, c, a, body: bodyOf[i], frame, joint });
  });
  const out: GearSpec[] = [];
  const mm = (ldu: number) => ldu * LDU;
  for (let x = 0; x < gs.length; x++)
    for (let y = x + 1; y < gs.length; y++) {
      let [g1, g2] = [gs[x], gs[y]];
      if (g1.body === g2.body) continue; // on one rigid body: nothing turns
      if (g2.kind === "worm") [g1, g2] = [g2, g1];
      const d = sub(g2.c, g1.c);
      const along = dot(d, g1.a);
      const radial = sub(d, scalev(g1.a, along));
      const dist = Math.hypot(...radial);
      const par = Math.abs(dot(g1.a, g2.a));
      let ja: Vec3, jb: Vec3;
      if (g1.kind === "worm") {
        if (g2.kind === "worm" || g2.kind === "bevel" || par > 0.05) continue;
        // gear centre beside the worm, within its length, at pitch radius + worm radius
        const toWorm = sub(g1.c, g2.c);
        const perp = sub(toWorm, scalev(g1.a, dot(toWorm, g1.a))); // gear centre -> worm axis line
        const gap = Math.hypot(...perp);
        if (Math.abs(gap - (g2.r + mm(10))) > mm(6) || Math.abs(dot(perp, g2.a)) > mm(6) || Math.abs(along) > mm(24)) continue;
        const u = norm(perp);
        const t = cross(g2.a, u); // gear tooth motion at the contact
        jb = scalev(g2.a, g2.r);
        ja = scalev(g1.a, mm(WORM_LEAD_PER_RAD) * Math.sign(dot(t, g1.a)));
        if (g1.joint) g1.joint.frictionNm = (g1.joint.frictionNm ?? 0) + WORM_SELF_LOCK_NM;
      } else if (par > 0.99) {
        // parallel: spur / double bevel side by side, teeth in the same plane
        if (g1.kind === "bevel" || g2.kind === "bevel") continue;
        if (Math.abs(along) > mm(12) || Math.abs(dist - (g1.r + g2.r)) > mm(3)) continue;
        ja = scalev(g1.a, g1.r);
        jb = scalev(g1.a, -g2.r); // external mesh: opposite turning
      } else if (par < 0.05) {
        // perpendicular bevels: axes meet, each gear's teeth at the other's pitch radius
        if (g1.kind === "spur" || g2.kind === "spur") continue;
        const n = cross(g1.a, g2.a);
        const skew = Math.abs(dot(d, norm(n)));
        const r1 = Math.hypot(...sub(sub(g2.c, g1.c), scalev(g1.a, dot(sub(g2.c, g1.c), g1.a)))); // g2 centre from g1's axis
        const r2 = Math.hypot(...sub(sub(g1.c, g2.c), scalev(g2.a, dot(sub(g1.c, g2.c), g2.a))));
        if (skew > mm(4) || Math.abs(r1 - g1.r) > mm(8) || Math.abs(r2 - g2.r) > mm(8)) continue;
        // contact on g1's rim towards g2; tooth motion t; each lever is its axis × pitch radius
        const u = norm(sub(d, scalev(g1.a, along)));
        const P = addv(g1.c, scalev(u, g1.r));
        const t = cross(g1.a, u);
        ja = scalev(g1.a, g1.r);
        jb = scalev(g2.a, g2.r * Math.sign(dot(cross(sub(P, g2.c), t), g2.a)));
      } else continue;
      out.push({ id: `gear${out.length}`, a: g1.body, fa: g1.frame, ja: v3(ja), b: g2.body, fb: g2.frame, jb: v3(jb), label: `${g1.kind === "worm" ? "worm" : g1.teeth}:${g2.teeth}` });
    }
  return out;
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

function boxShape(m: Mat4, bx: Box, R: (m: Mat4, p: Vec3) => Vec3, color: string, material: Material, massKg: number): ShapeSpec {
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

/**
 * Game-piece tag in a part label: "... [loose:seed 1]", "[loose:seed 1@1.5]" (held on until
 * 1.5 N), "[loose:platform~]" (keeps its own hinges instead of being one solid piece).
 */
export const looseTag = (p: ModelPart): string | null => /\[loose:([^\]@]+)/.exec(p.label ?? "")?.[1] ?? null;
const holdN = (p: ModelPart): number | null => {
  const m = /\[loose:[^\]@]+@([\d.]+)\]/.exec(p.label ?? "");
  return m ? Number(m[1]) : null;
};

/**
 * A mission model for the field. Parts that didn't connect (hoses, clips, decorations without
 * snap data) are glued to what they touch; game pieces (labels tagged `[loose:<piece>]`) only
 * stick to their own piece so they stay free, and pieces tagged `@<newtons>` are held on to
 * what they rest against until pulled harder than that. The heaviest non-game-piece body resting
 * on the mat is held by Dual Lock (unless `fixed` is false).
 */
export function assembleMissionModel(lib: Library, parts: ModelPart[], o: { name?: string; fixed?: boolean } = {}): { robot: RobotModel; fixedBodies: string[] } {
  const { robot, bodyOfPart, toModelMm } = assemble(lib, parts, {
    name: o.name,
    autoPorts: false,
    coarse: true,
    lockBars: true,
    // (mission models are built sturdy: only their game pieces come off, see the holds below)
    glue: () => true,
    glueTo: (a, b) => looseTag(a) === looseTag(b),
    // a game piece is one solid object, unless tagged "~" (it has working hinges of its own)
    rigidGroup: (p) => { const t = looseTag(p); return t && !t.endsWith("~") ? t : null; },
  });
  // breakable holds: each held piece to the body it touches most
  const box = (i: number) => {
    const inf = analyzePart(lib, parts[i].file), m = parts[i].m;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const k of corners(inf.min, inf.max)) {
      const w = [m[0] * k[0] + m[1] * k[1] + m[2] * k[2] + m[3], m[4] * k[0] + m[5] * k[1] + m[6] * k[2] + m[7], m[8] * k[0] + m[9] * k[1] + m[10] * k[2] + m[11]];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], w[a]); hi[a] = Math.max(hi[a], w[a]); }
    }
    return { lo, hi };
  };
  const welds: NonNullable<RobotModel["welds"]> = [];
  const pieces = new Map<string, number[]>();
  parts.forEach((p, i) => { const t = looseTag(p); if (t && holdN(p) !== null) (pieces.get(t) ?? pieces.set(t, []).get(t)!).push(i); });
  for (const [, idx] of pieces) {
    const breakN = holdN(parts[idx[0]])!;
    const pieceBodies = new Set(idx.map((i) => bodyOfPart[i]));
    const main = [...pieceBodies].sort((a, b) => idx.filter((i) => bodyOfPart[i] === b).length - idx.filter((i) => bodyOfPart[i] === a).length)[0];
    const touch = new Map<string, { n: number; lo: number[]; hi: number[] }>();
    for (const i of idx) {
      const bi = box(i);
      parts.forEach((_, j) => {
        if (pieceBodies.has(bodyOfPart[j]) || looseTag(parts[j])) return;
        const bj = box(j);
        const lo = [0, 1, 2].map((a) => Math.max(bi.lo[a], bj.lo[a])), hi = [0, 1, 2].map((a) => Math.min(bi.hi[a], bj.hi[a]));
        if ([0, 1, 2].some((a) => hi[a] - lo[a] < -4)) return;
        const t = touch.get(bodyOfPart[j]) ?? { n: 0, lo, hi };
        t.n++;
        touch.set(bodyOfPart[j], t);
      });
    }
    const best = [...touch].sort((a, b) => b[1].n - a[1].n)[0];
    if (!best) continue;
    const mid: Vec3 = [0, 1, 2].map((a) => (best[1].lo[a] + best[1].hi[a]) / 2) as Vec3;
    welds.push({ a: main, b: best[0], pointMm: toModelMm(mid), breakN });
  }
  if (welds.length) robot.welds = [...(robot.welds ?? []), ...welds];
  if (o.fixed === false) return { robot, fixedBodies: [] };
  const pieceBodySet = new Set(parts.map((p, i) => (looseTag(p) ? bodyOfPart[i] : null)).filter((x): x is string => !!x));
  const lowest = (b: RobotModel["bodies"][number]) => Math.min(...b.shapes.map((sh) => sh.posMm.y - (sh.kind === "box" ? sh.sizeMm.y / 2 : sh.radiusMm)));
  const floor = Math.min(...robot.bodies.map(lowest));
  // Dual Lock holds the body that rests on the mat over the largest area (the model's base)
  const footArea = (b: RobotModel["bodies"][number]) =>
    b.shapes.reduce((t, sh) => {
      const bottom = sh.posMm.y - (sh.kind === "box" ? sh.sizeMm.y / 2 : sh.radiusMm);
      if (bottom > floor + 3) return t;
      return t + (sh.kind === "box" ? sh.sizeMm.x * sh.sizeMm.z : Math.PI * sh.radiusMm * sh.radiusMm);
    }, 0);
  const grounded = robot.bodies.filter((b) => !pieceBodySet.has(b.id) && lowest(b) < floor + 3).sort((a, b) => footArea(b) - footArea(a) || b.massKg - a.massKg);
  return { robot, fixedBodies: grounded.slice(0, 1).map((b) => b.id) };
}
