// Scripted LEGO model building on real connection points.
//
//   const b = new Build(lib, "Mission 05 Reaching Roots");
//   const frame = b.place("64179.dat", 71, rot("x", 90));            // first part, free
//   b.step();
//   const pin = b.attach("61332.dat", 0, { to: frame, where: (s) => ... });
//
// `attach` tries every snap of the new part against every selected target snap, all 90°
// rotations about the connection axis, both flips and a few slide offsets, and keeps the
// placement with the most connections to *all* placed parts and no overlap. It throws when
// the part can't connect, so a wrong instruction reading fails loudly instead of floating.
import { writeFileSync } from "node:fs";
import { type Library, type Mat4, type Snap, IDENTITY, mul } from "@fll-sim/ldraw";
import { analyzePart, assemble, partSnaps, placeOnSnap, worldSnapFor, type ModelPart } from "@fll-sim/assembly";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";
import { render, VIEWS, type View } from "./render";

export interface SnapInfo {
  /** Model-frame snap matrix. */
  m: Mat4;
  gender: "M" | "F";
  secs: string;
  /** Position (LDU, LDraw frame: -Y up). */
  pos: [number, number, number];
  /** Unit axis. */
  axis: [number, number, number];
  kind: "round" | "axle" | "stud" | "other";
  part: number;
}

export interface AttachOptions {
  to: number | number[];
  /** Pick which of the target parts' snaps to use (default: all). */
  where?: (s: SnapInfo) => boolean;
  /** Pick which of the new part's own snaps may be used (in its own frame). */
  own?: (s: SnapInfo) => boolean;
  /** Reject candidate placements (model-frame matrix). */
  accept?: (m: Mat4, b: Build) => boolean;
  /** Extra score (higher = preferred) to break ties, e.g. prefer a direction. */
  prefer?: (m: Mat4, b: Build) => number;
  offsets?: number[];
  /** Rotation angles about the connection axis to try (default 0/90/180/270; use finer steps for hinged parts). */
  angles?: number[];
  minConnections?: number;
  /** Maximum overlapping volume (LDU³/1000) tolerated. */
  maxOverlap?: number;
  label?: string;
  /** Print the best candidates (including rejected ones) to debug a failing attach. */
  debug?: boolean;
}

export interface Placed extends ModelPart { step: number; label?: string }

const unit = (v: number[]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export function rot(axis: "x" | "y" | "z", deg: number, t: [number, number, number] = [0, 0, 0]): Mat4 {
  const r = (deg * Math.PI) / 180, c = Math.round(Math.cos(r) * 1e9) / 1e9, s = Math.round(Math.sin(r) * 1e9) / 1e9;
  const m =
    axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === "y" ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1];
  return new Float64Array([m[0], m[1], m[2], t[0], m[3], m[4], m[5], t[1], m[6], m[7], m[8], t[2]]);
}
export const at = (x: number, y: number, z: number, r: Mat4 = IDENTITY): Mat4 => {
  const m = new Float64Array(r);
  m[3] = x; m[7] = y; m[11] = z;
  return m;
};

function info(s: Snap, m: Mat4, part: number): SnapInfo & { t: [number, number] } {
  const ws = worldSnapFor(s, IDENTITY, 0, 0, false);
  const t: [number, number] = ws ? [ws.t0, ws.t1] : [0, 0];
  const w = mul(m, s.m);
  const secs = s.secs;
  const kind = /stud/i.test(s.id ?? "") || (s.caps === "one" && secs.split(/\s+/).length <= 3 && secs.startsWith("R")) ? "stud" : secs.includes("A") && !secs.includes("R") ? "axle" : secs.startsWith("R") || secs.includes(" R ") || secs.startsWith("L") || secs.includes("R") ? "round" : "other";
  return { m: w, gender: s.gender, secs, pos: [w[3], w[7], w[11]], axis: unit([w[1], w[5], w[9]]), kind, part, t };
}

/**
 * Slide offsets that seat a part: where an end of the new snap lines up with an end of the target
 * snap (both flips), plus the regular grid. Offsets are along the target's axis.
 */
function seatOffsets(target: SnapInfo & { t?: [number, number] }, own: SnapInfo & { t?: [number, number] }, grid: number[]): number[] {
  const out = new Set(grid.map((g) => Math.round(g * 100) / 100));
  const [f0, f1] = target.t ?? [0, 0];
  const [m0, m1] = own.t ?? [0, 0];
  for (const [a0, a1] of [[m0, m1], [-m1, -m0]])
    for (const d of [f0 - a0, f1 - a1, (f0 + f1) / 2 - (a0 + a1) / 2, (f0 + f1) / 2 - a0, (f0 + f1) / 2 - a1, f0 - (a0 + a1) / 2, f1 - (a0 + a1) / 2])
      if (Math.abs(d) < 60) out.add(Math.round(d * 100) / 100);
  return [...out];
}

/** World AABB of a part. */
function aabb(lib: Library, file: string, m: Mat4) {
  const a = analyzePart(lib, file);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
    const w = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
  }
  return { min, max };
}
/** Largest per-axis gap between two boxes (0 when touching or overlapping). */
function gap(a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) {
  let g = 0;
  for (let k = 0; k < 3; k++) g = Math.max(g, a.min[k] - b.max[k], b.min[k] - a.max[k]);
  return Math.max(0, g);
}

export class Build {
  parts: Placed[] = [];
  private curStep = 1;
  constructor(readonly lib: Library, readonly name: string) {}

  step() {
    this.curStep++;
    return this.curStep;
  }

  /** Hub port of a motor or sensor part (robots): written as "0 !FLLSIM PORT X". */
  setPort(part: number, port: "A" | "B" | "C" | "D" | "E" | "F") {
    this.parts[part].port = port;
  }

  /**
   * A mount point (robots and tools): a tool attaches by putting its mount of the same name
   * exactly on the robot's. `m` = the mount frame (origin at the joining spot, e.g. the centre
   * of the pin hole the tool's first pin goes into; orientation as the tool sits when attached).
   */
  mount(name: string, m: Mat4): number {
    return this.place("fllsim-mount.dat", 16, m, name);
  }

  place(file: string, color: number, m: Mat4, label?: string): number {
    this.parts.push({ file, color, m, step: this.curStep, label });
    return this.parts.length - 1;
  }

  snaps(part: number, pred?: (s: SnapInfo) => boolean): (SnapInfo & { t: [number, number] })[] {
    const p = this.parts[part];
    return analyzePart(this.lib, p.file).snaps.filter((s) => s.kind === "cyl" || s.kind === "clp" || s.kind === "fgr").map((s) => info(s, p.m, part)).filter((s) => !pred || pred(s));
  }

  /** Axis-aligned bounds of a part (or the whole model) in the LDraw frame. */
  bounds(part?: number) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const [i, p] of this.parts.entries()) {
      if (part !== undefined && i !== part) continue;
      const a = analyzePart(this.lib, p.file);
      for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
        const m = p.m;
        const w = [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], w[k]); max[k] = Math.max(max[k], w[k]); }
      }
    }
    return { min, max, size: max.map((v, k) => v - min[k]) };
  }

  attach(file: string, color: number, o: AttachOptions): number {
    const t0 = Date.now();
    try {
      return this.attachInner(file, color, o);
    } finally {
      if (process.env.BUILD_TIMING && Date.now() - t0 > 1000) console.log(`  [timing] attach ${o.label ?? file}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }

  private attachInner(file: string, color: number, o: AttachOptions): number {
    const targets = (Array.isArray(o.to) ? o.to : [o.to]).flatMap((t) => this.snaps(t, o.where));
    if (!targets.length) throw new Error(`${this.name}: ${o.label ?? file}: no target snaps match`);
    const own = partSnaps(this.lib, file).map((s) => info(s, IDENTITY, -1)).filter((s) => !o.own || o.own(s));
    if (!own.length) throw new Error(`${this.name}: ${o.label ?? file}: no own snaps match`);
    const placed = this.parts.map((p) => ({ file: p.file, m: p.m }));
    let best: { m: Mat4; conn: number; overlap: number; score: number } | null = null;
    const offsets = o.offsets ?? [-30, -20, -10, 0, 10, 20, 30];
    for (const t of targets)
      for (const s of own) {
        if (s.gender === t.gender) continue;
        for (const angleDeg of o.angles ?? [0, 90, 180, 270])
          for (const flip of [false, true])
            for (const offset of seatOffsets(t, s, offsets)) {
              const m = placeOnSnap(t.m, s.m, { angleDeg, flip, offset });
              if (o.accept && !o.accept(m, this)) continue;
              const { connections, overlap, depth } = findConnectionsForParts(this.lib, placed, { file, m });
              if (o.debug && connections > 0) console.log("  cand", JSON.stringify({ connections, depth: Math.round(depth), overlap: +overlap.toFixed(1), origin: [m[3], m[7], m[11]].map(Math.round), x: [m[0], m[4], m[8]].map(Math.round), z: [m[2], m[6], m[10]].map(Math.round) }));
              if (overlap > (o.maxOverlap ?? 2)) continue;
              // more connections first, then deeper (fully seated) connections, then pressed flush
              // against the target part (real parts are pushed together), then the preference
              const box = aabb(this.lib, file, m);
              const flush = Math.min(...(Array.isArray(o.to) ? o.to : [o.to]).map((ti) => gap(box, aabb(this.lib, this.parts[ti].file, this.parts[ti].m))));
              const score = connections * 10 + depth * 0.05 - overlap - flush * 0.05 + (o.prefer ? o.prefer(m, this) : 0);
              if (!best || score > best.score + 1e-9) best = { m, conn: connections, overlap, score };
            }
      }
    if (!best || best.conn < (o.minConnections ?? 1)) throw new Error(`${this.name}: ${o.label ?? file}: can't attach (best ${best?.conn ?? 0} connections)`);
    this.parts.push({ file, color, m: best.m, step: this.curStep, label: o.label });
    return this.parts.length - 1;
  }

  /**
   * Attach a sub-assembly built in its own Build (in any frame): tries every snap of every
   * sub-assembly part against the targets and keeps the placement with most connections.
   * Returns the indices of the added parts.
   */
  attachGroup(sub: Build, o: AttachOptions & { ownPart?: number[]; rotation?: Mat4 }): number[] {
    const t0 = Date.now();
    try {
      return this.attachGroupInner(sub, o);
    } finally {
      if (process.env.BUILD_TIMING && Date.now() - t0 > 1000) console.log(`  [timing] group ${o.label ?? sub.name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
  }

  private attachGroupInner(sub: Build, o: AttachOptions & { ownPart?: number[]; rotation?: Mat4 }): number[] {
    if (o.rotation) return this.attachGroupRotated(sub, o as AttachOptions & { ownPart?: number[]; rotation: Mat4 });
    const targets = (Array.isArray(o.to) ? o.to : [o.to]).flatMap((t) => this.snaps(t, o.where));
    if (!targets.length) throw new Error(`${this.name}: ${o.label ?? sub.name}: no target snaps match`);
    const own = sub.parts.flatMap((_, i) => (!o.ownPart || o.ownPart.includes(i) ? sub.snaps(i) : [])).filter((s) => !o.own || o.own(s));
    const placed = this.parts.map((p) => ({ file: p.file, m: p.m }));
    const dbg: { conn: number; depth: number; overlap: number; acc: boolean; origin: number[] }[] = [];
    let best: { T: Mat4; conn: number; overlap: number; score: number } | null = null;
    const offsets = o.offsets ?? [-30, -20, -10, 0, 10, 20, 30];
    for (const t of targets)
      for (const s of own) {
        if (s.gender === t.gender) continue;
        for (const angleDeg of o.angles ?? [0, 90, 180, 270])
          for (const flip of [false, true])
            for (const offset of seatOffsets(t, s, offsets)) {
              const T = placeOnSnap(t.m, s.m, { angleDeg, flip, offset });
              const acc = !o.accept || o.accept(T, this);
              if (!acc && !o.debug) continue;
              let conn = 0, overlap = 0, depth = 0;
              for (const p of sub.parts) {
                // connections and overlap against the main model (the group's own layout is fixed)
                const toMain = findConnectionsForParts(this.lib, placed, { file: p.file, m: mul(T, p.m) });
                conn += toMain.connections;
                depth += toMain.depth;
                overlap += toMain.overlap;
              }
              if (o.debug && conn > 0) dbg.push({ conn, depth: Math.round(depth), overlap: +overlap.toFixed(1), acc, origin: [T[3], T[7], T[11]].map(Math.round) });
              if (!acc) continue;
              if (overlap > (o.maxOverlap ?? 3)) continue;
              const score = conn * 10 + depth * 0.05 - overlap + (o.prefer ? o.prefer(T, this) : 0);
              if (!best || score > best.score + 1e-9) best = { T, conn, overlap, score };
            }
      }
    if (o.debug) for (const d of dbg.sort((a, b) => b.conn - a.conn || b.depth - a.depth).slice(0, 12)) console.log("  cand", JSON.stringify(d));
    if (!best || best.conn < (o.minConnections ?? 1)) throw new Error(`${this.name}: ${o.label ?? sub.name}: can't attach group (best ${best?.conn ?? 0} connections)`);
    const idx: number[] = [];
    for (const p of sub.parts) {
      this.parts.push({ ...p, m: mul(best.T, p.m), step: this.curStep, label: p.label ?? o.label });
      idx.push(this.parts.length - 1);
    }
    return idx;
  }

  /**
   * Group attach with a known orientation (`rotation`, translation ignored): only translations
   * that bring an own snap onto a matching target snap are tried. Much faster than the full search.
   */
  private attachGroupRotated(sub: Build, o: AttachOptions & { ownPart?: number[]; rotation: Mat4 }): number[] {
    const targets = (Array.isArray(o.to) ? o.to : [o.to]).flatMap((t) => this.snaps(t, o.where));
    const R = o.rotation;
    const own = sub.parts.flatMap((_, i) => (!o.ownPart || o.ownPart.includes(i) ? sub.snaps(i) : [])).filter((s) => !o.own || o.own(s));
    const placed = this.parts.map((p) => ({ file: p.file, m: p.m }));
    let best: { T: Mat4; conn: number; score: number } | null = null;
    const tried = new Set<string>();
    for (const t of targets)
      for (const s of own) {
        if (s.gender === t.gender) continue;
        const rp = [R[0] * s.pos[0] + R[1] * s.pos[1] + R[2] * s.pos[2], R[4] * s.pos[0] + R[5] * s.pos[1] + R[6] * s.pos[2], R[8] * s.pos[0] + R[9] * s.pos[1] + R[10] * s.pos[2]];
        const T = new Float64Array(R);
        T[3] = t.pos[0] - rp[0]; T[7] = t.pos[1] - rp[1]; T[11] = t.pos[2] - rp[2];
        const k = [T[3], T[7], T[11]].map((v) => Math.round(v)).join(",");
        if (tried.has(k)) continue;
        tried.add(k);
        if (o.accept && !o.accept(T, this)) continue;
        let conn = 0, overlap = 0;
        for (const p of sub.parts) {
          const r = findConnectionsForParts(this.lib, placed, { file: p.file, m: mul(T, p.m) });
          conn += r.connections;
          overlap += r.overlap;
        }
        if (overlap > (o.maxOverlap ?? 3)) continue;
        const score = conn * 10 - overlap + (o.prefer ? o.prefer(T, this) : 0);
        if (!best || score > best.score) best = { T, conn, score };
      }
    if (!best || best.conn < (o.minConnections ?? 1)) throw new Error(`${this.name}: ${o.label ?? sub.name}: can't attach group with the given rotation (best ${best?.conn ?? 0})`);
    const idx: number[] = [];
    for (const p of sub.parts) {
      this.parts.push({ ...p, m: mul(best.T, p.m), step: this.curStep, label: p.label ?? o.label });
      idx.push(this.parts.length - 1);
    }
    return idx;
  }

  /**
   * Place a part at an exact position/orientation (bricks on the stud grid) and verify it connects
   * to the model with at least `minConnections` connections (throws otherwise).
   */
  put(file: string, color: number, m: Mat4, minConnections = 1, label?: string): number {
    const placed = this.parts.map((p) => ({ file: p.file, m: p.m }));
    const r = placed.length ? findConnectionsForParts(this.lib, placed, { file, m }) : { connections: minConnections, overlap: 0, depth: 0 };
    if (r.connections < minConnections) throw new Error(`${this.name}: ${label ?? file}: put at ${[m[3], m[7], m[11]]} makes ${r.connections} connections (need ${minConnections})`);
    this.parts.push({ file, color, m, step: this.curStep, label });
    return this.parts.length - 1;
  }

  /** Physics check: rigid groups, hinges, loose groups. */
  check() {
    return assemble(this.lib, this.parts, { name: this.name, autoPorts: false }).report;
  }

  ldr(): string {
    const out = [`0 ${this.name}`, `0 Name: ${this.name.replace(/[^\w.-]+/g, "_")}.ldr`, "0 Author: FLL Sim (scripted from the official building instructions)", "0 !LICENSE Model data for simulation use", ""];
    let s = 1;
    for (const p of this.parts) {
      while (p.step > s) {
        out.push("0 STEP");
        s++;
      }
      if (p.label) out.push(`0 // ${p.label}`);
      const m = p.m, f = (v: number) => +v.toFixed(4);
      out.push(`1 ${p.color} ${f(m[3])} ${f(m[7])} ${f(m[11])} ${f(m[0])} ${f(m[1])} ${f(m[2])} ${f(m[4])} ${f(m[5])} ${f(m[6])} ${f(m[8])} ${f(m[9])} ${f(m[10])} ${p.file}`);
    }
    out.push("0 STEP", "");
    return out.join("\n");
  }

  save(path: string) {
    writeFileSync(path, this.ldr());
  }

  render(path: string, view: View = VIEWS.iso, size = [900, 700]) {
    writeFileSync(path, render(this.lib, this.parts, { view, width: size[0], height: size[1] }));
  }
}

export { VIEWS };

type Dir = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const DV: Record<Dir, [number, number, number]> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
/**
 * Orientation from where the part's own X, Y, Z axes should point in the model
 * (LDraw frame: -y = up, -z = front/towards the builder, +x = right).
 */
export function orient(x: Dir, y: Dir, z: Dir, t: [number, number, number] = [0, 0, 0]): Mat4 {
  const [a, b, c] = [DV[x], DV[y], DV[z]];
  const m = new Float64Array([a[0], b[0], c[0], t[0], a[1], b[1], c[1], t[1], a[2], b[2], c[2], t[2]]);
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
  if (Math.abs(det - 1) > 1e-6) throw new Error(`orient(${x},${y},${z}) is not a rotation (det ${det})`);
  return m;
}

/** Snap predicates. */
export const near = (p: [number, number, number], tol = 3) => (s: SnapInfo) => Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1], s.pos[2] - p[2]) <= tol;
export const axisIs = (d: Dir | "x" | "y" | "z") => (s: SnapInfo) => Math.abs(Math.abs(s.axis[0] * DV[(d.length === 1 ? "+" + d : d) as Dir][0] + s.axis[1] * DV[(d.length === 1 ? "+" + d : d) as Dir][1] + s.axis[2] * DV[(d.length === 1 ? "+" + d : d) as Dir][2]) - 1) < 0.02;
export const all = (...ps: ((s: SnapInfo) => boolean)[]) => (s: SnapInfo) => ps.every((p) => p(s));
/** Placement predicate: the new part's origin lies on the given side of a coordinate. */
export const originSide = (axis: 0 | 1 | 2, sign: 1 | -1, than: number) => (m: Mat4) => (m[axis * 4 + 3] - than) * sign > 0;

/** Debug: print a placed part's snaps in model coordinates. */
export function dump(b: Build, part: number, pred?: (s: SnapInfo) => boolean) {
  const p = b.parts[part];
  const bb = b.bounds(part);
  console.log(`#${part} ${p.file} ${p.label ?? ""} bounds ${bb.min.map(Math.round)} .. ${bb.max.map(Math.round)}`);
  for (const s of b.snaps(part, pred)) console.log(`   ${s.gender} ${s.kind.padEnd(5)} pos ${s.pos.map((v) => Math.round(v)).join(",").padEnd(14)} axis ${s.axis.map((v) => Math.round(v * 100) / 100).join(",").padEnd(12)} ${s.secs}`);
}

/** World position of a local point under placement T. */
export function pt(T: Mat4, p: [number, number, number]): [number, number, number] {
  return [T[0] * p[0] + T[1] * p[1] + T[2] * p[2] + T[3], T[4] * p[0] + T[5] * p[1] + T[6] * p[2] + T[7], T[8] * p[0] + T[9] * p[1] + T[10] * p[2] + T[11]];
}
/** World direction of a local axis under placement T. */
export function dir(T: Mat4, d: [number, number, number]): [number, number, number] {
  return [T[0] * d[0] + T[1] * d[1] + T[2] * d[2], T[4] * d[0] + T[5] * d[1] + T[6] * d[2], T[8] * d[0] + T[9] * d[1] + T[10] * d[2]];
}
