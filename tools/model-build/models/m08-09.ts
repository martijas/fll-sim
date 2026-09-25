// Missions 08 Tangled + 09 Research Platform (book 07, bags 11-15), scripted from the official
// building instructions (text-based book + picture book).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
import { IDENTITY, type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { placeOnSnap } from "@fll-sim/assembly";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";
import { Build, all, axisIs, dir, dump, near, orient, pt, type AttachOptions, type SnapInfo } from "../src/build";

// colours
const BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, YELLOW = 14, WHITE = 15, TAN = 19, LIME = 27, DKTAN = 28,
  BROWN = 70, LBG = 71, DBG = 72, NOUGAT84 = 84, NOUGAT = 92, BGREEN = 10, DKGREEN = 288, DKBROWN = 308,
  DKORANGE = 484, CORAL = 353, TYELLOW = 46, GOLD = 297, LTORANGE = 191, PALEYEL = 226, AQUA = 323, TORANGE = 57;
// parts
const PIN = "61332.dat", PIN3 = "42924.dat", PIN3F = "39888.dat", AXPIN = "43093.dat", AXPIN3 = "11214.dat",
  AXPINT = "3749.dat", HALFPIN = "89678.dat", L1 = "18654.dat", L2 = "43857.dat", L3 = "32523.dat",
  L5 = "32316.dat", L7 = "32524.dat", L9 = "40490.dat", L11 = "32525.dat", L15 = "32278.dat",
  BENT = "32271.dat", PANEL = "11954.dat", CONN4 = "65489.dat", JOIN = "62462.dat", AX2 = "32062.dat",
  AXJ3 = "42195.dat", TUBE = "25214.dat", BALL = "32474.dat";

type V3 = [number, number, number];
const sub = (a: V3, c: V3): V3 => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
const dot = (a: V3, c: V3) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const org = (m: Mat4): V3 => [m[3], m[7], m[11]];
const X = (m: Mat4) => m[3], Y = (m: Mat4) => m[7], Z = (m: Mat4) => m[11];
const hole = (s: SnapInfo) => s.gender === "F";
const DIRS: Record<string, V3> = { L: [-1, 0, 0], R: [1, 0, 0], U: [0, -1, 0], D: [0, 1, 0], F: [0, 0, -1], B: [0, 0, 1] };

// ---- attach helpers ----------------------------------------------------------------------------
// Some LDraw snap frames are mirrored (inherited from mirrored subfiles), and Build.attach then
// happily returns reflected (det < 0) part matrices. These copies of Build.attach/attachGroup
// make every snap frame right-handed first (negating its X column keeps the connection axis), so
// all placements are proper rotations.
const det3 = (m: Mat4) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
function properize(m: Mat4): Mat4 {
  if (det3(m) > 0) return m;
  const r = new Float64Array(m);
  r[0] = -r[0]; r[4] = -r[4]; r[8] = -r[8];
  return r;
}
function A(b: Build, file: string, color: number, o: AttachOptions): number {
  const targets = (Array.isArray(o.to) ? o.to : [o.to]).flatMap((t) => b.snaps(t, o.where));
  if (!targets.length) throw new Error(`${o.label ?? file}: no target snaps match`);
  const tmp = new Build(b.lib, "tmp");
  tmp.place(file, 16, IDENTITY);
  const own = tmp.snaps(0).filter((x) => !o.own || o.own(x));
  if (!own.length) throw new Error(`${o.label ?? file}: no own snaps match`);
  const placed = b.parts.map((p) => ({ file: p.file, m: p.m }));
  let best: { m: Mat4; conn: number; score: number } | null = null;
  const t0 = Date.now();
  const offsets = o.offsets ?? [-30, -20, -10, 0, 10, 20, 30];
  for (const t of targets)
    for (const s of own) {
      if (s.gender === t.gender) continue;
      const tm = properize(t.m), sm = properize(s.m);
      for (const angleDeg of [0, 90, 180, 270])
        for (const flip of [false, true])
          for (const offset of offsets) {
            const m = placeOnSnap(tm, sm, { angleDeg, flip, offset });
            if (o.accept && !o.accept(m, b)) continue;
            const { connections, overlap } = findConnectionsForParts(b.lib, placed, { file, m });
            if (overlap > (o.maxOverlap ?? 2)) continue;
            const score = connections * 10 - overlap + (o.prefer ? o.prefer(m, b) : 0);
            if (!best || score > best.score + 1e-9) best = { m, conn: connections, score };
          }
    }
  if (process.env.M0809_DEBUG && Date.now() - t0 > 500) console.log(`A ${o.label ?? file}: ${targets.length}x${own.length} snaps, ${Date.now() - t0} ms`);
  if (!best || best.conn < (o.minConnections ?? 1)) throw new Error(`${o.label ?? file}: can't attach (best ${best?.conn ?? 0} connections)`);
  b.parts.push({ file, color, m: best.m, step: (b as any).curStep, label: o.label });
  return b.parts.length - 1;
}
function AG(b: Build, sub: Build, o: AttachOptions & { ownPart?: number[] }): number[] {
  const targets = (Array.isArray(o.to) ? o.to : [o.to]).flatMap((t) => b.snaps(t, o.where));
  if (!targets.length) throw new Error(`${o.label ?? sub.name}: no target snaps match`);
  const own = sub.parts.flatMap((_, i) => (!o.ownPart || o.ownPart.includes(i) ? sub.snaps(i) : [])).filter((s) => !o.own || o.own(s));
  const placed = b.parts.map((p) => ({ file: p.file, m: p.m }));
  let best: { T: Mat4; conn: number; score: number } | null = null;
  let nCand = 0;
  const t0 = Date.now();
  const offsets = o.offsets ?? [-30, -20, -10, 0, 10, 20, 30];
  for (const t of targets)
    for (const s of own) {
      if (s.gender === t.gender) continue;
      const tm = properize(t.m), sm = properize(s.m);
      for (const angleDeg of [0, 90, 180, 270])
        for (const flip of [false, true])
          for (const offset of offsets) {
            const T = placeOnSnap(tm, sm, { angleDeg, flip, offset });
            if (o.accept && !o.accept(T, b)) continue;
            nCand++;
            let conn = 0, overlap = 0;
            const cur = [...placed];
            for (const p of sub.parts) {
              const m = mul(T, p.m);
              overlap += findConnectionsForParts(b.lib, cur, { file: p.file, m }).overlap;
              conn += findConnectionsForParts(b.lib, placed, { file: p.file, m }).connections;
              cur.push({ file: p.file, m });
            }
            if (overlap > (o.maxOverlap ?? 3)) continue;
            const score = conn * 10 - overlap + (o.prefer ? o.prefer(T, b) : 0);
            if (!best || score > best.score + 1e-9) best = { T, conn, score };
          }
    }
  if (process.env.M0809_DEBUG) console.log(`AG ${o.label}: ${targets.length}x${own.length} snaps, ${nCand} candidates, ${Date.now() - t0} ms`);
  if (!best || best.conn < (o.minConnections ?? 1)) throw new Error(`${o.label ?? sub.name}: can't attach group (best ${best?.conn ?? 0} connections)`);
  const idx: number[] = [];
  for (const p of sub.parts) {
    b.parts.push({ ...p, m: mul(best.T, p.m), step: (b as any).curStep, label: p.label ?? o.label });
    idx.push(b.parts.length - 1);
  }
  return idx;
}

/** Red 1/2 pin with stud, pushed fully into the hole whose top face is at `p` (stud up). */
function halfPin(b: Build, to: number, p: V3, color = RED) {
  return A(b, HALFPIN, color, {
    to,
    where: near([p[0], p[1], p[2]], 2),
    accept: (m) => Math.abs(Y(m) - (p[1] - 10)) < 1 && pt(m, [4, 0, 0])[1] < Y(m) - 2,
    label: "red 1/2 pin with stud",
  });
}

/** Dark grey 3L axle/pin (2L pin + 1L axle): 1L of the pin into the hole whose face is at `h`
 *  (hole axis vertical, opening upwards), axle end on top. */
function axlePinUp(b: Build, h: V3, file = AXPIN3, color = DBG) {
  return A(b, file, color, {
    to: b.parts.map((_, i) => i),
    where: all(near(h, 2), axisIs("y")),
    offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40],
    accept: (m) => Math.abs(X(m) - h[0]) < 1 && Math.abs(Z(m) - h[2]) < 1 && Math.abs(Y(m) - (h[1] - 10)) < 1 && dir(m, [1, 0, 0])[1] < -0.9,
    label: "3L axle/pin",
  });
}

/** Red 1/2 pin with stud in the hole centred at `c` (1L deep), stud pointing `out`. */
function halfPinOut(b: Build, to: number | number[], c: V3, out: string, color = RED) {
  const d = DIRS[out];
  const f: V3 = [c[0] + 10 * d[0], c[1] + 10 * d[1], c[2] + 10 * d[2]];
  return A(b, HALFPIN, color, {
    to,
    where: all(near(c, 11), (s) => Math.abs(dot(s.axis, d)) > 0.9),
    offsets: [-20, -10, 0, 10, 20],
    accept: (m) => Math.hypot(...sub(org(m), f)) < 1 && dot(dir(m, [1, 0, 0]), d) > 0.9,
    label: "red 1/2 pin with stud",
  });
}

const cross = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const unitV = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
/** Proper matrix whose local X, Y axes point along x, y (z = x × y), at origin o. */
function frameM(x: V3, y: V3, o: V3): Mat4 {
  const X1 = unitV(x), Y1 = unitV(y), Z1 = cross(X1, Y1);
  return new Float64Array([X1[0], Y1[0], Z1[0], o[0], X1[1], Y1[1], Z1[1], o[1], X1[2], Y1[2], Z1[2], o[2]]);
}
/** An axle (default yellow 3L) pushed 1L into the axle hole of part `on` whose mouth is at local
 *  point `mouth`, the hole opening along local direction `d`. */
function yellowAxle(b: Build, on: number, mouth: V3, d: V3, file = "4519.dat", color = YELLOW, inside = 20, len = 60) {
  const m = b.parts[on].m;
  const M = pt(m, mouth), D = unitV(dir(m, d));
  const c = len / 2 - inside;
  const perp = Math.abs(D[1]) < 0.9 ? cross(D, [0, 1, 0]) : cross(D, [1, 0, 0]);
  return b.place(file, color, frameM(D, perp, [M[0] + c * D[0], M[1] + c * D[1], M[2] + c * D[2]]), "axle");
}

/** Place a sub-assembly with a known transform; checks it really connects (>= minConn). */
function placeGroup(b: Build, sub: Build, T: Mat4, minConn = 1, label?: string, maxOverlap?: number): number[] {
  const placed = b.parts.map((p) => ({ file: p.file, m: p.m }));
  let conn = 0, overlap = 0;
  for (const p of sub.parts) {
    const r = findConnectionsForParts(b.lib, placed, { file: p.file, m: mul(T, p.m) });
    conn += r.connections; overlap += r.overlap;
    if (process.env.M0809_DEBUG && r.overlap > 0.5) {
      console.log(`  ${label}: ${p.file} ${p.label ?? ""} overlap ${r.overlap.toFixed(1)}`);
      if (r.overlap > 2) placed.forEach((q, qi) => { const o2 = findConnectionsForParts(b.lib, [q], { file: p.file, m: mul(T, p.m) }).overlap; if (o2 > 0.3) console.log(`     with #${qi} ${q.file} ${b.parts[qi].label ?? ""} ${o2.toFixed(1)}`); });
    }
  }
  if (conn < minConn || overlap > (maxOverlap ?? 3 * Math.max(1, sub.parts.length / 8))) throw new Error(`${label ?? sub.name}: placeGroup ${conn} connections, overlap ${overlap.toFixed(1)}`);
  const idx: number[] = [];
  for (const p of sub.parts) {
    b.parts.push({ ...p, m: mul(T, p.m), step: (b as any).curStep, label: p.label ?? label });
    idx.push(b.parts.length - 1);
  }
  return idx;
}
const Tm = (r: number[], t: V3): Mat4 => new Float64Array([r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2]]);

/**
 * Pin-like part into the hole at `h` (world), its centre `along` LDU from the hole centre in
 * direction `out` (the side it sticks out of); `collar` = where its stop ring (local x = -10 for
 * 3L pins) must be along `out`.
 */
function pinAt(b: Build, file: string, color: number, to: number | number[], h: V3, out: string, along: number, o: { collar?: number; label?: string; offsets?: number[]; min?: number } = {}) {
  const d = DIRS[out];
  return A(b, file, color, {
    to,
    where: all(near(h, 2), (s) => Math.abs(dot(s.axis, d)) > 0.9),
    offsets: o.offsets ?? [-40, -30, -20, -10, 0, 10, 20, 30, 40],
    minConnections: o.min ?? 1,
    accept: (m) => {
      const c = sub(org(m), h);
      const perp = sub(c, [d[0] * dot(c, d), d[1] * dot(c, d), d[2] * dot(c, d)]);
      if (Math.hypot(...perp) > 2 || Math.abs(dot(c, d) - along) > 2) return false;
      if (o.collar !== undefined && Math.abs(dot(sub(pt(m, [-10, 0, 0]), h), d) - o.collar) > 2) return false;
      return true;
    },
    label: o.label,
  });
}

/** Apply a rigid transform to parts [from, to). */
function transformParts(b: Build, T: Mat4, from = 0, to = b.parts.length) {
  for (let i = from; i < to; i++) {
    const m = b.parts[i].m;
    const r = new Float64Array(12);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) r[row * 4 + col] = T[row * 4] * m[col] + T[row * 4 + 1] * m[4 + col] + T[row * 4 + 2] * m[8 + col];
      r[row * 4 + 3] = T[row * 4] * m[3] + T[row * 4 + 1] * m[7] + T[row * 4 + 2] * m[11] + T[row * 4 + 3];
    }
    b.parts[i].m = r;
  }
}

export function build(lib: Library) {
  const b = new Build(lib, "M08 Tangled + M09 Research Platform");
  const DEBUG = process.env.M0809_DEBUG;

  // ======================= Bag 11: lower trunk (built upside down) ==========================
  // Trunk tube: 4 curved 11x2x3 panels, their 11L length upright. Each half = two panels joined
  // on their 5-hole edges by two 1x3 cross blocks with 4 pins.
  // 1 left panel of half 1 (back half): smooth side at the back.
  const pA = b.place(PANEL, BROWN, orient("+z", "+x", "+y", [-20, -110, 40]), "lower trunk panel A");
  b.step();
  // 2 two cross blocks with 4 pins into the bottom two and top two holes of the right edge
  const cA1 = A(b, CONN4, LBG, { to: pA, where: all(near([-10, -50, 40], 21), axisIs("x")), minConnections: 2, accept: (m) => Math.abs(X(m)) < 1 && Math.abs(Y(m) + 50) < 1, label: "4-pin cross block" });
  const cA2 = A(b, CONN4, LBG, { to: pA, where: all(near([-10, -170, 40], 21), axisIs("x")), minConnections: 2, accept: (m) => Math.abs(X(m)) < 1 && Math.abs(Y(m) + 170) < 1, label: "4-pin cross block" });
  b.step();
  // 3 right panel of half 1
  const pB = A(b, PANEL, BROWN, { to: [cA1, cA2], minConnections: 4, accept: (m) => X(m) > 10 && Z(m) > 30 && Math.abs(Y(m) + 110) < 1, label: "lower trunk panel B" });
  b.step();
  // 4 two pins + a green 3L liftarm on the bottom 3-hole column of each panel (front side)
  const g4 = [60, -60].map((xx) => {
    const ps = [-30, -70].map((yy) => pinAt(b, PIN, BLACK, xx > 0 ? pB : pA, [xx, yy, 20], "F", 10));
    return A(b, L3, BGREEN, { to: ps, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1, label: "green 3L liftarm" });
  });
  b.step();

  // 5 lever (camera trap): red 3x5 L liftarm, built lying flat (corner back-right, short leg to
  //   the left, long leg towards the front).
  const lev = new Build(lib, "camera trap lever");
  const Lr = lev.place("2477.dat", RED, orient("-x", "-y", "+z"));
  const lp1 = pinAt(lev, PIN, BLACK, Lr, [-20, 0, 80], "F", 10);
  const lp2 = pinAt(lev, PIN, BLACK, Lr, [0, 0, 20], "R", 10);
  A(lev, L1, BLACK, { to: lp1, accept: (m) => Math.abs(Z(m) - 60) < 1 });
  A(lev, L1, BLACK, { to: lp2, accept: (m) => Math.abs(X(m) - 20) < 1 });
  pinAt(lev, PIN3F, TAN, Lr, [0, 0, 80], "D", 0, { collar: 10, label: "tan 3L pin (pivot)" });
  const hp = [0, 40].map((zz) => A(lev, HALFPIN, RED, { to: Lr, where: near([0, 0, zz], 2), accept: (m) => pt(m, [4, 0, 0])[1] < -12 }));
  // 5.5 camera (minifig "phone handset" - LDraw has no such part; headphones used as look-alike,
  //     placed on the two studs)
  const st = hp.map((i) => pt(lev.parts[i].m, [4, 0, 0]));
  // (LDraw has no minifig phone handset; the set's black "handset" is represented by the black
  //  minifig camera, clipped on the front stud)
  A(lev, "30089b.dat", BLACK, { to: hp, maxOverlap: 6, prefer: (m) => -Y(m) * 0.01, label: "camera" });
  // 5.6 pivot pin into the middle hole of the top-left 3-hole column; lever upright, 3L leg on top
  const lever = AG(b, lev, {
    to: pA,
    where: near([-60, -170, 20], 2),
    ownPart: [5],
    accept: (T) => Math.abs(pt(T, [0, 0, 80])[2]) < 1,
    prefer: (T) => -pt(T, [-20, 0, 80])[0] * 0.01 + pt(T, [0, 0, 0])[1] * 0.01 - pt(T, [0, -30, 20])[2] * 0.01,
    label: "camera trap lever",
  });
  b.step();
  // 6 two pins + green pin joiners
  const p61 = pinAt(b, PIN, BLACK, pB, [60, -190, 20], "F", 10);
  const p62 = pinAt(b, PIN, BLACK, pB, [20, -90, 40], "F", 10);
  const j61 = A(b, JOIN, BGREEN, { to: p61, accept: (m) => Math.abs(Z(m) + 10) < 1 });
  const j62 = A(b, JOIN, BGREEN, { to: p62, accept: (m) => Math.abs(Z(m) - 10) < 1 });
  b.step();
  // 7 pins in the front of the top joiner and in the middle hole of the right green 3L liftarm
  A(b, PIN, BLACK, { to: j61, accept: (m) => Math.abs(Z(m) - Z(b.parts[j61].m) + 20) < 1 });
  pinAt(b, PIN, BLACK, g4[0], [60, -50, 0], "F", 10);
  b.step();

  // 8 second (front) half of the lower trunk, built in the same frame as the first half
  const h2 = new Build(lib, "lower trunk half 2");
  const pC = h2.place(PANEL, BROWN, orient("+z", "-x", "-y", [20, -110, 40]), "lower trunk panel C");
  const bp8 = pinAt(h2, PIN3, BLUE, pC, [60, -50, 20], "F", 20, { collar: 10 });
  const p82 = [-190, -150].map((yy) => pinAt(h2, PIN, BLACK, pC, [60, yy, 20], "F", 10));
  A(h2, L3, BGREEN, { to: p82, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1, label: "green 3L liftarm" });
  A(h2, L1, BGREEN, { to: bp8, accept: (m) => Math.abs(Z(m)) < 1 });
  const p84 = [-190, -110, -30].map((yy) => pinAt(h2, PIN3, BLUE, pC, [10, yy, 40], "L", 10, { collar: 0 }));
  p84.forEach((p, i) => A(h2, L1, i === 0 ? LBG : BGREEN, { to: p, accept: (m) => Math.abs(X(m)) < 1 }));
  const pD = A(h2, PANEL, BROWN, { to: p84, minConnections: 3, accept: (m) => Math.abs(X(m) + 20) < 1 && Z(m) > 30 && Math.abs(Y(m) + 110) < 1, label: "lower trunk panel D" });
  const p87 = [-30, -150].map((yy) => pinAt(h2, PIN, BLACK, pD, [-60, yy, 20], "F", 10));
  A(h2, L7, DKORANGE, { to: p87, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1, label: "dark orange 7L liftarm" });
  // 8.8 turn it round (curved side at the front) and push it onto the first half
  const half2 = placeGroup(b, h2, new Float64Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -20]), 4, "lower trunk half 2");
  b.step();

  // 9 two big roots (built lying flat: 11L along X, pins at its right end sticking up)
  const bigRoot = () => {
    const r = new Build(lib, "root");
    const r11 = r.place(L11, BROWN, orient("-z", "+y", "+x"), "root 11L");
    const rp = [60, 80, 100].map((x) => pinAt(r, PIN, BLACK, r11, [x, 0, 0], "U", 10));
    const r2 = A(r, L2, LBG, { to: rp[1], accept: (m) => Math.abs(X(m) - 80) < 1 && Math.abs(Y(m) + 20) < 1 && Math.abs(Z(m) + 10) < 1, label: "grey 2L liftarm" });
    const bpn = pinAt(r, PIN, BLACK, r2, [80, -20, -20], "D", 10);
    const rb = A(r, BENT, BROWN, { to: bpn, accept: (m) => Math.abs(Y(m)) < 1 && Math.abs(Z(m) + 20) < 1 && Math.abs(X(m) - 100) < 1 && pt(m, [32, 0, 144])[2] < -30, label: "root bent liftarm" });
    const hs = [[40, -20, rb], [60, -20, rb], [-20, 0, r11], [0, 0, r11]].map(([x, z, t]) => halfPin(r, t, [x, 0, z]));
    // Greenery (decorative): positions computed from the stud grid (the snap search can't
    // resolve these small slopes reliably). Plate on the two bent-liftarm studs, curved slopes on
    // the plate / the 11L studs, and brown side-stud bricks + 1x1 slopes under the overhangs.
    r.place("68568.dat", GREEN, Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [60, -18, 20]), "green quarter-round plate");
    // (a curved slope's tall-side row has its anti-studs one plate higher)
    r.place("15068.dat", GREEN, orient("-z", "+y", "+x", [10, -10, 10]), "green curved slope");
    r.place("15068.dat", GREEN, orient("+x", "+y", "+z", [50, -10, -30]), "green curved slope");
    r.place("32952.dat", BROWN, orient("-z", "-x", "+y", [70, 0, -40]), "brown side-stud brick");
    r.place("54200.dat", BROWN, orient("-z", "-x", "+y", [70, 0, -40]), "brown 1x1 slope");
    r.place("32952.dat", BROWN, orient("+z", "+x", "+y", [-30, 0, 20]), "brown side-stud brick");
    r.place("54200.dat", BROWN, orient("+z", "+x", "+y", [-30, 0, 20]), "brown 1x1 slope");
    if (DEBUG) { r.render("/tmp/claude-1000/-home-jason-project/158bb350-4e99-4f4b-903e-c6c7e1d3b9d8/scratchpad/m08-09/root.png"); }
    return r;
  };
  // front root (on the front half, pointing right, bent liftarm at the front)
  placeGroup(b, bigRoot(), Tm([-1, 0, 0, 0, -1, 0, 0, 0, 1], [80, -230, -60]), 2, "front root");
  // back root (pointing left, bent liftarm at the back)
  placeGroup(b, bigRoot(), Tm([1, 0, 0, 0, -1, 0, 0, 0, -1], [-80, -230, 40]), 2, "back root");
  b.step();

  // 10 / 11 two small roots: two 7L (resp. 11L + 7L) liftarms joined by a crosspiece; two pins
  //   at the right end of the front liftarm go into the end holes of the outer beams of the panels.
  const smallRootBase = (second: boolean) => {
    const r = new Build(lib, second ? "small root 2" : "small root 1");
    const back = r.place(second ? L11 : L7, second ? BROWN : DKORANGE, orient("-z", "+y", "+x", second ? [0, 0, 0] : [0, 0, 0]), second ? "root 11L" : "root 7L");
    const pb = pinAt(r, PIN, BLACK, back, [second ? 60 : 60, 0, 0], "U", 10);
    const cross = A(r, second ? L3 : L2, second ? BGREEN : RED, {
      to: pb,
      accept: (m) => Math.abs(X(m) - 60) < 1 && Math.abs(Y(m) + 20) < 1 && Math.abs(Z(m) - (second ? -20 : -10)) < 1,
      label: second ? "green 3L crosspiece" : "red 2L crosspiece",
    });
    const pf = pinAt(r, PIN, BLACK, cross, [60, -20, -20], "D", 10);
    const front = A(r, L7, DKORANGE, { to: pf, accept: (m) => Math.abs(Y(m)) < 1 && Math.abs(Z(m) + 20) < 1 && Math.abs(X(m) - 40) < 1, label: "front 7L" });
    const pins = [40, 100].map((x) => pinAt(r, PIN, BLACK, front, [x, 0, -20], "U", 10));
    const hs = [[-20, -20, front], [0, -20, front], [-20, 0, back], [0, 0, back]].map(([x, z, t]) => halfPin(r, t, [x, 0, z]));
    return { r, cross, pins, hs };
  };
  // small root 1 (step 10)
  {
    const { r } = smallRootBase(false);
    r.place("68568.dat", GREEN, Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [40, -18, 0]), "green quarter-round plate");
    r.place("22885.dat", BROWN, orient("-x", "+z", "+y", [30, 0, -70]), "brown 1x2 side-stud brick");
    r.place("15068.dat", GREEN, orient("+x", "+y", "+z", [30, -10, -50]), "green curved slope");
    r.place("15068.dat", GREEN, orient("-z", "+y", "+x", [-10, -10, -10]), "green curved slope");
    r.place("85984.dat", GREEN, orient("-x", "+z", "+y", [30, 0, -70]), "green 1x2 slope");
    // 10.10 upside down, running front-back on the left, pins into the outer beam end holes
    placeGroup(b, r, Tm([0, 0, 1, 0, -1, 0, 1, 0, 0], [-40, -230, -80]), 2, "small root 1");
  }
  // small root 2 (step 11): with the lime axle/pin cross block whose axle hole later holds the vine
  {
    const { r, cross } = smallRootBase(true);
    const p115 = pinAt(r, PIN, BLACK, cross, [60, -20, -40], "D", 10);
    const cb = A(r, "42003.dat", LIME, { to: p115, accept: (m) => Math.abs(Y(m)) < 1 && Math.abs(pt(m, [10, -20, 0])[0] - 80) < 12 && Math.abs(dir(m, [1, 0, 0])[2]) > 0.9, label: "lime axle/pin cross block" });
    halfPin(r, cb, [40, 0, -40]);
    r.place("68568.dat", GREEN, Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [40, -18, 0]), "green quarter-round plate");
    r.place("15068.dat", GREEN, orient("-z", "+y", "+x", [-10, -10, -10]), "green curved slope");
    // 11.9 upside down on the right, running front-back
    placeGroup(b, r, Tm([0, 0, -1, 0, -1, 0, -1, 0, 0], [40, -230, 60]), 2, "small root 2");
  }
  b.step();

  // 12 turn the tree over: roots at the bottom (rotate 180 degrees about the left-right axis)
  transformParts(b, Tm([1, 0, 0, 0, -1, 0, 0, 0, -1], [0, -240, 0]));
  // Now: lower trunk from y = -20 (bottom ends of the panels) to y = -240 (top ends); half 1
  // (lever) at the front (beams at z = -40), half 2 at the back (beams at z = 60).
  //   blue 3L pins (stop ring down) into the end holes either side of the front and back gaps
  const pins12 = [[-20, -40], [20, -40], [-20, 60], [20, 60]].map(([x, z]) => pinAt(b, PIN3, BLUE, b.parts.map((_, i) => i), [x, -240, z], "U", 10, { collar: 0 }));
  b.step();
  // 13 nougat 3L on the front pair, green 3L on the back pair, pins sticking 1L out above
  A(b, L3, NOUGAT, { to: pins12.slice(0, 2), minConnections: 2, accept: (m) => Math.abs(Y(m) + 250) < 1, label: "nougat 3L" });
  A(b, L3, BGREEN, { to: pins12.slice(2), minConnections: 2, accept: (m) => Math.abs(Y(m) + 250) < 1, label: "green 3L" });
  b.step();
  // 14 four brown 1L + dark grey 3L axle/pin (axle up) in the outer beam end holes
  for (const [x, z] of [[-60, -20], [60, -20], [-60, 40], [60, 40]]) {
    const ap = axlePinUp(b, [x, -240, z]);
    A(b, L1, BROWN, { to: ap, accept: (m) => Math.abs(Y(m) + 250) < 1, label: "brown 1L" });
  }
  b.step();

  // ======================= Bag 12: upper trunk (built in its own frame) =======================
  // U frame = the frame the lower trunk was built in (half 1 at the back, fronts facing -z).
  const U = new Build(lib, "upper trunk");
  // 15-17 panels + 4-pin cross blocks, as steps 1-3
  const pE = U.place(PANEL, BROWN, orient("+z", "+x", "+y", [-20, -110, 40]), "upper trunk panel E");
  const cE = [-50, -170].map((yy) => A(U, CONN4, LBG, { to: pE, where: all(near([-10, yy, 40], 21), axisIs("x")), minConnections: 2, accept: (m) => Math.abs(X(m)) < 1 && Math.abs(Y(m) - yy) < 1, label: "4-pin cross block" }));
  const pF = A(U, PANEL, BROWN, { to: cE, minConnections: 4, accept: (m) => X(m) > 10 && Z(m) > 30 && Math.abs(Y(m) + 110) < 1, label: "upper trunk panel F" });
  U.step();
  // 18 pin + green pin joiner + pin (left panel, middle of bottom 3-hole column)
  const p18 = pinAt(U, PIN, BLACK, pE, [-60, -50, 20], "F", 10);
  const j18 = A(U, JOIN, BGREEN, { to: p18, accept: (m) => Math.abs(Z(m) + 10) < 1, label: "green pin joiner" });
  A(U, PIN, BLACK, { to: j18, accept: (m) => Math.abs(Z(m) + 30) < 1 });
  U.step();
  // 19-20 half pins (stud front) at the bottom of both 4-hole columns + 1x1 flower plates
  const f19 = [-20, 20].map((x) => halfPinOut(U, x < 0 ? pE : pF, [x, -50, 40], "F"));
  f19.forEach((h, i) => U.place("24866.dat", i === 0 ? CORAL : LIME, orient("+x", "+z", "-y", [i === 0 ? -20 : 20, -50, 26]), "1x1 flower plate"));
  U.step();
  // 21 tan (free) 3L pins and black pins above the flowers
  const tanL = pinAt(U, PIN3F, TAN, pE, [-20, -90, 40], "F", 20, { collar: 10, label: "tan 3L pin (red lever pivot)" });
  const pL = [-130, -170].map((yy) => pinAt(U, PIN, BLACK, pE, [-20, yy, 40], "F", 10));
  const pR1 = pinAt(U, PIN, BLACK, pF, [20, -90, 40], "F", 10);
  const tanR = pinAt(U, PIN3F, TAN, pF, [20, -130, 40], "F", 20, { collar: 10, label: "tan 3L pin (branch pivot)" });
  const pR2 = pinAt(U, PIN, BLACK, pF, [20, -170, 40], "F", 10);
  U.step();
  // 22 brown 15L (left) and 11L (right) upright, bottom holes on the lowest of these pins
  const t15 = A(U, L15, BROWN, { to: [tanL, ...pL], minConnections: 3, accept: (m) => Math.abs(Z(m) - 20) < 1 && Math.abs(Y(m) + 230) < 1, label: "brown 15L (tallest)" });
  const t11 = A(U, L11, BROWN, { to: [pR1, tanR, pR2], minConnections: 3, accept: (m) => Math.abs(Z(m) - 20) < 1 && Math.abs(Y(m) + 190) < 1, label: "brown 11L" });
  U.step();
  // 23 nougat 3L on the top 3-hole column of the left panel, pin in its centre
  const p23 = [-190, -150].map((yy) => pinAt(U, PIN, BLACK, pE, [-60, yy, 20], "F", 10));
  const n23 = A(U, L3, NOUGAT, { to: p23, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1, label: "nougat 3L" });
  const p23c = pinAt(U, PIN, BLACK, n23, [-60, -170, 0], "F", 10);
  U.step();
  // 24 red 7L lever on the front part of the tan pin (second hole from the right), half pin at its right end
  const lever7 = A(U, L7, RED, { to: tanL, accept: (m) => Math.abs(Z(m)) < 1 && Math.abs(X(m) + 60) < 1 && Math.abs(Y(m) + 90) < 1 && Math.abs(dir(m, [0, 0, 1])[0]) > 0.9, label: "red 7L lever" });
  halfPinOut(U, lever7, [0, -90, 0], "F");
  U.step();
  // 25 branch: bent liftarm + red 2L axle + perpendicular axle connector + bush + #3 connector + yellow 3L axle
  {
    const br = new Build(lib, "branch 1");
    // frame: bent liftarm upright in the XY plane, 7L arm going up from its axle end, 3L arm bending right
    const bent = br.place(BENT, BROWN, orient("+x", "+z", "-y", [0, 0, 0]), "branch bent liftarm");
    halfPinOut(br, bent, [0, -20, 0], "F");
    const ax = A(br, AX2, RED, { to: bent, where: (s) => s.kind === "axle" && s.pos[1] < -100, offsets: [-30, -20, -10, 0, 10, 20, 30], accept: (m) => Math.abs(Z(m) + 10) < 1, label: "red 2L axle" });
    const axp = pt(br.parts[ax].m, [0, 0, 0]);
    const c6553 = A(br, "6553.dat", BLACK, { to: ax, accept: (m) => Math.abs(Z(m) - (axp[2] - 10)) < 1.5, prefer: (m) => pt(m, [0, 40, 0])[0] - pt(m, [0, 40, 0])[1] * 0.5, label: "axle connector with axle" });
    const tip = (i: number, l: V3) => pt(br.parts[i].m, l);
    if (DEBUG) br.parts.forEach((_, i) => dump(br, i, () => false));
    A(br, "32123b.dat", YELLOW, { to: c6553, accept: (m) => Math.hypot(...sub(org(m), tip(c6553, [0, 25, 0]))) < 3, label: "yellow half bush" });
    // #3 connector slid onto the axle up to the bush, its second hole bending towards the front;
    // yellow 3L axle pushed into that hole (placed from the geometry of the axle line)
    const u = dir(br.parts[c6553].m, [0, 1, 0]);
    const P = tip(c6553, [0, 30, 0]);
    const c3 = br.place("32016.dat", DKBROWN, frameM(cross([0, 0, 1], u), [0, 0, 1], [P[0] + 30 * u[0], P[1] + 30 * u[1], P[2] + 30 * u[2]]), "angle connector #3");
    yellowAxle(br, c3, [0, -11.5, 27.7], [0, -0.38, 0.92]);
    // 25.5 third hole from the bottom onto the tan pin at the bottom of the 11L
    placeGroup(U, br, Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [20, -90, 0]), 1, "branch 1");
  }
  U.step();
  // 26 brown 5L on the right panel (bottom hole of the top 3-hole column + top hole of the bottom one), 2 pins
  const p26 = [-150, -70].map((yy) => pinAt(U, PIN, BLACK, pF, [60, yy, 20], "F", 10));
  const f26 = A(U, L5, BROWN, { to: p26, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1, label: "brown 5L" });
  [-90, -110].forEach((yy) => pinAt(U, PIN, BLACK, f26, [60, yy, 0], "F", 10));
  U.step();
  if (DEBUG) U.render("/tmp/claude-1000/-home-jason-project/158bb350-4e99-4f4b-903e-c6c7e1d3b9d8/scratchpad/m08-09/upper1.png");

  // 27-34 second half of the upper trunk, described here in the standard orientation (curved
  //   sides at the back, as after step 32.1): panel G on the left, H on the right.
  const u2 = new Build(lib, "upper trunk half 2");
  const pG = u2.place(PANEL, BROWN, orient("+z", "+x", "+y", [-20, -110, 40]), "upper trunk panel G");
  const p28 = [-190, -110, -30].map((yy) => pinAt(u2, PIN3, BLUE, pG, [-10, yy, 40], "R", 10, { collar: 0 }));
  p28.forEach((p) => A(u2, L1, BGREEN, { to: p, accept: (m) => Math.abs(X(m)) < 1, label: "green 1L spacer" }));
  const pH = A(u2, PANEL, BROWN, { to: p28, minConnections: 3, accept: (m) => Math.abs(X(m) - 20) < 1 && Z(m) > 30 && Math.abs(Y(m) + 110) < 1, label: "upper trunk panel H" });
  const hp30 = halfPinOut(u2, pH, [20, -210, 40], "U");
  for (const x of [-20, 20]) for (const yy of [-50, -90, -130]) halfPinOut(u2, x < 0 ? pG : pH, [x, yy, 40], "B");
  const p32 = [-70, -30].map((yy) => pinAt(u2, PIN, BLACK, pG, [-60, yy, 20], "F", 10));
  [-190, -150].forEach((yy) => pinAt(u2, PIN, BLACK, pH, [60, yy, 20], "F", 10));
  // 33 brown 3L cross block with the perpendicular axle hole ("bushing") on the right; 5L on the left
  u2.place("63869.dat", BROWN, orient("+y", "-x", "+z", [80, -170, 0]), "brown cross block 3x2");
  A(u2, L5, BROWN, { to: p32, minConnections: 2, accept: (m) => Math.abs(X(m) + 60) < 1 && Math.abs(Y(m) + 70) < 1 && Math.abs(Z(m)) < 1, label: "brown 5L" });
  // 34 small flowering branch standing in the bushing: red 2L axle, dark green #5 connector,
  //    perpendicular axle connector with its axle in the #5, yellow bush, 3-prong bar + flower
  {
    const ax = u2.place(AX2, RED, frameM([0, 1, 0], [1, 0, 0], [80, -180, 0]), "red 2L axle");
    const c5 = u2.place("32015.dat", DKGREEN, frameM([0, 0, 1], [-1, 0, 0], [80, -210, 0]), "angle connector #5");
    const M = pt(u2.parts[c5].m, [0, -27.7, 11.5]), d = unitV(dir(u2.parts[c5].m, [0, -0.92, 0.38]));
    const nd: V3 = [-d[0], -d[1], -d[2]];
    const c53 = u2.place("6553.dat", BLACK, frameM([0, 0, 1], nd, [M[0] + 30 * d[0], M[1] + 30 * d[1], M[2] + 30 * d[2]]), "axle connector with axle");
    const bc = pt(u2.parts[c53].m, [0, 25, 0]);
    u2.place("32123b.dat", YELLOW, frameM([0, 0, 1], cross(d, [0, 0, 1]), bc), "yellow half bush");
    const hc = pt(u2.parts[c53].m, [0, 0, 0]);
    const bar = u2.place("68211.dat", BGREEN, frameM([1, 0, 0], [0, 0, -1], [hc[0], hc[1], hc[2] + 8]), "green 3-prong bar");
    const pr = pt(u2.parts[bar].m, [-6.1, -15.9, 0]), out = unitV(dir(u2.parts[bar].m, [-0.71, -0.71, 0]));
    u2.place("5904.dat", TYELLOW, frameM(cross([0, 0, 1], [-out[0], -out[1], -out[2]]), [-out[0], -out[1], -out[2]], [pr[0] + 3 * out[0], pr[1] + 3 * out[1], pr[2] + 3 * out[2]]), "trans-yellow flower");
    void ax;
  }
  // 35 turn it round and push it onto the first half
  placeGroup(U, u2, Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [0, 0, -20]), 3, "upper trunk half 2");
  U.step();
  // 36 pins + green 1L in the two top holes of the left outer column
  for (const z of [20, -40]) {
    const pp = pinAt(U, PIN, BLACK, U.parts.map((_, i) => i), [-60, -220, z], "U", 10);
    A(U, L1, BGREEN, { to: pp, accept: (m) => Math.abs(Y(m) + 230) < 1, label: "green 1L" });
  }
  U.step();
  // 37 dark green crown ("flower petal piece") on the stud of the half pin on top, frog on it
  {
    const hp = U.parts.findIndex((p) => p.file === HALFPIN && Math.abs(p.m[7] + 220) < 3 && p.m[11] < -40);
    const c = pt(U.parts[hp].m, [8, 0, 0]);
    U.place("39262.dat", DKGREEN, orient("+x", "+y", "+z", c), "dark green crown (flower)");
    U.place("33320.dat", GREEN, orient("+x", "+y", "+z", c), "green frog");
  }
  U.step();
  // 38 two pins in the top of the tallest (15L) liftarm + lime 2x4 L liftarm
  const p38 = [-370, -350].map((yy) => pinAt(U, PIN, BLACK, t15, [-20, yy, 20], "F", 10));
  const lime38 = A(U, "32140.dat", LIME, { to: p38, minConnections: 2, accept: (m) => Math.abs(Z(m)) < 1 && pt(m, [0, 0, 0])[0] > 30, label: "lime 2x4 L liftarm" });
  U.step();
  if (DEBUG) U.render("/tmp/claude-1000/-home-jason-project/158bb350-4e99-4f4b-903e-c6c7e1d3b9d8/scratchpad/m08-09/upper2.png");
  // 39 upper trunk turned round, pushed from the top onto the lower trunk
  const upperOff = b.parts.length;
  placeGroup(b, U, Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [0, -260, 0]), 8, "upper trunk");
  b.step();
  // From here on everything is in the final frame: lever (camera trap) on the left, lower trunk
  // half 1 at the front. Tallest (15L) liftarm at x = 20, z = -20, holes y = -350 .. -630.

  // 40 / 44 two big branches: bent liftarm 1 (3L arm upright against the trunk, two pins into an
  //   upright liftarm), bent liftarm 2 on its end (on a blue axle/pin + dark grey axle/pin),
  //   forming an arch. Built for the first branch (corner pin into the 15L, arch to the right).
  const mkBranch = (halfPinToo: boolean) => {
    const r = new Build(lib, "branch");
    const b1 = r.place(BENT, BROWN, frameM([0.6, 0.8, 0], [0, 0, -1], [116, -662, -40]), "branch bent liftarm 1");
    r.place(AXPIN, BLUE, frameM([0, 0, -1], [0, 1, 0], [20, -550, -30]), "blue axle/pin");
    r.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [20, -590, -30]), "black pin");
    if (halfPinToo) halfPinOut(r, b1, [52, -614, -40], "B");
    r.place(AXPIN3, DBG, frameM([0, 0, -1], [0, 1, 0], [116, -662, -20]), "dark grey axle/pin");
    r.place(AXPIN, BLUE, frameM([0, 0, 1], [0, 1, 0], [84, -638, -30]), "blue axle/pin");
    r.place(BENT, BROWN, frameM([-0.28, 0.96, 0], [0, 0, -1], [231.2, -628.4, -20]), "branch bent liftarm 2");
    return r;
  };
  const branchL = placeGroup(b, mkBranch(true), IDENTITY, 2, "top branch (right)", 8);
  b.step();
  // 41 four pin assemblies (blue 3L pin + green 1L) in the front-facing end holes of the 4-pin cross
  //    blocks in the front gap (bottom, top, 3rd and 4th from the top)
  const pa41: Record<number, number> = {};
  for (const yy of [-50, -450, -330, -290]) {
    const p = pinAt(b, PIN3, BLUE, b.parts.map((_, i) => i), [0, yy, -40], "F", 20, { collar: 30 });
    A(b, L1, BGREEN, { to: p, accept: (m) => Math.abs(Z(m) + 60) < 1, label: "green 1L" });
    pa41[yy] = p;
  }
  b.step();
  // 42 brown 15L, top hole on the second of these pins from the bottom, bottom level with the tree
  A(b, L15, BROWN, { to: [pa41[-290], pa41[-50]], minConnections: 2, accept: (m) => Math.abs(Z(m) + 80) < 1 && Math.abs(Y(m) + 150) < 1 && Math.abs(X(m)) < 1, label: "brown 15L (front)" });
  b.step();
  // 43 yellow T liftarm + 11L on two pins; 11L upright on the top and 3rd-from-top pins, T at the top behind it
  {
    const r = new Build(lib, "T assembly");
    r.place("60484.dat", YELLOW, orient("+x", "+z", "-y", [0, -490, -60]), "yellow T liftarm");
    r.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [0, -530, -70]), "black pin");
    r.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [0, -490, -70]), "black pin");
    r.place(L11, BROWN, orient("+x", "+z", "-y", [0, -430, -80]), "brown 11L (front)");
    placeGroup(b, r, IDENTITY, 2, "T assembly");
  }
  b.step();
  // 44 second big branch on the top hole of the upright 11L (x = -20), arch to the left
  const branchR = placeGroup(b, mkBranch(false), Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [0, 40, -40]), 2, "top branch (left)", 8);
  b.step();
  // 45 red half pins (stud out) either side of the gap on the back of the lower trunk (the book
  //    views the tree from the back here)
  for (const x of [-20, 20]) halfPinOut(b, b.parts.map((_, i) => i), [x, -190, 60], "B");
  b.step();

  // ======================= Bags 13-14: research platform ======================================
  // Built in the platform frame P: base 15L liftarms along X (holes 0..14 at x = 0..280), back one
  // at z = 0, front one at z = -160, joined by a 3x7 panel; hollow-frame tower on the panel;
  // two 11L "extensions" pivoting on the left end holes, braced by 9L liftarms; slanted 1x12
  // bricks carrying the floor. Everything is placed from the computed geometry.
  const PL = new Build(lib, "research platform");
  const pp = (file: string, color: number, m: Mat4, label?: string) => PL.place(file, color, m, label);
  const Mz = (x: number, y: number, z: number) => orient("+y", "+z", "+x", [x, y, z]); // liftarm along X, holes along Z
  const Mv = (x: number, y: number, z: number) => orient("-x", "+z", "+y", [x, y, z]); // liftarm upright, holes along Z
  const pinZ = (file: string, color: number, x: number, y: number, z: number, sign = 1, label?: string) =>
    pp(file, color, frameM([0, 0, sign], [0, 1, 0], [x, y, z]), label);
  const pinY = (file: string, color: number, x: number, y: number, z: number, sign = -1, label?: string) =>
    pp(file, color, frameM([0, sign, 0], [0, 0, 1], [x, y, z]), label);
  // 46-47 back 15L, handle pins, blue 3L pin + tan 1L at the right end (sticking out backwards)
  pp(L15, LBG, Mz(140, 0, 0), "platform back 15L");
  for (const x of [20, 60]) pinZ(PIN, BLACK, x, 0, -10);
  pinZ(PIN3, BLUE, 280, 0, 20, 1, "blue 3L pin");
  pp(L1, TAN, frameM([1, 0, 0], [0, 0, 1], [280, 0, 20]), "tan 1L");
  // 48 handle: red 3x5 L liftarm (corner beyond the left end), 2 blue 3L pins, dark grey 3L, red 5L
  const handle = (zL: number, sgn: number) => {
    pp("2477.dat", RED, orient("-y", "+z", "-x", [60, 0, zL]), "handle red L liftarm");
    for (const y of [0, -40]) pinZ(PIN3, BLUE, -20, y, zL + 20 * sgn, sgn, "blue 3L pin");
    pp(L3, DBG, Mv(-20, -20, zL + 20 * sgn), "dark grey 3L");
    pp(L5, RED, Mv(-20, -20, zL + 40 * sgn), "red 5L");
  };
  handle(-20, -1);
  // 49 dark grey 3x7 panel, pinned between the two 15L liftarms (holes 4 and 6)
  pp("71709.dat", DBG, orient("+z", "-y", "+x", [100, 0, -80]), "dark grey 3x7 panel");
  for (const x of [80, 120]) { pinZ(PIN, BLACK, x, 0, -10); pinZ(PIN, BLACK, x, 0, -150); }
  // 50 front 15L with the mirrored handle and the blue pin + tan 1L at its right end
  pp(L15, LBG, Mz(140, 0, -160), "platform front 15L");
  handle(-140, 1);
  for (const x of [20, 60]) pinZ(PIN, BLACK, x, 0, -150);
  pinZ(PIN3, BLUE, 280, 0, -180, -1, "blue 3L pin");
  pp(L1, TAN, frameM([1, 0, 0], [0, 0, 1], [280, 0, -180]), "tan 1L");
  // 51 pins up in the L liftarms + yellow 7L across
  for (const z of [-20, -140]) pinY(PIN, BLACK, 40, -10, z);
  pp(L7, YELLOW, orient("+x", "+y", "+z", [40, -20, -80]), "yellow 7L");
  // 52 blue 3L pins through the panel (tan 1L on their lower end - see notes)
  for (const z of [-40, -120]) { pinY(PIN3, BLUE, 120, 0, z, 1, "blue 3L pin"); pp(L1, TAN, orient("+x", "+y", "+z", [120, 20, z]), "tan 1L"); }
  // 53 two 5x7 hollow frames standing front-back on the panel, joined by a dark grey 3L
  for (const zc of [-20, -140]) pp("64179.dat", LBG, orient("+z", "+x", "+y", [120, -80, zc]), "hollow frame 5x7");
  for (const y of [-80, -40]) pinZ(PIN3, BLUE, 120, y, -80, 1, "blue 3L pin");
  pp(L3, DBG, Mv(120, -60, -80), "dark grey 3L");
  for (const zc of [-20, -140]) for (const dz of [-20, 20]) pinY(PIN, BLACK, 120, -150, zc + dz);
  pp("32526.dat", LBG, orient("-x", "-y", "+z", [120, -160, -60]), "grey 3x5 L liftarm");
  pp("32526.dat", LBG, orient("-x", "+y", "-z", [120, -160, -100]), "grey 3x5 L liftarm");
  pinZ(PIN, BLACK, 120, -80, 10, 1, "pin (inside back frame)");
  pinZ(PIN, BLACK, 120, -80, -170, 1, "pin (inside front frame)");
  pinZ(PIN, BLACK, 120, -120, 30, 1, "pin (top of back frame)");
  pinZ(PIN, BLACK, 120, -120, -190, 1, "pin (top of front frame)");
  // 54 extensions: grey 11L pivoting on a dark grey axle/pin in the left end hole of each 15L,
  //    grey axle/pin cross block at the far end, red 1/2 pins, pin for the brace
  const u: V3 = unitV([-39.6, -113.5, 0]); // direction pivot -> far end (braced by the 9L, step 55)
  const hole = (k: number): V3 => [(10 - k) * 20 * u[0], (10 - k) * 20 * u[1], 0];
  const ext = (ze: number, s: number) => {
    const c = hole(5);
    pp(L11, LBG, frameM([u[1], -u[0], 0], [0, 0, 1], [c[0], c[1], ze]), "grey 11L extension");
    for (const k of [0, 1]) { const h = hole(k); pinZ(PIN, BLACK, h[0], h[1], ze + 10 * s); }
    const h0 = hole(0);
    pp("42003.dat", LBG, frameM([-u[1], u[0], 0], [-u[0], -u[1], 0], [h0[0], h0[1], ze + 20 * s]), "grey axle/pin cross block");
    for (const k of [2, 3]) { const h = hole(k); pp(HALFPIN, RED, frameM([0, 0, -s], [0, 1, 0], [h[0], h[1], ze - 10 * s]), "red 1/2 pin with stud"); }
    const h4 = hole(4);
    pinZ(PIN, BLACK, h4[0], h4[1], ze + 10 * s);
    pp(AXPIN3, DBG, frameM([0, 0, -s], [0, 1, 0], [0, 0, ze]), "dark grey axle/pin (pivot)");
    // 63 handle: red 3L axle joiner + red 2L axle + red ball on the pivot's axle end
    pp(AXJ3, RED, frameM([1, 0, 0], [0, 1, 0], [0, 0, ze - 40 * s]), "red 3L axle joiner");
    pp(AX2, RED, frameM([0, 0, 1], [0, 1, 0], [0, 0, ze - 70 * s]), "red 2L axle");
    pp(BALL, RED, frameM([1, 0, 0], [0, 0, s], [0, 0, ze - 84 * s]), "red ball");
    // 55 black 9L brace from the pin inside the hollow frame to the pin in hole 4
    const f: V3 = [120, -80, 0], d = unitV([h4[0] - f[0], h4[1] - f[1], 0]);
    pp(L9, BLACK, frameM([-d[1], d[0], 0], [0, 0, 1], [(f[0] + h4[0]) / 2, (f[1] + h4[1]) / 2, ze + 20 * s]), "black 9L brace");
    return h0;
  };
  const h0 = ext(-180, 1);
  ext(20, -1);
  // 56 slanted grey 1x12 bricks with holes (end holes on the 15L end pin and the frame top pin,
  //    3-4-5 triangle) with 5 grey jumper plates each
  for (const z of [-200, 40]) {
    const br = pp("3895.dat", LBG, frameM([0.8, 0.6, 0], [-0.6, 0.8, 0], [206, -68, z]), "grey 1x12 brick with holes");
    for (const c of [100, 60, 20, -20, -60]) pp("15573.dat", LBG, mul(PL.parts[br].m, Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [c, -8, 0])), "grey jumper plate");
  }
  // 73 + 75 blue axle/pins in the cross blocks' axle holes, black 9L cross bar with two grey balls
  {
    const a: V3 = [-0.944, 0.329, 0]; // axle hole axis of the cross blocks, pointing to the trunk side
    const ah: V3 = [h0[0] + 20 * u[0], h0[1] + 20 * u[1], 0];
    for (const z of [-160, 0]) pp(AXPIN, BLUE, frameM([-a[0], -a[1], 0], [0, 0, 1], [ah[0] + 10 * a[0], ah[1] + 10 * a[1], z]), "blue axle/pin");
    const c9: V3 = [ah[0] + 20 * a[0], ah[1] + 20 * a[1], -80];
    pp(L9, BLACK, frameM([a[1], -a[0], 0], a, c9), "black 9L cross bar");
    for (const z of [-100, -60]) {
      pp(AXPIN, BLUE, frameM([-a[0], -a[1], 0], [0, 0, 1], [c9[0] - 10 * a[0], c9[1] - 10 * a[1], z]), "blue axle/pin");
      pp(BALL, LBG, frameM([0, 0, 1], a, [c9[0] - 24 * a[0], c9[1] - 24 * a[1], z]), "grey ball");
    }
  }
  // 71 tan round 1x2 plate + lime 1x1 curved brick + lime cherries on the front extension's studs;
  // 72 grey jumper + pale yellow butterfly on the back extension's studs (plates stand upright)
  {
    const k2 = hole(2), k3 = hole(3), mid: V3 = [(k2[0] + k3[0]) / 2, (k2[1] + k3[1]) / 2, 0];
    // plate lying against the extension, anti-studs on the two half-pin studs, top facing outwards
    const plateOn = (z: number, sgn: number) => frameM([-u[0], -u[1], 0], [0, 0, sgn], [mid[0], mid[1], z]);
    const pf = pp("35480.dat", TAN, plateOn(-194 - 8, 1), "tan 1x2 round plate");
    pp("49307.dat", LIME, mul(PL.parts[pf].m, Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [10, 0, 0])), "lime 1x1 curved brick");
    pp("22667.dat", LIME, mul(PL.parts[pf].m, Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [-10, 0, 0])), "lime cherries");
    const jp = pp("15573.dat", LBG, plateOn(34 + 8, -1), "grey jumper plate");
    pp("80674.dat", PALEYEL, PL.parts[jp].m, "pale yellow butterfly");
  }

  // 64-70 floor (built in its own frame F: 14 x 10 studs, top surface y = 0), put on the jumper
  //   plates of the slanted bricks. Leveled frame P' = Rz(P); F -> P': (144 - z, y - 194, x - 80).
  const RzInv = Tm([0.8, -0.6, 0, 0.6, 0.8, 0, 0, 0, 1], [0, 0, 0]);
  const FtoP = mul(RzInv, Tm([0, 0, -1, 0, 1, 0, 1, 0, 0], [144, -194, -80]));
  const pf = (file: string, color: number, m: Mat4, label?: string) => PL.place(file, color, mul(FtoP, m), label);
  const F = (x: number, y: number, z: number, r: "x" | "z" = "x") => (r === "x" ? orient("+x", "+y", "+z", [x, y, z]) : orient("+z", "+y", "-x", [x, y, z]));
  pf("91988.dat", TAN, F(0, 0, 80), "tan 2x14 plate");
  pf("3456.dat", TAN, F(0, 0, 0), "tan 6x14 plate");
  pf("91988.dat", TAN, F(0, 0, -80), "tan 2x14 plate");
  for (const x of [130, -130]) pf("4477.dat", DKTAN, F(x, -8, 0, "z"), "dark tan 1x10 plate");
  for (const x of [-130, 130]) for (const z of [-40, 40]) pf("3633.dat", TAN, F(x, -32, z, "z"), "tan lattice fence");
  for (const z of [-90, 90]) for (const x of [-40, 40]) pf("3633.dat", TAN, F(x, -24, z), "tan lattice fence");
  // 68 table: 2x2 round brick, 4x4 round plate, red leaf plate + yellow horn, tan tile, mushroom
  pf("3941.dat", BROWN, F(0, -24, 0), "brown 2x2 round brick");
  pf("60474.dat", DKBROWN, F(0, -32, 0), "dark brown 4x4 round plate");
  pf("32607.dat", RED, F(-10, -40, 30), "red 1x1 round plate with leaves");
  pf("53451.dat", YELLOW, F(-10, -40, 30), "yellow horn");
  pf("3069b.dat", TAN, F(20, -40, 10), "tan 1x2 tile");
  pf("59900.dat", WHITE, F(10, -56, -30), "white 1x1 cone");
  pf("4740.dat", TORANGE, F(10, -56, -30), "trans-orange 2x2 dish");
  // 69 butterfly and frog on the floor
  pf("80674.dat", AQUA, F(-90, 0, -50), "pale blue butterfly");
  pf("33320.dat", GOLD, F(90, 0, -70), "gold frog");
  // 57-62 three researchers standing on the floor (loose), with their tools
  const fig = (x: number, z: number, legs: number, torso: number, hat: string, hatC: number, tools: [string, number][]) => {
    const T0 = (dx: number, dy: number, dz: number) => F(x + dx, -72 + dy, z + dz);
    pf("73200b.dat", legs, T0(0, 32, 0), "minifig legs");
    pf("76382.dat", torso, T0(0, 0, 0), "minifig torso with arms and hands");
    pf("3626c.dat", YELLOW, T0(0, -24, 0), "minifig head");
    pf(hat, hatC, T0(0, -24, 0), "minifig headgear");
    tools.forEach(([t, c], i) => pf(t, c, T0(i === 0 ? -25 : 25, 34, -17), "minifig tool"));
  };
  fig(-80, -20, DKTAN, BGREEN, "2514.dat", DKGREEN, [["64644.dat", DKBROWN], ["30089b.dat", BLACK]]);
  fig(0, -60, DKBROWN, BROWN, "30381.dat", BROWN, [["24324.dat", BROWN], ["30162.dat", 321]]);
  fig(90, 40, DKGREEN, DKGREEN, "61506.dat", DKBROWN, [["10830p01.dat", BLACK]]);
  pf("24093.dat", BROWN, F(-24, -46, -80), "book cover");
  pf("3069b.dat", TAN, F(-24, -46, -80), "tan 1x2 tile (book page)");

  // 74-75 the platform goes round the trunk: turned so the floor is level and at the back, the
  //   extensions either side of the trunk, the cross bar's balls either side of the front 15L.
  //   It is a loose assembly held by the trunk (raised by lifting the red handle balls).
  const Rz = Tm([0.8, 0.6, 0, -0.6, 0.8, 0, 0, 0, 1], [0, 0, 0]);
  const platformY = Number(process.env.M0809_PY ?? -103), platformZ = Number(process.env.M0809_PZ ?? -106);
  const W = mul(Tm([0, 0, 1, 0, 1, 0, -1, 0, 0], [80, platformY, platformZ]), Rz);
  const platform = placeGroup(b, PL, W, 0, "research platform", 1e9);
  if (DEBUG) { const bb = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }; for (const i of platform) { const q = b.bounds(i); for (let k = 0; k < 3; k++) { bb.min[k] = Math.min(bb.min[k], q.min[k]); bb.max[k] = Math.max(bb.max[k], q.max[k]); } } console.log("platform bounds", bb.min.map(Math.round), bb.max.map(Math.round)); }
  b.step();

  // ======================= Bag 15: the vine (Mission 08) =====================================
  // 76 tan (free) axle/pin in the axle hole of the lime cross block of the small root on the right
  //    (axis along X), lime 5L on its pin: the vine's swinging arm.
  const rootHole: V3 = [80, -10, 20];
  b.place(AXPINT, TAN, frameM([-1, 0, 0], [0, 1, 0], [90, rootHole[1], rootHole[2]]), "tan axle/pin (vine arm pivot)");
  // 77-90 vine, built in its own frame V (tan axle/pin at the origin, its pin pointing +Z)
  const V = new Build(lib, "vine");
  {
    const perp = (d: V3): V3 => (Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    V.place(AXPINT, TAN, frameM([0, 0, -1], [0, 1, 0], [0, 0, 0]), "tan axle/pin");
    let P: V3 = [0, 0, 0], d: V3 = [0, 0, -1];
    const add3 = (a: V3, c: V3, k = 1): V3 => [a[0] + k * c[0], a[1] + k * c[1], a[2] + k * c[2]];
    const axle = () => V.place(AX2, RED, frameM(d, perp(d), P), "red 2L axle");
    const joiner = (color: number) => {
      const y = perp(d), x = cross(y, d);
      V.place(AXJ3, color, frameM(x, y, add3(P, d, 30)), "3L axle joiner");
      P = add3(P, d, 60);
    };
    const tube = (color: number, dn: V3) => {
      V.place(TUBE, color, frameM(d, cross(dn, d), add3(P, d, 30)), "90 degree tube");
      P = add3(add3(P, d, 30), dn, 30);
      d = dn;
    };
    const L: V3 = [-1, 0, 0], R: V3 = [1, 0, 0], Fw: V3 = [0, 0, -1], Bk: V3 = [0, 0, 1], Up: V3 = [0, -1, 0];
    joiner(DKGREEN); axle(); joiner(DKGREEN); axle(); // 77-78
    tube(DKTAN, L); axle(); // 79
    joiner(NOUGAT84); axle(); joiner(NOUGAT84); axle(); // 80
    tube(BGREEN, Bk); axle(); // 81
    joiner(DKGREEN); axle(); // 82
    tube(BGREEN, L); axle(); tube(BGREEN, Fw); axle(); // 83
    tube(DKTAN, L); axle(); tube(BGREEN, Bk); axle(); // 84
    tube(DKTAN, L); axle(); tube(DKTAN, Fw); axle(); // 85
    tube(DKTAN, L); axle(); tube(DKTAN, Bk); axle(); // 86
    joiner(DKGREEN); axle(); tube(DKTAN, L); axle(); // 87
    tube(DKTAN, Up); axle(); // 88
    tube(DKTAN, R); axle(); // 89
    // 90 grey ball on the last axle
    V.place(BALL, LBG, frameM(perp(d), [-d[0], -d[1], -d[2]], add3(P, d, 14)), "grey ball (vine end)");
  }
  // 91-92 the vine's pin goes into the far hole of the lime 5L; the vine is swung up so its ball
  //   hooks over the small flowering branch. Both joints turn about X: solve the two angles so the
  //   ball sits on the branch's axle connector.
  {
    // the ball rests in the crook of the dark green #5 connector of the flowering branch
    const conn = b.parts.findIndex((p, i) => i >= upperOff && p.file === "32015.dat");
    const hook = org(b.parts[conn].m);
    const target: [number, number] = [hook[1] - 40, hook[2]]; // (y, z) of the ball centre
    const ball = V.parts[V.parts.length - 1].m; // ball centre in V: V x -> world z, V y -> world y
    const off: [number, number] = [ball[7], ball[3]];
    const pivot: [number, number] = [rootHole[1], rootHole[2]];
    let best = { err: Infinity, phi: 0, psi: 0 };
    for (let phi = -Math.PI; phi < Math.PI; phi += Math.PI / 720) {
      // 5L far hole: 80 LDU from the pivot, initially towards -z
      const tip: [number, number] = [pivot[0] - 80 * Math.sin(phi), pivot[1] - 80 * Math.cos(phi)];
      const want: [number, number] = [target[0] - tip[0], target[1] - tip[1]];
      const err = Math.abs(Math.hypot(...want) - Math.hypot(...off));
      if (err < best.err) best = { err, phi, psi: Math.atan2(want[0], want[1]) - Math.atan2(off[0], off[1]) };
    }
    const Rx = (a: number, c: V3): Mat4 => {
      const co = Math.cos(a), si = Math.sin(a);
      // rotation about the X axis through c, turning +z towards -y for positive a
      return new Float64Array([1, 0, 0, 0, 0, co, -si, c[1] - co * c[1] + si * c[2], 0, si, co, c[2] - si * c[1] - co * c[2]]);
    };
    // lime 5L (holes along Z at first), rotated by phi about the pivot
    const R5 = Rx(-best.phi, [0, pivot[0], pivot[1]]);
    b.place(L5, LIME, mul(R5, orient("-y", "+x", "+z", [100, pivot[0], pivot[1] - 40])), "lime 5L (vine arm)");
    const tipW = pt(R5, [100, pivot[0], pivot[1] - 80]);
    // vine: V z -> -x, V x -> +z, V y -> +y, origin at the 5L's far hole (outer face), then turned by psi
    const base = Tm([0, 0, -1, 0, 1, 0, 1, 0, 0], [110, tipW[1], tipW[2]]);
    const Tv = mul(Rx(-best.psi, [0, tipW[1], tipW[2]]), base);
    if (DEBUG) console.log("vine solve", JSON.stringify(best), "target", target, "tip", tipW.map(Math.round), "ball", org(mul(Tv, ball)).map(Math.round), "off", off);
    placeGroup(b, V, Tv, 1, "vine", 1e9);
  }
  b.step();

  // ======================= Bag 15: leaves, bird and the seed ===================================
  // (tree seen from the back in the book here: its "left" branch is the top one, arching to +x)
  // 93 pins + brown 3L bar
  const bentEnd = (T: Mat4 | null, p: V3): V3 => (T ? pt(T, p) : p);
  const mirrorB = Tm([-1, 0, 0, 0, 1, 0, 0, 0, -1], [0, 40, -40]);
  b.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [0, -630, -10]), "black pin");
  b.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [-20, -630, -10]), "black pin");
  b.place("87994.dat", BROWN, frameM([1, 0, 0], [0, 0, 1], [52, -614, -46]), "brown 3L bar");
  b.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [135.2, -656.4, -10]), "black pin");
  { const q = bentEnd(mirrorB, [135.2, -656.4, -10]); b.place(PIN, BLACK, frameM([0, 0, 1], [0, 1, 0], [q[0], q[1], -30]), "black pin"); }
  b.step();
  // 94 brown 1x1 bricks with axle hole on red 2L axles in the far axle holes of both branches
  const brick1 = (end: V3) => {
    b.place(AX2, RED, frameM([0, 0, 1], [0, 1, 0], [end[0], end[1], -30]), "red 2L axle");
    return b.place("73230.dat", BROWN, orient("+x", "+y", "+z", [end[0], end[1] - 10, -40]), "brown 1x1 brick with axle hole");
  };
  const endL: V3 = [231.2, -628.4, 0], endR = bentEnd(mirrorB, [231.2, -628.4, 0]);
  const bL1 = brick1(endL), bR1 = brick1([endR[0], endR[1], 0]);
  b.step();
  // 95 brown 1x2 bricks with holes on the pin pairs (left branch front, right branch back, lime L back)
  const bL2 = b.place("32000.dat", BROWN, frameM([0.96, 0.28, 0], [-0.28, 0.96, 0], [128.4, -668.8, 0]), "brown 1x2 brick with holes");
  const bR2 = b.place("32000.dat", BROWN, frameM([-0.96, 0.28, 0], [0.28, 0.96, 0], [-128.4, -628.8, -40]), "brown 1x2 brick with holes");
  const bT2 = b.place("32000.dat", BROWN, orient("+x", "+y", "+z", [-10, -640, -20]), "brown 1x2 brick with holes");
  b.step();
  // 96-101 leaf clusters (6x5 plant leaves, round plates, carrot-top "leaf bars"). Built in a
  // local frame whose origin is the anti-stud that goes on the mounting stud; the cluster is
  // then turned (yaw) and put on that stud. Positions follow the text; the 45-degree turns
  // are approximated.
  const leafM = (pointTo: "+x" | "-x" | "-z", x: number, y: number, z: number, yawDeg = 0) => {
    const base = pointTo === "+x" ? orient("+z", "+y", "-x") : pointTo === "-x" ? orient("-z", "+y", "+x") : orient("+x", "+y", "+z");
    return mul(Tm([Math.cos((yawDeg * Math.PI) / 180), 0, Math.sin((yawDeg * Math.PI) / 180), 0, 1, 0, -Math.sin((yawDeg * Math.PI) / 180), 0, Math.cos((yawDeg * Math.PI) / 180)], [x, y, z]), base);
  };
  type LP = [string, number, Mat4, string];
  const cluster = (parts: LP[], mount: Mat4) => { for (const [f, c, m, l] of parts) b.place(f, c, mul(mount, m), l); };
  const onStud = (brick: number, local: V3, yawDeg: number) => {
    const p = pt(b.parts[brick].m, local);
    const a = (yawDeg * Math.PI) / 180;
    return Tm([Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)], p);
  };
  const LV = "2417.dat", RP = "32607.dat", CT = "33183.dat", RPL = "35480.dat";
  // 96 green cluster on the 1x1 brick at the end of the top ("left") branch, overhanging outwards
  cluster([
    [LV, GREEN, leafM("+x", -100, 8, 60), "green plant leaves"],
    [LV, GREEN, leafM("-z", 40, 0, 60), "green plant leaves"],
    [RP, RED, orient("+x", "+y", "+z", [0, -8, 100]), "red 1x1 round plate with leaves"],
    [CT, LTORANGE, orient("+x", "+y", "+z", [0, 0, 100]), "orange leaf bar"],
    [LV, GREEN, leafM("+x", -60, -8, 0), "green plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [0, 0, 0]), "lime leaf bar"],
  ], onStud(bL1, [0, 0, 0], 180));
  // 97 lime cluster on the 1x2 brick of the top branch (via a lime round 1x2 plate)
  cluster([
    [RPL, LIME, orient("+z", "+y", "-x", [0, 0, 0]), "lime 1x2 round plate"],
    [LV, LIME, leafM("-x", 60, 8, 10), "lime plant leaves"],
    [LV, LIME, leafM("+x", -60, 8, -10), "lime plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [0, 8, -10]), "lime leaf bar"],
    [LV, LIME, leafM("-x", -110, 16, -40, -45), "lime plant leaves"],
    [RP, RED, orient("+x", "+y", "+z", [-150, 8, -80]), "red 1x1 round plate with leaves"],
    [CT, LTORANGE, orient("+x", "+y", "+z", [-150, 16, -80]), "orange leaf bar"],
  ], onStud(bL2, [0, 0, 0], 90));
  // 98 bird (white 1x1 parts, orange beak, red clip) clipped onto the brown 3L bar
  {
    const c: V3 = [52, -614, 4];
    const Bm = (dx: number, dy: number, dz: number, r = orient("+x", "+y", "+z")) => mul(Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [c[0] + dx, c[1] + dy, c[2] + dz]), r);
    b.place("3484.dat", YELLOW, Bm(0, -34, 0), "yellow bar with clip");
    b.place("85861.dat", WHITE, Bm(0, -42, 0), "white 1x1 round plate");
    b.place("4733.dat", WHITE, Bm(0, -66, 0), "white 1x1 brick with 4 side studs");
    b.place("85861.dat", WHITE, Bm(-14, -56, 0, orient("-y", "+x", "+z")), "white 1x1 round plate");
    b.place("85861.dat", WHITE, Bm(-22, -56, 0, orient("-y", "+x", "+z")), "white 1x1 round plate");
    b.place("54200.dat", RED, Bm(14, -56, 0, orient("+y", "-x", "+z")), "red 1x1 slope");
    b.place("49668.dat", WHITE, Bm(0, -56, -14, orient("+x", "-z", "+y")), "white 1x1 tooth plate (wing)");
    b.place("49668.dat", WHITE, Bm(0, -56, 14, orient("-x", "+z", "+y")), "white 1x1 tooth plate (wing)");
    b.place("49668.dat", LTORANGE, Bm(0, -74, 0, orient("-z", "+y", "+x")), "orange 1x1 tooth plate (beak)");
    b.place("15712.dat", RED, Bm(0, -82, 0), "red 1x1 tile with clip");
  }
  // 99 lime cluster on the 1x2 brick behind the lime L liftarm
  cluster([
    [RPL, LIME, orient("+z", "+y", "-x", [0, 0, 0]), "lime 1x2 round plate"],
    [LV, LIME, leafM("+x", -60, 8, 10), "lime plant leaves"],
    [LV, LIME, leafM("-x", 60, 8, -10), "lime plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [0, 8, 10]), "lime leaf bar"],
    [LV, LIME, leafM("-x", 110, 0, -40, 45), "lime plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [150, 8, -80]), "lime leaf bar"],
  ], onStud(bT2, [0, 0, 0], 90));
  // 100 green cluster with the songbird on the 1x2 brick of the lower ("right") branch
  cluster([
    [RPL, LIME, orient("+z", "+y", "-x", [0, 0, 0]), "lime 1x2 round plate"],
    [LV, GREEN, leafM("-x", 60, 8, 10), "green plant leaves"],
    [LV, GREEN, leafM("+x", -60, 8, -10), "green plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [0, 8, -10]), "lime leaf bar"],
    ["39262.dat", GOLD, orient("+x", "+y", "+z", [60, 0, 10]), "gold flower (crown)"],
    ["41835.dat", PALEYEL, orient("+x", "+y", "+z", [60, -8, 10]), "pale yellow songbird"],
    [LV, GREEN, leafM("-x", -110, 16, -30), "green plant leaves"],
    [RP, RED, orient("+x", "+y", "+z", [-150, 8, -30]), "red 1x1 round plate with leaves"],
    [CT, LTORANGE, orient("+x", "+y", "+z", [-150, 16, -30]), "orange leaf bar"],
  ], onStud(bR2, [0, 0, 0], 90));
  // 101 small green cluster on the 1x1 brick at the end of the lower branch
  cluster([
    [LV, GREEN, leafM("-x", 60, 8, 0), "green plant leaves"],
    [LV, GREEN, leafM("-z", 0, 0, 60), "green plant leaves"],
    [CT, LIME, orient("+x", "+y", "+z", [0, 8, 0]), "lime leaf bar"],
  ], onStud(bR1, [0, 0, 0], 0));
  b.step();

  // 102 the seed ("pinecone"): red #1 connector, red 2L axle, brown cone, brown 2L bar with stop,
  //   brown 1x1 brick with 4 side studs and four brown 3-prong bars; its pin hole hangs on the
  //   yellow axle of the branch near the top of the trunk (loose game piece).
  {
    const ya = b.parts.findIndex((p) => p.file === "4519.dat" && p.color === YELLOW);
    const D = unitV(dir(b.parts[ya].m, [1, 0, 0]));
    const tip = pt(b.parts[ya].m, [18, 0, 0]);
    const T = frameM(D, unitV(cross([0, -1, 0], D)), tip); // x along the axle, z (nearly) up
    const Pm = (x: number, y: number, z: number, r: Mat4) => mul(T, mul(Tm([1, 0, 0, 0, 1, 0, 0, 0, 1], [x, y, z]), r));
    // in T: local z = (0,-1,0) world (up), so "down" = -z
    b.place("32013.dat", RED, Pm(0, 0, 0, orient("+x", "+y", "+z")), "red angle connector #1 (seed)");
    b.place(AX2, RED, Pm(0, 0, -30, orient("+z", "+y", "-x")), "red 2L axle (seed)");
    b.place("59900.dat", BROWN, Pm(0, 0, -64, orient("+x", "+z", "-y")), "brown 1x1 cone (seed)");
    b.place("78258.dat", BROWN, Pm(0, 0, -76, orient("+x", "+z", "-y")), "brown 2L bar with stop (seed)");
    const bz = -112;
    b.place("4733.dat", BROWN, Pm(0, 0, bz, orient("+x", "+z", "-y")), "brown 1x1 brick with 4 side studs (seed)");
    for (const [dx, dy] of [[14, 0], [-14, 0], [0, 14], [0, -14]] as [number, number][]) {
      const out = unitV([dx, dy, 0]);
      b.place("68211.dat", BROWN, Pm(dx * 1.3, dy * 1.3, bz + 10, frameM([0, 0, 1], [-out[0], -out[1], 0], [0, 0, 0])), "brown 3-prong bar (seed)");
    }
  }
  b.step();

  // Hand-placed decorative parts (leaves, bird, figures, table items...) were positioned from the
  // instruction geometry; nudge each floating small group onto the nearest matching stud/hole of
  // its neighbours so it really connects.
  for (let k = 0; k < 3; k++) relax(b, 12);
  relax(b, 60, 24, 2.5);
  relax(b, 12, 40, 0.9);
  relax(b, 12, 40, 0.9);
  return b;
}

function rigidInv(m: Mat4): Mat4 {
  const r = new Float64Array([m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0]);
  r[3] = -(r[0] * m[3] + r[1] * m[7] + r[2] * m[11]); r[7] = -(r[4] * m[3] + r[5] * m[7] + r[6] * m[11]); r[11] = -(r[8] * m[3] + r[9] * m[7] + r[10] * m[11]);
  return r;
}
function relax(b: Build, maxGroup: number, radius = 20, minTrace = 1.9) {
  const n = b.parts.length;
  const bb = b.parts.map((_, i) => b.bounds(i));
  const near2 = (i: number, j: number, pad: number) => [0, 1, 2].every((k) => bb[i].min[k] - pad <= bb[j].max[k] && bb[j].min[k] - pad <= bb[i].max[k]);
  const adj: number[][] = b.parts.map(() => []);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (!near2(i, j, 2)) continue;
      if (findConnectionsForParts(b.lib, [{ file: b.parts[j].file, m: b.parts[j].m }], { file: b.parts[i].file, m: b.parts[i].m }).connections > 0) { adj[i].push(j); adj[j].push(i); }
    }
  const comp = new Array(n).fill(-1);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const c: number[] = [], q = [i];
    comp[i] = comps.length;
    while (q.length) { const x = q.pop()!; c.push(x); for (const y of adj[x]) if (comp[y] < 0) { comp[y] = comps.length; q.push(y); } }
    comps.push(c);
  }
  const snapsOf = b.parts.map((_, i) => b.snaps(i));
  let fixed = 0;
  for (const c of comps) {
    if (c.length > maxGroup) continue;
    const inC = new Set(c);
    const others = b.parts.map((_, i) => i).filter((j) => !inC.has(j) && c.some((i) => near2(i, j, radius)));
    const cands: Mat4[] = [];
    for (const i of c) {
      const Mi = b.parts[i].m, inv = rigidInv(Mi);
      for (const sn of snapsOf[i]) {
        const S = properize(mul(inv, sn.m));
        for (const j of others) for (const t of snapsOf[j]) {
          if (sn.gender === t.gender || Math.hypot(...sub(t.pos, sn.pos)) > radius) continue;
          for (const angleDeg of [0, 90, 180, 270]) for (const flip of [false, true]) for (const offset of [0]) {
            const M2 = placeOnSnap(properize(t.m), S, { angleDeg, flip, offset });
            const G = mul(M2, inv);
            const tr = G[0] + G[5] + G[10];
            if (tr < minTrace) continue; // keep orientation close to the placed one
            cands.push(G);
          }
        }
      }
    }
    let best: { G: Mat4; score: number } | null = null;
    const placed = others.map((j) => ({ file: b.parts[j].file, m: b.parts[j].m }));
    for (const G of cands) {
      let conn = 0, ov = 0;
      for (const i of c) {
        const r = findConnectionsForParts(b.lib, placed, { file: b.parts[i].file, m: mul(G, b.parts[i].m) });
        conn += r.connections; ov += r.overlap;
      }
      const score = conn * 10 - ov - Math.hypot(G[3], G[7], G[11]) * 0.05 - (3 - (G[0] + G[5] + G[10])) * 10;
      if (conn > 0 && ov < 3 && (!best || score > best.score)) best = { G, score };
    }
    if (!best) continue;
    for (const i of c) b.parts[i].m = mul(best.G, b.parts[i].m);
    fixed++;
  }
  if (process.env.M0809_DEBUG) for (const c of comps) if (c.length <= maxGroup) console.log("  group:", c.map((i) => `${i}:${b.parts[i].file.replace(".dat", "")}(${(b.parts[i].label ?? "").slice(0, 22)})`).join(" "));
  if (process.env.M0809_DEBUG) console.log(`relax: ${comps.length} groups, ${comps.filter((c) => c.length <= maxGroup).length} small, ${fixed} moved`);
}
