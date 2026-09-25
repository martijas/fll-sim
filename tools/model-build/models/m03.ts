// Mission 03 Flip the Rock (bags 4 and 5), scripted from the official building instructions
// (text-based book + picture book 03). LDraw frame: -Y up, -Z = front (towards the builder in
// steps 1-48; the book shows steps 49-67 and the finished model from the +Z side), +X = right.
//
// Mechanism: a rotating platform with a scene on each side (scene 1: rocks/mushroom/frog, scene 2:
// forest floor with spider) is carried by a four-bar linkage on each side: a lime 5L link from the
// base (tan 3L pin) to the platform's back end hole, and a red bent-liftarm lever pivoting on an
// upright 7L liftarm of the base, its short arm pinned to the platform. Pushing the levers flips
// the platform over. The model is built in the finished state (scene 2 on top). The front lime
// L-liftarm (step 5) pivots freely on its tan axle/pin.
import { IDENTITY, type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, all, axisIs, dir, dump, near, orient, pt, type SnapInfo } from "../src/build";

const LBG = 71, DBG = 72, BLACK = 0, BLUE = 1, RED = 4, TAN = 19, YELLOW = 14, LIME = 27, BGREEN = 10;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", AXPIN_FREE = "3749.dat", PIN3_FREE = "39888.dat", PIN_FREE = "3673.dat";
const HALFPIN = "89678.dat"; // red 1L pin with stud
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const hole = (s: SnapInfo) => s.gender === "F";
const shiftX = (b: Build, idx: number[], dx: number) => { for (const i of idx) b.parts[i].m[3] += dx; };
const near3 = (a: number[], c: number[], tol: number) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) <= tol;
const DEBUG = process.env.M03_DEBUG === "1";

/** Lime 2x4 L-liftarm with an axle/pin in the long leg's axle hole and two 3L pins (steps 4 and 6).
 *  Local frame of 32140: long leg along +Z (axle hole at z=0), short leg towards +X, holes along Y.
 *  All pins stick out towards `side` * Y (the two sides give mirror-image brackets). */
function lBracket(lib: Library, name: string, side: 1 | -1) {
  const s = new Build(lib, `L-liftarm ${name}`);
  const l = s.place("32140.dat", LIME, IDENTITY);
  // axle half in the axle hole, pin half sticking out (explicit: the axle-hole snap is 1 LDU long)
  // (43093/3749: axle half along the part's +X, pin half along -X)
  s.place(AXPIN, BLUE, side < 0 ? orient("+y", "-x", "+z", [0, -10, 0]) : orient("-y", "+x", "+z", [0, 10, 0]));
  // 3L pins centred in the liftarm (1L out on each side), stop ring on the pin side
  //   (42924/39888: the short 1L end with the stop ring is along the part's -X)
  for (const p of [[0, 0, 40], [20, 0, 60]] as [number, number, number][])
    s.attach(PIN3, BLUE, { to: l, where: near(p, 1), accept: (m) => Math.abs(y(m)) < 1 && m[4] * side < -0.9, offsets: [-10, 0, 10] });
  return s;
}

type V3 = [number, number, number];
const crossV = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const unitV = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
/** Placement mapping local unit directions u, v to world u2, v2 (and u x v to u2 x v2), with local
 *  point pL landing on world point pW. */
function frameMat(u: V3, v: V3, u2: V3, v2: V3, pL: V3, pW: V3): Mat4 {
  u = unitV(u); v = unitV(v); u2 = unitV(u2); v2 = unitV(v2);
  const w = crossV(u, v), w2 = crossV(u2, v2);
  const m = new Float64Array(12);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 4 + c] = u2[r] * u[c] + v2[r] * v[c] + w2[r] * w[c];
  const q = [0, 1, 2].map((r) => m[r * 4] * pL[0] + m[r * 4 + 1] * pL[1] + m[r * 4 + 2] * pL[2]);
  m[3] = pW[0] - q[0]; m[7] = pW[1] - q[1]; m[11] = pW[2] - q[2];
  return m;
}
const rotX = (deg: number): Mat4 => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
  return new Float64Array([1, 0, 0, 0, 0, c, -sn, 0, 0, sn, c, 0]);
};
const mulM = (a: Mat4, c: Mat4): Mat4 => {
  const m = new Float64Array(12);
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 3; k++) m[r * 4 + k] = a[r * 4] * c[k] + a[r * 4 + 1] * c[4 + k] + a[r * 4 + 2] * c[8 + k];
    m[r * 4 + 3] = a[r * 4] * c[3] + a[r * 4 + 1] * c[7] + a[r * 4 + 2] * c[11] + a[r * 4 + 3];
  }
  return m;
};
/** Copy a sub-build's parts into b under placement T; returns the new indices. */
const addSub = (b: Build, sub: Build, T: Mat4, label?: string) => {
  let st = sub.parts[0]?.step ?? 1;
  return sub.parts.map((p) => {
    for (; st < p.step; st++) b.step(); // keep the sub-build's own steps
    return b.place(p.file, p.color, mulM(T, p.m), p.label ?? label);
  });
};

/** Red 4x6 bent liftarm lever (steps 18/24): yellow frictionless pin in the corner hole sticking
 *  out towards `yellowSide`*Y, tan axle/pin in the short arm's end axle hole with its pin half
 *  towards the other side. 6629 frame: long arm z=0..100 (corner at z=100), short arm to (48,0,136). */
function lever(lib: Library, yellowSide: 1 | -1) {
  const s = new Build(lib, "lever");
  s.place("6629.dat", RED, IDENTITY, "lever");
  s.place(PIN_FREE, YELLOW, yellowSide > 0 ? orient("+y", "-x", "+z", [0, 10, 100]) : orient("-y", "+x", "+z", [0, -10, 100]), "lever pivot pin");
  // axle half (part +X) in the lever, pin half out on the other side
  s.place(AXPIN_FREE, TAN, yellowSide > 0 ? orient("+y", "-x", "+z", [48, -10, 136]) : orient("-y", "+x", "+z", [48, 10, 136]), "lever axle/pin");
  return s;
}

// ---- brick placement by footprint -------------------------------------------------------------
const boxCache = new Map<string, { min: number[]; max: number[] }>();
function localBox(lib: Library, file: string) {
  let r = boxCache.get(file);
  if (!r) {
    const t = new Build(lib, "box");
    t.place(file, 16, IDENTITY);
    const bb = t.bounds(0);
    boxCache.set(file, (r = { min: bb.min, max: bb.max }));
  }
  return r;
}
function worldBox(lib: Library, file: string, m: Mat4) {
  const { min, max } = localBox(lib, file);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const a of [min[0], max[0]]) for (const c of [min[1], max[1]]) for (const d of [min[2], max[2]]) {
    const w = pt(m, [a, c, d]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
  }
  return { lo, hi };
}
interface PutOpts { x?: [number, number]; z?: [number, number]; at?: [number, number]; bottom: number; ok?: (m: Mat4) => boolean; prefer?: (m: Mat4) => number; label?: string; min?: number; maxOverlap?: number }
/** Attach a brick/plate/tile so its bounding box covers cells x/z (LDU edges) and its underside
 *  sits at y=bottom (or, for odd shapes, its origin is above point `at`). */
function put(s: Build, file: string, color: number, o: PutOpts): number {
  const lib = s.lib;
  const cx = o.x ? (o.x[0] + o.x[1]) / 2 : o.at![0], cz = o.z ? (o.z[0] + o.z[1]) / 2 : o.at![1];
  const rx = o.x ? (o.x[1] - o.x[0]) / 2 + 12 : 22, rz = o.z ? (o.z[1] - o.z[0]) / 2 + 12 : 22;
  const to = s.parts.map((_, i) => i);
  return s.attach(file, color, {
    to,
    where: (q) => Math.abs(q.pos[0] - cx) <= rx && Math.abs(q.pos[2] - cz) <= rz && Math.abs(q.pos[1] - o.bottom) <= 30,
    accept: (m) => {
      const { lo, hi } = worldBox(lib, file, m);
      if (Math.abs(hi[1] - o.bottom) > 1.5) return false;
      if (o.x && (Math.abs(lo[0] - o.x[0]) > 1.5 || Math.abs(hi[0] - o.x[1]) > 1.5)) return false;
      if (o.z && (Math.abs(lo[2] - o.z[0]) > 1.5 || Math.abs(hi[2] - o.z[1]) > 1.5)) return false;
      if (o.at && (Math.abs(m[3] - o.at[0]) > 1.5 || Math.abs(m[11] - o.at[1]) > 1.5)) return false;
      return !o.ok || o.ok(m);
    },
    prefer: o.prefer,
    minConnections: o.min ?? 1,
    maxOverlap: o.maxOverlap ?? 4,
    offsets: [0],
    label: o.label,
  });
}

/** Scene 1 (steps 27-45: rocks, moss, mushroom, frog), in the frame of steps 35-45 (after the
 *  90° turn of step 34): plate tops at y=0, x to the builder's right, z away from the builder. */
export function scene1(lib: Library) {
  const s = new Build(lib, "scene 1");
  const TG = 35, TLB = 43, LIMEc = 27, GREEN = 2, OLIVE = 330, CORAL = 353;
  // 27 grey 4x8 plate (turned: 4 wide, 8 deep) + trans-green 1x2 tile
  s.place("3035.dat", LBG, orient("+z", "+y", "-x", [0, 0, 0]), "grey 4x8 plate");
  put(s, "3069b.dat", TG, { x: [-40, -20], z: [40, 80], bottom: 0, label: "trans-green tile" });
  // 28 red 1x2 plate + green bracket, side studs facing +z
  put(s, "3023b.dat", RED, { x: [-20, 20], z: [60, 80], bottom: 0 });
  put(s, "99781.dat", GREEN, { x: [-20, 20], z: [60, 88], bottom: 4, label: "bracket (side studs)" });
  // 29 two lime 2x1 slopes with cutout ("1x1 tile with a 1x1 slope"): the thin tile end on the
  //    bracket, the full-height slope end standing on the plate in front
  for (const xs of [[0, 20], [-20, 0]] as [number, number][])
    put(s, "28192.dat", LIMEc, { x: xs, z: [40, 80], bottom: 0, ok: (m) => m[10] > 0.9 });
  // 30 grey inverted 2x1 slope, overhang to the right
  put(s, "3665a.dat", LBG, { x: [20, 60], z: [60, 80], bottom: 0, ok: (m) => m[2] < -0.9 });
  // 31 dark grey 3x2 slope, high end (studs) at the right
  put(s, "3298.dat", DBG, { x: [-40, 20], z: [0, 40], bottom: 0, ok: (m) => m[2] > 0.9 });
  s.step();
  // 32 dark grey 2x2 double concave corner slope, sloped corner at the back right
  put(s, "3046.dat", DBG, { x: [20, 60], z: [20, 60], bottom: 0, ok: (m) => near3(pt(m, [20, 0, -20]), [50, pt(m, [20, 0, -20])[1], 50], 2), maxOverlap: 8 });
  // 33 dark grey 2x2 corner tile (missing corner at the back right) + trans-green tile
  put(s, "14719.dat", DBG, { x: [20, 60], z: [40, 80], bottom: -24, ok: (m) => near3(pt(m, [20, 0, 20]), [50, pt(m, [20, 0, 20])[1], 50], 2) });
  put(s, "3069b.dat", TG, { x: [0, 40], z: [20, 40], bottom: -24 });
  s.step();
  // 34 second grey 4x8 plate to the right (under the corner slope's overhanging row)
  s.place("3035.dat", LBG, orient("+z", "+y", "-x", [80, 0, 0]), "grey 4x8 plate");
  // 35 trans-green tile across the two plates
  put(s, "3069b.dat", TG, { x: [20, 60], z: [0, 20], bottom: 0 });
  s.step();
  // 36 grey 4x2 slope (high end right) + trans-green tile
  put(s, "30363.dat", LBG, { x: [-20, 60], z: [-40, 0], bottom: 0, ok: (m) => m[2] > 0.9 });
  put(s, "3069b.dat", TG, { x: [-20, 20], z: [-60, -40], bottom: 0 });
  // 37 dark grey 4x1 slope (stud at the front) + trans-green tile
  put(s, "60477.dat", DBG, { x: [60, 80], z: [-20, 60], bottom: 0, ok: (m) => m[10] < -0.9 });
  put(s, "3069b.dat", TG, { x: [60, 100], z: [-40, -20], bottom: 0 });
  // 38 grey 2x2 plate + dark grey corner tile (missing corner front right)
  put(s, "3022.dat", LBG, { x: [20, 60], z: [-80, -40], bottom: 0 });
  put(s, "14719.dat", DBG, { x: [20, 60], z: [-80, -40], bottom: -8, ok: (m) => near3(pt(m, [20, 0, 20]), [50, pt(m, [20, 0, 20])[1], -70], 2) });
  // 39 red 1x2 plate + green bracket at the back right, side studs facing +z
  put(s, "3023b.dat", RED, { x: [80, 120], z: [60, 80], bottom: 0 });
  put(s, "99781.dat", GREEN, { x: [80, 120], z: [60, 88], bottom: 4, label: "bracket (side studs)" });
  // 40 two lime slopes on the bracket, sloping away from each other; the right one overhangs
  put(s, "28192.dat", LIMEc, { x: [60, 100], z: [60, 80], bottom: 0, ok: (m) => m[2] > 0.9 });
  put(s, "28192.dat", LIMEc, { x: [100, 140], z: [60, 80], bottom: 0, ok: (m) => m[2] < -0.9 });
  // 41 grey 1x8 plate under the overhanging slope end, beside the plate (the scene becomes 9 wide)
  put(s, "3460.dat", LBG, { x: [120, 140], z: [-80, 80], bottom: 8 });
  s.step();
  // 42 grey 3x3 double convex slope (stud front left), 3x1 slope (stud left), 2x2 double convex (stud back left)
  put(s, "3675.dat", LBG, { x: [80, 140], z: [0, 60], bottom: 0, ok: (m) => Math.abs(m[3] - 90) < 1.5 && Math.abs(m[11] - 10) < 1.5, maxOverlap: 8 });
  put(s, "4286.dat", LBG, { x: [80, 140], z: [-20, 0], bottom: 0, ok: (m) => m[2] < -0.9 });
  put(s, "13548.dat", LBG, { x: [100, 140], z: [-60, -20], bottom: 0, ok: (m) => Math.abs(m[3] - 110) < 1.5 && Math.abs(m[11] + 30) < 1.5 });
  s.step();
  // 43 mushroom: trans-light-blue cone + inverted 2x2 dish on the 3x2 slope's free stud
  const cone = put(s, "59900.dat", TLB, { at: [10, 10], bottom: -24, label: "mushroom stem" });
  s.attach("4740.dat", TLB, { to: cone, accept: (m) => y(m) < -40, label: "mushroom cap" });
  s.step();
  // 44 olive frog (head to the right) + green leaves (pointing right) on the 3x3 slope's stud
  put(s, "33320.dat", OLIVE, { at: [50, 30], bottom: -24, ok: (m) => m[2] < -0.9, label: "frog", maxOverlap: 8 });
  put(s, "32607.dat", GREEN, { at: [90, 10], bottom: -24, prefer: (m) => pt(m, [18, 0, -18])[0], label: "leaves" });
  // 45 leaves (pointing front right) + coral flower on the 4x1 slope's stud
  const lv = put(s, "32607.dat", GREEN, { at: [70, -10], bottom: -24, prefer: (m) => pt(m, [18, 0, -18])[0] - pt(m, [18, 0, -18])[2], label: "leaves" });
  s.attach("24866.dat", 353, { to: lv, accept: (m) => y(m) < -35, label: "flower" });
  return s;
}

/** Scene 2 (steps 49-62: forest floor with the spider and a clip) plus its front brackets and
 *  curved slopes (steps 64-65), in the frame of steps 49-62: base plate tops at y=0, x to the
 *  builder's right, z away from the builder. */
export function scene2(lib: Library) {
  const s = new Build(lib, "scene 2");
  const BROWN = 70, DTAN = 28, DBROWN = 308, WHITE = 15, NOUGAT = 84, GREEN = 2;
  // 49 brown 1x8 plate + dark tan 2x3 plate (front row overhanging)
  s.place("3460.dat", BROWN, IDENTITY, "brown 1x8 plate");
  put(s, "3021.dat", DTAN, { x: [-80, -20], z: [-30, 10], bottom: 0 });
  // 50 brown 4x8 plate under the overhang
  put(s, "3035.dat", BROWN, { x: [-80, 80], z: [-90, -10], bottom: 8, label: "brown 4x8 plate" });
  // 51 two more dark tan 2x3 plates in front (the front one overhangs)
  put(s, "3021.dat", DTAN, { x: [-80, -20], z: [-70, -30], bottom: 0 });
  put(s, "3021.dat", DTAN, { x: [-80, -20], z: [-110, -70], bottom: 0 });
  // 52 two brown 2x2 corner tiles
  put(s, "14719.dat", BROWN, { x: [-60, -20], z: [-90, -50], bottom: -8, ok: (m) => near3(pt(m, [20, 0, 20]), [-30, pt(m, [20, 0, 20])[1], -60], 2) });
  put(s, "14719.dat", BROWN, { x: [-80, -40], z: [-50, -10], bottom: -8, ok: (m) => near3(pt(m, [20, 0, 20]), [-70, pt(m, [20, 0, 20])[1], -40], 2) });
  s.step();
  // 53 brown 1x2 triple slope, tall side right
  put(s, "15571.dat", BROWN, { x: [-20, 0], z: [-30, 10], bottom: 0, ok: (m) => m[2] > 0.9 });
  // 54 dark tan 2x2 slope (slope at the back) + brown triple slope (tall side at the back)
  put(s, "3039.dat", DTAN, { x: [0, 40], z: [-30, 10], bottom: 0, ok: (m) => m[10] < -0.9 });
  put(s, "15571.dat", BROWN, { x: [0, 40], z: [-50, -30], bottom: 0, ok: (m) => m[10] > 0.9 });
  // 55 second brown 4x8 plate under the front overhang
  put(s, "3035.dat", BROWN, { x: [-80, 80], z: [-170, -90], bottom: 8, label: "brown 4x8 plate" });
  s.step();
  // 56 three white 1x3 plates with rounded ends, running front-back
  for (const xs of [[-20, 0], [0, 20], [20, 40]] as [number, number][]) put(s, "77850.dat", WHITE, { x: xs, z: [-110, -50], bottom: 0 });
  // 57 three dark brown 2x1 slopes in a column at the right
  put(s, "3040b.dat", DBROWN, { x: [40, 60], z: [-110, -70], bottom: 0, ok: (m) => m[10] < -0.9 });
  put(s, "3040b.dat", DBROWN, { x: [40, 60], z: [-70, -30], bottom: 0, ok: (m) => m[10] > 0.9 });
  put(s, "3040b.dat", DBROWN, { x: [40, 60], z: [-30, 10], bottom: 0, ok: (m) => m[10] < -0.9 });
  // 58 brown corner tile on the two slopes' studs and the 2x2 slope
  put(s, "14719.dat", BROWN, { x: [20, 60], z: [-50, -10], bottom: -24, ok: (m) => near3(pt(m, [20, 0, 20]), [30, pt(m, [20, 0, 20])[1], -40], 2) });
  s.step();
  // 59 spider on the centre stud of the middle white plate
  // (placed explicitly, legs on the plate: the LDraw snaps of 77850's open studs sit at the
  //  plate's underside, so nothing can connect on top of it -> the spider shows as a loose part)
  s.place("29111.dat", NOUGAT, orient("+x", "+y", "+z", [10, -8, -80]), "spider");
  // 60 brown 4x2 slope (slope left) + triple slope (tall side back)
  put(s, "30363.dat", BROWN, { x: [-60, 20], z: [-150, -110], bottom: 0, ok: (m) => m[2] > 0.9 });
  put(s, "15571.dat", BROWN, { x: [-20, 20], z: [-170, -150], bottom: 0, ok: (m) => m[10] > 0.9 });
  s.step();
  // 61 clip holder: nougat 1x2 technic brick, red 1/2 pin with stud (stud to the front), red bar with clip
  const tb = put(s, "3700.dat", NOUGAT, { x: [20, 60], z: [-130, -110], bottom: 0, label: "1x2 brick with hole" });
  const hp = s.place(HALFPIN, RED, orient("-z", "+y", "+x", [40, -14, -130]), "red pin with stud");
  s.attach("3484.dat", RED, { to: hp, accept: (m) => pt(m, [0, 0, 0])[2] < -135, prefer: (m) => Math.abs(dir(m, [1, 0, 0])[0]), label: "bar with clip" });
  // 62 brown corner tile on the brick and the front slope's stud
  put(s, "14719.dat", BROWN, { x: [20, 60], z: [-130, -90], bottom: -24, ok: (m) => near3(pt(m, [20, 0, 20]), [30, pt(m, [20, 0, 20])[1], -100], 2) });
  s.step();
  // 64 two green brackets on the right column (the front row once the scene is turned), side studs outwards
  for (const zs of [[-150, -110], [-50, -10]] as [number, number][])
    put(s, "99781.dat", GREEN, { x: [60, 88], z: zs, bottom: 12, ok: (m) => m[2] < -0.9, label: "bracket (side studs)" });
  // 65 four brown curved slopes on the brackets, tall ends on the bracket studs, low ends outwards
  for (const [zs, sg] of [[[-170, -130], -1], [[-130, -90], 1], [[-70, -30], -1], [[-30, 10], 1]] as [[number, number], number][])
    put(s, "11477.dat", BROWN, { x: [60, 80], z: zs, bottom: -8, ok: (m) => m[10] * sg > 0.9, label: "curved slope" });
  return s;
}

/** 11L liftarm with alternating holes (73507) along X at depth z: end holes facing front/back. */
const beam11 = (zz: number): Mat4 => orient("+y", "+z", "+x", [0, 0, zz]);

/** Red 1L pins with stud: `up` = stud on top (pushed in from the top) at x=±80, stud at the
 *  bottom at x=±40 ("leftmost free hole on the bottom"). */
function studPins(s: Build, beam: number) {
  for (const xx of [-80, 80]) s.attach(HALFPIN, RED, { to: beam, where: all(axisIs("y"), near([xx, 0, s.snaps(beam)[0].pos[2]], 12)), accept: (m) => y(m) < -5 && m[4] < -0.9, label: "red pin with stud (up)" });
  for (const xx of [-40, 40]) s.attach(HALFPIN, RED, { to: beam, where: all(axisIs("y"), near([xx, 0, s.snaps(beam)[0].pos[2]], 12)), accept: (m) => y(m) > 5 && m[4] > 0.9, label: "red pin with stud (down)" });
}

/** Rotating platform (steps 8-15), in its own frame: panel centre at the origin, recessed side
 *  down, back liftarm at +Z, the two stacked front liftarms at -Z. */
function platform(lib: Library) {
  const s = new Build(lib, "rotating platform");
  // 8 back 11L liftarm, black pins in the 2nd front-facing hole from each end (x=±60), to the front
  const b1 = s.place("73507.dat", LBG, beam11(60), "platform back liftarm");
  //   (pins and panel placed explicitly: the panel's side-hole snaps sit 9 LDU inside its faces)
  for (const xx of [-60, 60]) s.place(PIN, BLACK, orient("+z", "+y", "-x", [xx, 0, 50]));
  s.step();
  // 9 + 11 red pins with stud
  studPins(s, b1);
  s.step();
  // 10 dark grey 5x11 panel, grooved side up (as pictured; the text calls the other side "recessed"), on the two pins (its back row of holes)
  s.place("64782.dat", DBG, IDENTITY, "platform panel"); // grooved side up (book step 10)
  s.step();
  // 12 blue 3L pins in the outer front holes (x=±60), stop ring at the panel, 2L sticking out
  for (const xx of [-60, 60]) s.place(PIN3, BLUE, orient("-z", "+y", "+x", [xx, 0, -60]));
  s.step();
  // 13 yellow frictionless pins in the back end hole on each side (1L out)
  for (const sx of [-1, 1]) s.place(PIN_FREE, YELLOW, orient("+x", "+y", "+z", [110 * sx, 0, 40]), "yellow pin (5L pivot)");
  s.step();
  // 14 two more 11L liftarms with red stud pins, onto the 3L pins in front of the panel
  for (const zz of [-60, -80]) studPins(s, s.place("73507.dat", LBG, beam11(zz), "platform front liftarm"));
  s.step();
  // 15 bright green 1/2 pins with stud tube in the middle two front holes of the front liftarm
  const front = s.parts.length - 5;
  for (const xx of [-20, 20]) s.attach("65826.dat", BGREEN, { to: front, where: all(axisIs("z"), near([xx, 0, -90], 12)), accept: (m) => z(m) < -85, label: "pin with stud tube" });
  return s;
}

export function build(lib: Library) {
  const b = new Build(lib, "M03 Flip the Rock");

  // ======================= Base (steps 1-7) =======================
  // 1.1 dark grey 5x11 panel lying flat, long side left-right, flat side down.
  const panel = b.place("64782.dat", DBG, orient("+x", "+y", "+z", [0, -10, 0]), "base panel");
  // 1.2 black pin into the centre hole of the front side, sticking out to the front
  //     (placed explicitly: the panel's side-hole snaps sit 1 LDU inside its face)
  const p12 = b.place(PIN, BLACK, orient("+z", "+y", "-x", [0, -10, -50]), "pin front");
  b.step();
  // 2.1 3L axle/pin/axle cross block, centre pin hole front-back, axle holes vertical
  const cb = b.attach("32184.dat", LBG, { to: p12, accept: (m) => Math.abs(m[5]) < 0.1 && Math.abs(y(m) + 10) < 1, label: "cross block" });
  // 2.2 blue axle/pins, axle down into the block, pin sticking up
  const ap2 = b.snaps(cb, (s) => s.kind === "axle").map((s) =>
    b.attach(AXPIN, BLUE, { to: cb, where: near(s.pos, 12), accept: (m) => Math.abs(y(m) + 20) < 1 && m[4] > 0.9, label: "axle/pin up" }),
  );
  if (DEBUG) { dump(b, panel); dump(b, cb); }
  b.step();
  // 3 lime 7x11 hollow frame, flat, onto the two blue pins with the front beam's middle holes
  const frame = b.attach("39794.dat", LIME, { to: ap2, minConnections: 2, accept: (m) => Math.abs(m[5]) > 0.9 && Math.abs(x(m)) < 1 && Math.abs(y(m) + 30) < 1 && z(m) > -40, label: "7x11 frame" });
  if (DEBUG) dump(b, frame);
  b.step();

  // 4 right fixed L-liftarm: axle/pin in the front axle hole, 3L pins (1L out on both sides) in
  //   the second hole from the back and the top hole of the short leg; the left pin ends go
  //   into the frame's back side hole and the panel's end holes.
  const L1 = lBracket(lib, "right", -1);
  const gL1 = b.attachGroup(L1, {
    to: [frame, panel],
    where: (s) => s.axis[0] !== 0 && Math.abs(Math.abs(s.axis[0]) - 1) < 0.01 && s.pos[0] > 90,
    ownPart: [1, 2, 3],
    minConnections: 3,
    // corner at the back (z=40) on the panel's level, short leg pointing up
    accept: (T) => pt(T, [0, 0, 0])[0] > 115 && pt(T, [0, -20, 0])[0] < pt(T, [0, 0, 0])[0] - 15 && near3(pt(T, [0, 0, 60]), [120, -10, 40], 3) && pt(T, [20, 0, 60])[1] < -20,
    label: "right L-liftarm",
  });
  shiftX(b, gL1, 120 - b.parts[gL1[0]].m[3]); // the frame/panel hole snaps sit 1 LDU inside the faces
  if (DEBUG) dump(b, gL1[0]);
  b.step();

  // 5 right pivoting L-liftarm: tan (frictionless) axle/pin in its back axle hole, black pin in the
  //   short leg's top hole with a red 1L liftarm on it; the tan pin goes into the panel's front end
  //   hole, the long leg lies forward with the short leg up at the front.
  const L2 = new Build(lib, "pivoting L-liftarm");
  const l2 = L2.place("32140.dat", LIME, IDENTITY);
  L2.place(AXPIN_FREE, TAN, orient("-y", "+x", "+z", [0, 10, 0]));
  const p5 = L2.attach(PIN, BLACK, { to: l2, where: near([20, 0, 60], 1), accept: (m) => y(m) > 5 });
  L2.attach("18654.dat", RED, { to: p5, accept: (m) => y(m) > 15 });
  const gL2 = b.attachGroup(L2, {
    to: panel,
    where: all(axisIs("x"), (s) => s.pos[0] > 90 && s.pos[2] < -30),
    ownPart: [1],
    accept: (T) => pt(T, [0, 0, 0])[0] > 115 && pt(T, [0, 20, 0])[0] < pt(T, [0, 0, 0])[0] - 15 && pt(T, [0, 0, 60])[2] < -90 && pt(T, [20, 0, 60])[1] < -20,
    label: "right pivoting L-liftarm",
  });
  shiftX(b, gL2, 120 - b.parts[gL2[0]].m[3]);
  b.step();

  // 6 left fixed L-liftarm (mirror of step 4)
  const gL3 = b.attachGroup(lBracket(lib, "left", 1), {
    to: [frame, panel],
    where: (s) => Math.abs(Math.abs(s.axis[0]) - 1) < 0.01 && s.pos[0] < -90,
    ownPart: [1, 2, 3],
    minConnections: 3,
    accept: (T) => pt(T, [0, 0, 0])[0] < -115 && pt(T, [0, 20, 0])[0] > pt(T, [0, 0, 0])[0] + 15 && near3(pt(T, [0, 0, 60]), [-120, -10, 40], 3) && pt(T, [20, 0, 60])[1] < -20,
    label: "left L-liftarm",
  });
  b.step();

  // 7 tan frictionless 3L pins in the centre side holes of the frame, 2L sticking out.
  //   (placed explicitly: the LDraw frame's centre side-hole snaps are mislocated at its centre)
  const tanL = b.place(PIN3_FREE, TAN, orient("-x", "+y", "-z", [-120, -30, 0]), "tan 3L pin left");
  const tanR = b.place(PIN3_FREE, TAN, orient("+x", "+y", "+z", [120, -30, 0]), "tan 3L pin right");
  b.step();

  const plat = platform(lib);
  // 27-46 scene 1, turned so its four side studs face the front, centred on the platform's studs
  //   with the front edges even (x: 9 studs wide, centred; z: flush with the front liftarm).
  const s1 = scene1(lib);
  const s1T = orient("-x", "+y", "-z", [50, -18, -10]); // scene 1 -> platform frame

  // ---- Linkage geometry (in the y/z plane; both sides are the same) ----
  // T: base pivot (tan 3L pin in the frame's centre side hole), C: lever pivot (yellow pin in the
  // corner of the lever, held by the upright 7L liftarm behind the 3x3 block, 2nd hole from its
  // top). The platform carries Y (yellow pin, back end hole, 5L liftarm to T) and H (2nd end hole
  // from the front, the lever's short arm to C). Links: T-Y 80 (5L), C-H 60 (lever short arm).
  // The finished model shows the platform flipped over (scene 2 on top): platform rotated ~180°
  // about X, Y in front of H. The linkage closes exactly flat at y=-87.5 (and the scene-1 and
  // scene-2 brackets then line up for step 66), but flat, scene 1's mushroom (hanging underneath)
  // would sit 11 LDU inside the base panel. So the platform rests where the mushroom cap touches
  // the base panel: we solve the linkage for the smallest tilt about X that clears it (~14°, the
  // back edge up). (Unflipped, as in steps 17-46, the linkage can't close flat at all.)
  const T: [number, number] = [-30, 0], C: [number, number] = [-110, 60];
  const hL: V3 = [0, 0, -20], yL: V3 = [0, 0, 40]; // platform-local (y, z) of H and Y (x ignored)
  const pose = (phiDeg: number) => {
    const R = rotX(phiDeg);
    const d = [R[6] * (yL[2] - hL[2]), R[10] * (yL[2] - hL[2])]; // world (y, z) of Y - H
    const Tp = [T[0] - d[0], T[1] - d[1]]; // H lies 80 from T - d and 60 from C
    const dd = Math.hypot(Tp[0] - C[0], Tp[1] - C[1]);
    const aa = (60 ** 2 - 80 ** 2 + dd ** 2) / (2 * dd), hh = Math.sqrt(60 ** 2 - aa ** 2);
    const ex = [(Tp[0] - C[0]) / dd, (Tp[1] - C[1]) / dd];
    const cand = [1, -1].map((sg) => [C[0] + aa * ex[0] - sg * hh * ex[1], C[1] + aa * ex[1] + sg * hh * ex[0]] as [number, number]);
    const H = cand.sort((p, q) => p[1] - q[1])[0]; // the front solution
    const Y: [number, number] = [H[0] + d[0], H[1] + d[1]];
    const M = new Float64Array(R);
    M[7] = H[0] - (R[5] * hL[1] + R[6] * hL[2]);
    M[11] = H[1] - (R[9] * hL[1] + R[10] * hL[2]);
    return { M, H, Y };
  };
  const cap = s1.parts.find((p) => p.file === "4740.dat")!;
  const capBottom = (M: Mat4) => worldBox(lib, cap.file, mulM(mulM(M, s1T), cap.m)).hi[1];
  let phi = 180;
  for (let k = 0; k <= 400; k++) {
    const cands = [180 + k * 0.05, 180 - k * 0.05];
    const ok = cands.find((f) => capBottom(pose(f).M) <= -20);
    if (ok !== undefined) { phi = ok; break; }
  }
  const { M: platM, H, Y } = pose(phi);
  if (DEBUG) console.log("linkage", { phi, H, Y, cap: capBottom(platM) }, [150, 160, 165, 170, 175, 180, 185, 190, 195, 200].map((f) => [f, Math.round(capBottom(pose(f).M)), Math.round(pose(f).M[7]), Math.round(pose(f).M[11])]));
  b.step();

  // 8-15 rotating platform, shown flipped over (as in the finished model)
  const gPlat = addSub(b, plat, platM, "rotating platform");
  b.step();
  // 16 lime 5L liftarms: one end on the platform's yellow pin, other end on the tan base pin
  const fiveL = (sx: number) => {
    const dir: V3 = unitV([0, T[0] - Y[0], T[1] - Y[1]]);
    return b.place("32316.dat", LIME, frameMat([0, 0, 1], [0, 1, 0], dir, [1, 0, 0], [0, 0, 0], [120 * sx, (T[0] + Y[0]) / 2, (T[1] + Y[1]) / 2]), "5L link");
  };
  const fiveLeft = fiveL(-1);
  b.step();
  b.step(); // 17: base joined (the base is already in place)

  // 18 left lever: short arm down to the platform (H), long arm up
  const leverAt = (sx: number, yellowSide: 1 | -1) => {
    const u2: V3 = [0, H[0] - C[0], H[1] - C[1]];
    return addSub(b, lever(lib, yellowSide), frameMat([48, 0, 36], [0, 1, 0], u2, [-1, 0, 0], [0, 0, 100], [120 * sx, C[0], C[1]]), "lever");
  };
  const levL = leverAt(-1, 1);
  b.step();

  // 19-21 / 23-26 side supports. 3x3 square liftarm upright (rounded sides top/bottom, cross holes
  // facing left/right) on the L-liftarm's 3L pins and the tan pin's free end; upright 7L liftarm
  // with alternating holes behind it, held by two bushing pins in the block's back holes, carrying
  // the lever's pivot pin in its 2nd hole from the top; a 3L pin connector with two pins ties the
  // 7L to the block.
  const block = (sx: number) => b.place("39793.dat", DBG, orient("+z", "+x", "+y", [140 * sx, -30, 20]), "3x3 square liftarm");
  const sevenL = (sx: number) => {
    const s7 = b.place("2391.dat", LBG, orient("+x", "+z", "-y", [140 * sx, -70, 60]), "upright 7L liftarm");
    // bushing at the back, pin through the 7L into the block
    const bp = [-10, -50].map((yy) => b.place("65304.dat", LBG, orient("-z", "+y", "+x", [140 * sx, yy, 60]), "pin with bushing"));
    return [s7, ...bp];
  };
  // 19 left block, red stud pin in its bottom front hole, coral flower plate on the stud
  const blkL = block(-1);
  const sp19 = b.place(HALFPIN, RED, orient("-z", "+y", "+x", [-140, -10, -10]), "red pin with stud (front)");
  b.attach("24866.dat", 353, { to: sp19, where: (q) => q.kind === "stud", accept: (m) => z(m) < -12, label: "flower plate" });
  if (DEBUG) { dump(b, blkL); dump(b, sp19); }
  b.step();
  // 20 left 7L with bushing pins; the lever's yellow pin goes into its top side hole
  const s7L = sevenL(-1);
  b.step();
  // 21 black pin connector on the left of the block and 7L, pins pointing right
  b.place("2393.dat", BLACK, orient("-y", "+z", "-x", [-160, -30, 40]), "3L pin connector with two pins");
  b.step();
  // 22 right 5L link
  const fiveRight = fiveL(1);
  b.step();
  // 23 right block on the three pins, black pin connector on its front (pins pointing back)
  const blkR = block(1);
  b.place("2393.dat", BLACK, orient("-x", "+y", "-z", [140, -30, -20]), "3L pin connector with two pins (front)");
  b.step();
  // 24 right lever (mirror of 18)
  const levR = leverAt(1, -1);
  b.step();
  // 25 right 7L with bushing pins
  const s7R = sevenL(1);
  b.step();
  // 26 black pin connector on the right of the block and 7L, pins pointing left
  b.place("2393.dat", BLACK, orient("+y", "+z", "+x", [160, -30, 40]), "3L pin connector with two pins");
  b.step();

  // 27-46 scene 1 on the platform's upward studs (it hangs underneath once the platform is flipped)
  const gS1 = addSub(b, s1, mulM(platM, s1T), "scene 1");
  b.step();
  // 47-48 the platform is flipped over (already shown in its flipped pose)
  b.step();
  // 49-62 + 63 scene 2, turned 90° clockwise (as seen from the far side, where the book views it
  //   from here on) and placed centred on the platform's upward studs, flush with its edge over
  //   the double front liftarm; 64-65 its brackets and curved slopes face that edge (world +Z).
  const gS2 = addSub(b, scene2(lib), mulM(platM, orient("-z", "-y", "-x", [-80, 18, -10])), "scene 2");
  b.step();
  // 66 green 1x3 plate and 2x3 plate standing upright on the side studs of the scene-2 brackets
  //   (above) and the scene-1 brackets (now hanging below the platform)
  const brackets = b.parts.map((p, i) => (p.file === "99781.dat" ? i : -1)).filter((i) => i >= 0);
  if (DEBUG) for (const i of brackets) dump(b, i, (s) => s.kind === "stud" && Math.abs(s.axis[1]) < 0.1);
  const sideStud = (s: SnapInfo) => s.kind === "stud" && s.gender === "M" && Math.abs(s.axis[2]) > 0.9;
  b.attach("3623.dat", 2, { to: brackets, where: all(sideStud, (s) => Math.abs(s.pos[0] - 60) < 2), minConnections: 2, maxOverlap: 6, label: "green 1x3 plate (upright)" });
  b.attach("3021.dat", 2, { to: brackets, where: all(sideStud, (s) => s.pos[0] < -30), minConnections: 4, maxOverlap: 6, label: "green 2x3 plate (upright)" });
  b.step();
  // 67 green leaves on the two stud tubes of the front liftarm (now at the back, +Z), leaves down
  for (const t of b.parts.map((p, i) => (p.file === "65826.dat" ? i : -1)).filter((i) => i >= 0))
    b.attach("32607.dat", 2, { to: t, where: (s) => s.kind === "stud", prefer: (m) => pt(m, [18, 0, -18])[1] - b.parts[t].m[7], label: "leaves" });
  b.step();

  return b;
}
