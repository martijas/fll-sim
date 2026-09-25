// Mission 12 Forest Elder (bag 18), scripted from the official building instructions
// (text-based book text-bi-10 + picture book book-10).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
//
// The script is written in the frame of the text instructions' first steps ("text frame": the two
// rows of red wall panels at the back, the U-shaped technic brick at the front, the curved brown
// bar on the right) and turned 180 degrees about the vertical at the end, so that the finished
// model faces -Z the way the book shows it on its first and last page (curved bar and root on the
// left, the red ring standing in the wall-panel slot in front of the trunk).
//
// Two separate models:
//  - the Forest Elder tree on its 8x8 round base (steps 1-23), with
//      * the "support" (cane, step 21): a hinged arm on the U-brick at the back of the base,
//        pivoting on a red 2L axle; raised, its brown fork wraps around the trunk,
//      * the red ring (step 22): a loose ring standing in the slot between the wall panels,
//        tied to the trunk by a 21-link chain,
//      * the root (step 23): hangs on a pin hole on the stud at the tip of the curved bar (free to
//        swing) and rests on the floor;
//  - the small frame (step 24): a separate bent-liftarm model standing in front of the tree
//    (front right). Its part labels contain "post" (publishing splits them into their own model).
// The ring and its chain are tagged "[loose:ring]" (a free game piece); no label contains "tie"
// or "post" except the small frame's.
import { IDENTITY, type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { assemble } from "@fll-sim/assembly";
import { Build, all, at, axisIs, dir, dump, near, orient, pt, rot, type SnapInfo } from "../src/build";

const LBG = 71, DBG = 72, BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, TAN = 19, BGREEN = 10, BROWN = 70, NOUGAT = 84;
const MAGENTA = 26, SAND_GREEN = 378, LORANGE = 191;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", AX2 = "32062.dat", AX3 = "4519.dat", AX4 = "3705.dat";
const RBRICK = "3941.dat", RPLATE = "4032a.dat", RTILE = "15535.dat", BARPLATE = "98284.dat", LEAF1 = "32607.dat";
const RND11 = "85861.dat", CONE = "59900.dat", BAR3 = "87994.dat", MAC = "25214.dat", PALM = "3565.dat";
type V3 = [number, number, number];
const hole = (s: SnapInfo) => s.gender === "F";
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const DBGP = process.env.M12_DBG;

/** Rigid inverse. */
function inv(m: Mat4): Mat4 {
  const r = new Float64Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 4 + j] = m[j * 4 + i];
  for (let i = 0; i < 3; i++) r[i * 4 + 3] = -(r[i * 4] * m[3] + r[i * 4 + 1] * m[7] + r[i * 4 + 2] * m[11]);
  return r;
}
/** Matrix from the world images of the local x, y, z axes and the origin. */
function frame(ax: V3, ay: V3, az: V3, o: V3): Mat4 {
  return new Float64Array([ax[0], ay[0], az[0], o[0], ax[1], ay[1], az[1], o[1], ax[2], ay[2], az[2], o[2]]);
}
/** Rotation about world Y turning the local horizontal direction `from` onto `to`. */
function yaw(from: [number, number], to: [number, number]): Mat4 {
  const a = Math.atan2(from[1], from[0]) - Math.atan2(to[1], to[0]);
  // rot("y", d) maps (x, z) -> (x cos + z sin, -x sin + z cos): angle measured from x towards -z
  return rot("y", (a * 180) / Math.PI);
}
/** 1x1 round plate with three leaves: the leaves spread towards local (+x, -z). */
const leafTo = (d: [number, number]) => yaw([1, -1], d);

const norm3 = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

/**
 * The 16L chain (60169 = 2 end pieces 60169k01 + 21 links 60169k02, 12.818 LDU apart) along a
 * hanging curve from `p0` (end on a vertical bar, leaving horizontally towards +z) to `p1`
 * (end on a horizontal bar pointing -z, leaving downwards). The sag is chosen so the curve is 300 LDU long.
 */
function chainPath(p0: V3, p1: V3): { file: string; m: Mat4; label: string }[] {
  const bez = (k: number) => {
    const c1: V3 = [p0[0] + 25 * k, p0[1] + 40 * k, p0[2] + 12];
    const c2: V3 = [p1[0] + 25 * k, p1[1] + 90 * k, p1[2] - 4];
    return (t: number): V3 => {
      const u = 1 - t;
      return [0, 1, 2].map((i) => u * u * u * p0[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * p1[i]) as V3;
    };
  };
  const sample = (f: (t: number) => V3) => {
    const pts: V3[] = [], cum = [0];
    for (let i = 0; i <= 600; i++) pts.push(f(i / 600));
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    return { pts, cum };
  };
  let lo = 0, hi = 5;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    const { cum } = sample(bez(mid));
    if (cum[cum.length - 1] < 300) lo = mid; else hi = mid;
  }
  const { pts, cum } = sample(bez(lo));
  const at_ = (sArc: number) => {
    const i = Math.max(1, Math.min(pts.length - 1, cum.findIndex((v) => v >= sArc)));
    const T = norm3([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]]);
    return { p: pts[i], T };
  };
  const out: { file: string; m: Mat4; label: string }[] = [];
  // chain frame: z = tangent, y = "stud axis" (kept perpendicular to the tangent), x = y × z
  const cf = (T: V3, ref: V3) => {
    const k = ref[0] * T[0] + ref[1] * T[1] + ref[2] * T[2];
    const Y = norm3([ref[0] - k * T[0], ref[1] - k * T[1], ref[2] - k * T[2]]);
    return { X: cross3(Y, T), Y, Z: T };
  };
  {
    const { T } = at_(8);
    const { X, Y, Z } = cf(T, [0, 1, 0]);
    out.push({ file: "60169k01.dat", m: frame(X, Y, Z, p0), label: "chain end (on the trunk bar)" });
  }
  for (let k = 0; k < 21; k++) {
    const sArc = 25.818 + 12.818 * k;
    const { p, T } = at_(sArc);
    const { X, Y, Z } = cf(T, [1, 0, 0]);
    const o: V3 = [p[0] + 1.5 * Y[0], p[1] + 1.5 * Y[1], p[2] + 1.5 * Y[2]];
    const m = k % 2 === 0 ? frame(Y, Z, X, o) : frame([-X[0], -X[1], -X[2]], Z, Y, o);
    out.push({ file: "60169k02.dat", m, label: "chain link" });
  }
  {
    const { T } = at_(292);
    const { X, Y, Z } = cf(T, [0, 0, 1]);
    out.push({ file: "60169k01.dat", m: frame([-X[0], -X[1], -X[2]], Y, [-Z[0], -Z[1], -Z[2]], p1), label: "chain end (on the ring's bar)" });
  }
  return out;
}

/** Copy a sub-build's parts into `b` under transform T (exact placement, connections checked later). */
function addSub(b: Build, sub: Build, T: Mat4, label?: string): number[] {
  return sub.parts.map((p) => b.place(p.file, p.color, mul(T, p.m), p.label ?? label));
}

export function build(lib: Library) {
  const b = new Build(lib, "M12 Forest Elder");
  if (process.env.M12_T2) {
    const t = new Build(lib, "t");
    t.place(LEAF1, GREEN, IDENTITY);
    for (const yy of [-8, -12, -4]) for (const a of [0, 45, 90, 180]) { try { t.put(LEAF1, GREEN, at(0, yy, 0, rot("y", a)), 1); console.log("ok", yy, a); t.parts.pop(); } catch (e) { console.log(String(e).slice(0, 90)); } }
  }

  // ================================================================ Main build: base (group 1)
  // 1.1 green 8x8 round plate (bottom on the floor: top surface at y = -8)
  const base = b.place("74611.dat", GREEN, at(0, -8, 0), "8x8 round plate");
  // 1.2 red 1x2 panel on the back row, wall at the back
  b.put("4865b.dat", RED, at(0, -32, 70), 2, "wall panel (back row, wall at the back)");
  b.step();
  // 2 three panels in the next row, walls at the front: a slot between the two walls
  for (const px of [0, -40, 40]) b.put("4865b.dat", RED, at(px, -32, 50, rot("y", 180)), 2, "wall panel (front row, wall at the front)");
  b.step();
  // 3 green 1x2 technic brick with axle hole on the rightmost column, light grey 1x2 to its left
  const axBrick = b.put("32064a.dat", GREEN, at(70, -32, 0, rot("y", -90)), 2, "green 1x2 brick with axle hole");
  b.put("3004.dat", LBG, at(50, -32, 0, rot("y", 90)), 2, "grey 1x2 brick");
  b.step();
  // 4 tree mount: 4x4 round brick with pin holes, 3L pin in its front hole (2L out to the front),
  //   dark grey 1x2 brick with hole and the 1x2 brick with two liftarms on the pin
  const rb = b.put("6222.dat", LBG, at(0, -32, 0), 4, "4x4 round brick with holes");
  const pin4 = b.attach(PIN3, BLUE, { to: rb, where: all(hole, near([0, -22, -40], 2)), accept: (m) => Math.abs(z(m) + 50) < 1, offsets: [-10, 0, 10], label: "3L pin (front hole)" });
  b.put("3700.dat", DBG, at(0, -32, -50), 1, "dark grey 1x2 brick with hole");
  const ubrick = b.put("85943.dat", DBG, at(0, -32, -70), 1, "1x2 brick with two liftarms (U)");
  b.step();
  // 5 green 2x3 plates: one front-back over the round brick's front row and the two bricks in
  //   front of it, one left-right over the round brick's right column and the two 1x2 bricks
  b.put("3021.dat", GREEN, at(0, -40, -50, rot("y", 90)), 2, "green 2x3 plate (front)");
  const plR = b.put("3021.dat", GREEN, at(50, -40, 0), 2, "green 2x3 plate (right)");
  b.step();
  // 6 leaves plate (leaves to the left) on the 2nd column from the left, 3rd stud from the front;
  //   dark pink frog on it, head at the back
  const lf6 = b.put(LEAF1, GREEN, at(-50, -16, -10, leafTo([-1, 0])), 1, "leaves plate");
  b.put("33320.dat", MAGENTA, at(-50, -16, -10, rot("y", 180)), 1, "frog");
  b.step();
  // 7 leaves plates on the back-left corner of the front 2x3 plate and the front-left corner of the right one
  b.put(LEAF1, GREEN, at(-10, -48, -30, leafTo([1, -1])), 1, "leaves plate");
  b.put(LEAF1, GREEN, at(30, -48, -10, leafTo([1, 1])), 1, "leaves plate");
  b.step();
  // 8 brown curved bar: its axle in the green brick's axle hole (from the right), the bar leaving
  //   to the right and curving up, the two studs at its tip facing front and back.
  //   (4042 has no snap data for its axle end: placed exactly, the axle fills x = 60..80.)
  const cbar = b.place("4042.dat", BROWN, orient("+z", "-x", "-y", [80, -22, 0]), "curved bar (axle in the green brick)");
  b.step();

  // ================================================================ Trunk (group 2)
  // 9 11L axle through (from the bottom) five 2x2 round bricks, the sand green plate with four
  //   bars, a 2x2 round plate, a 2x2 round brick with a round tile, into the 45-degree bent 2x2
  //   cylinder. The bottom of the axle goes into the centre hole of the 4x4 round brick.
  //   Stack tops: bricks -56 .. -152, bar plate -160, plate -168, brick -192, tile -200.
  const trunk: number[] = [];
  trunk.push(b.place("23948.dat", 14, at(0, -110, 0, rot("z", 90)), "11L axle (trunk)"));
  for (let k = 0; k < 5; k++) trunk.push(b.put(RBRICK, TAN, at(0, -56 - 24 * k, 0), 1, "2x2 round brick (trunk)"));
  const bp1 = b.put(BARPLATE, SAND_GREEN, at(0, -160, 0), 1, "2x2 round plate with 4 bars (trunk)");
  b.put(RPLATE, TAN, at(0, -168, 0), 1, "2x2 round plate (trunk)");
  b.put(RBRICK, TAN, at(0, -192, 0), 1, "2x2 round brick (trunk)");
  b.put(RTILE, TAN, at(0, -200, 0), 1, "2x2 round tile with hole (trunk)");
  // bent cylinder: top face at the front, pointing up (45 degrees)
  const elbow = b.place("65473.dat", TAN, at(0, -200, 0, rot("y", 90)), "2x2 round brick curved 45 (trunk top)");
  // 9.5 leaves plates on the front and back bars, leaves pointing out
  for (const s of [-1, 1]) {
    const bar: V3 = [0, -168, 30 * s];
    b.attach(LEAF1, GREEN, { to: bp1, where: near([0, -160, 30 * s], 20), own: hole, accept: (m) => Math.abs(x(m)) < 1 && Math.abs(z(m) - 30 * s) < 1 && y(m) > -172, prefer: (m) => dir(m, [1, 0, -1])[2] * s + y(m) * 0.01, angles: [0, 45, 90, 135, 180, 225, 270, 315], label: "leaves plate on a trunk bar" });
    void bar;
  }
  b.step();

  // ---- 10 top of the tree: 2x2 round brick, bar plate, round tile, bent horn on a 4L axle
  //   (1L of the axle out below the brick), red 2L axle in the horn's top hole. The axle goes
  //   into the bent cylinder's top hole; the horn bends down so the red axle points to the front.
  const eM = b.parts[elbow].m;
  const F = pt(eM, [21.1, -50.9, 0]);
  const d = dir(eM, [0.7071, -0.7071, 0]); // out of the top face: up and to the front
  // assembly frame A: origin on the elbow's top face, local -y along d, local x = world x
  const A = frame([1, 0, 0], [-d[0], -d[1], -d[2]], [0, -0.7071, 0.7071], F);
  const top = new Build(lib, "tree top");
  top.place(RBRICK, TAN, at(0, -24, 0), "2x2 round brick (top)");
  const bp2l = top.put(BARPLATE, SAND_GREEN, at(0, -32, 0), 1, "2x2 round plate with 4 bars (top)");
  top.put(RTILE, TAN, at(0, -40, 0), 1, "2x2 round tile with hole (top)");
  const horn = top.place("2142.dat", TAN, at(0, -40, 0), "bent horn");
  top.place(AX4, BLACK, at(0, -20, 0, rot("z", 90)), "4L axle (top)");
  top.attach(AX2, RED, { to: horn, where: (s) => s.axis[1] > 0.3 && s.axis[1] < 0.9, offsets: [-20, -10, 0, 10, 20], prefer: (m) => -pt(m, [0, 0, 0])[2] - pt(m, [0, 0, 0])[1] * 0.1, label: "red 2L axle (horn tip)" });
  const topIdx = addSub(b, top, A);
  const bp2 = topIdx[bp2l], hornAx = topIdx[topIdx.length - 1];
  b.step();

  // ---- 11 branch: tan 1x1 round plate + cone, leaves stem in its underside; the cone's hollow
  //   stud goes onto the left bar of the top bar plate.
  const barL = b.snaps(bp2, (s) => s.gender === "M" && s.pos[0] < -20)[0];
  const along = (m: Mat4, v: V3) => { const q = dir(m, [0, -1, 0]); return q[0] * v[0] + q[1] * v[1] + q[2] * v[2]; };
  const beyond = (m: Mat4, p: V3) => (x(m) - p[0]) * d[0] + (y(m) - p[1]) * d[1] + (z(m) - p[2]) * d[2];
  const c11 = b.attach(CONE, TAN, { to: bp2, where: near(barL.pos, 2), own: hole, accept: (m) => along(m, d) < -0.99 && beyond(m, barL.pos) > 10, offsets: [-20, -16, -12, -8, -4, 0, 4, 8], label: "1x1 cone (branch 11)" });
  const p11 = b.attach(RND11, TAN, { to: c11, accept: (m) => beyond(m, barL.pos) > 30 && along(m, d) < -0.99, label: "1x1 round plate with open stud (branch 11)" });
  b.attach("37695.dat", BGREEN, { to: p11, own: (s) => s.gender === "M", accept: (m) => beyond(m, barL.pos) > 40, prefer: (m) => -dir(m, [0, 0, -1])[2], label: "stem with 3 leaves (branch 11)" });
  b.step();

  // ---- 12 branch: macaroni tube (holes left and back), 1x1 round plate's stud in the back hole,
  //   red 2L axle in the left hole, 3L bar in the plate's underside, cone on the bar (stud at the
  //   back), cone on the axle (stud on the left), leaves plate (leaves up) and two 1x1 leaves
  //   plates on the bar. Built in its own frame (as the text describes it, lying flat).
  const s12 = new Build(lib, "branch 12");
  const mac12 = s12.place(MAC, TAN, IDENTITY, "90 degree tube (branch 12)");
  const up = (m: Mat4) => dir(m, [0, -1, 0]); // a part's stud direction
  // (the open stud of 85861 is modelled R 8, it does not register in the tube's R 6 hole: placed exactly, stud 4 LDU in)
  const r12 = s12.place(RND11, TAN, at(0, 0, 30, rot("x", 90)), "1x1 round plate with open stud (branch 12)");
  const ax12 = s12.attach(AX2, RED, { to: mac12, where: near([-30, 0, 0], 2), accept: (m) => x(m) < -30, label: "red 2L axle (branch 12)" });
  const bar12 = s12.attach(BAR3, BGREEN, { to: r12, accept: (m) => pt(m, [0, 30, 0])[2] > z(s12.parts[r12].m), prefer: (m) => -z(m), label: "3L bar (branch 12)" });
  // cone on the bar right behind the round plate (plate back face z = 38; cone origin = its top, 24 above its base)
  // cone on the bar right behind the round plate (plate back face z = 38; cone origin = its top,
  // 24 above its base). The bar runs through the cone's axle-hole section, which the snap data
  // doesn't accept for a bar: placed exactly (no registered connection; glued in the sim).
  const c12a = s12.place(CONE, TAN, at(0, 0, 62, rot("x", -90)), "1x1 cone on the bar (branch 12)");
  s12.attach(CONE, TAN, { to: ax12, own: hole, accept: (m) => up(m)[0] < -0.99, prefer: (m) => x(m), label: "1x1 cone on the axle (branch 12)" });
  const palm12 = s12.attach(PALM, GREEN, { to: [bar12, c12a], own: all(hole, near([0, 8, 20], 1)), accept: (m) => up(m)[2] > 0.99 && dir(m, [0, 0, -1])[1] < -0.99 && z(m) > z(s12.parts[c12a].m), prefer: (m) => -z(m), label: "leaves plate, leaves up (branch 12)" });
  // first 1x1 leaves plate on the leaves plate's stud (the bar runs through both), the second
  // stacked on it the same way round (placed exactly: the search doesn't find the stacked pose)
  const lf12 = s12.attach(LEAF1, GREEN, { to: [bar12, palm12], own: hole, accept: (m) => up(m)[2] > 0.99 && z(m) > z(s12.parts[palm12].m) + 4,
    prefer: (m) => -z(m) * 10 - dir(m, [1, 0, -1])[1], angles: [0, 45, 90, 135, 180, 225, 270, 315], label: "leaves plate, leaves up (branch 12)" });
  const m12b = new Float64Array(s12.parts[lf12].m);
  m12b[11] += 8;
  s12.put(LEAF1, GREEN, m12b, 1, "leaves plate, leaves up (branch 12)");
  // 12.6 onto the top bar of the tree top (the bar pointing along d, up and back of the red axle):
  //   the axle cone's hollow stud takes the bar, like the cone of step 11 on the left bar;
  //   leaves on top, so the 3L bar of the branch runs to the right.
  const barTop = b.snaps(bp2, (s) => s.gender === "M").sort((p, q) => p.pos[1] - q.pos[1])[0];
  const off = [x(b.parts[c11].m) - barL.pos[0], y(b.parts[c11].m) - barL.pos[1], z(b.parts[c11].m) - barL.pos[2]];
  const Rb = frame([d[0], d[1], d[2]], [0, 0.7071, -0.7071], [1, 0, 0], [0, 0, 0]);
  const c12b = s12.parts.findIndex((p) => p.label === "1x1 cone on the axle (branch 12)");
  const ps = pt(Rb, [x(s12.parts[c12b].m), y(s12.parts[c12b].m), z(s12.parts[c12b].m)]);
  const T12 = new Float64Array(Rb);
  T12[3] = barTop.pos[0] + off[0] - ps[0]; T12[7] = barTop.pos[1] + off[1] - ps[1]; T12[11] = barTop.pos[2] + off[2] - ps[2];
  addSub(b, s12, T12);
  b.step();

  // ---- 13-18 branch with the butterfly: tube, round plate, 3L bar, cone, then three leaves
  //   plates on the bar (leaves right, up, down) and the butterfly on the lowest stud.
  const s13 = new Build(lib, "branch 13");
  const mac13 = s13.place(MAC, TAN, IDENTITY, "90 degree tube (branch 13)");
  const r13 = s13.place(RND11, TAN, at(0, 0, 30, rot("x", 90)), "1x1 round plate with open stud (branch 13)");
  const bar13 = s13.attach(BAR3, BGREEN, { to: r13, accept: (m) => pt(m, [0, 30, 0])[2] > z(s13.parts[r13].m), prefer: (m) => -z(m), label: "3L bar (branch 13)" });
  const c13 = s13.place(CONE, TAN, at(0, 0, 62, rot("x", -90)), "1x1 cone on the bar (branch 13)");
  // leaves plates: studs at the back, the hole on the bar is the one at local z = 20 (the leaves grow towards local -z)
  let p13 = c13;
  const palms: number[] = [];
  for (const [lv, name] of [[[1, 0, 0], "right"], [[0, -1, 0], "up"], [[0, 1, 0], "down"]] as [V3, string][]) {
    p13 = s13.attach(PALM, GREEN, { to: [bar13, p13], own: all(hole, near([0, 8, 20], 1)), maxOverlap: 10,
      accept: (m) => { const q = dir(m, [0, 0, -1]); return up(m)[2] > 0.99 && q[0] * lv[0] + q[1] * lv[1] + q[2] * lv[2] > 0.99 && z(m) > z(s13.parts[p13].m) + 1; },
      prefer: (m) => -z(m), label: `leaves plate, leaves ${name} (branch 13)` });
    palms.push(p13);
  }
  // 18 butterfly on the bottom stud of the last leaves plate (the stud below the bar)
  const low = s13.snaps(palms[2], (s) => s.gender === "M").sort((p, q) => q.pos[1] - p.pos[1])[0];
  s13.attach("80674.dat", LORANGE, { to: palms[2], where: near(low.pos, 1), prefer: (m) => -Math.abs(dir(m, [1, 0, 0])[1]), label: "butterfly" });
  // 19 the tube's free (left) hole onto the red axle at the horn tip; the bar points up
  const axM = b.parts[hornAx].m;
  let a19 = dir(axM, [1, 0, 0]);
  const hornC = pt(b.parts[topIdx[3]].m, [0, -40, 0]);
  if ((x(axM) - hornC[0]) * a19[0] + (y(axM) - hornC[1]) * a19[1] + (z(axM) - hornC[2]) * a19[2] < 0) a19 = a19.map((v) => -v) as V3;
  const upW: V3 = [0, -1, 0];
  const k19 = upW[0] * a19[0] + upW[1] * a19[1] + upW[2] * a19[2];
  const zz = norm3([upW[0] - k19 * a19[0], upW[1] - k19 * a19[1], upW[2] - k19 * a19[2]]);
  const yy = cross3(zz, a19);
  const macW = b.attach(MAC, TAN, { to: hornAx, where: (s) => true, offsets: [-10, -6, -4, -2, 0, 2, 4, 6, 10],
    accept: (m) => { const q = dir(m, [1, 0, 0]), w = dir(m, [0, 0, 1]); return q[0] * a19[0] + q[1] * a19[1] + q[2] * a19[2] > 0.99 && w[0] * zz[0] + w[1] * zz[1] + w[2] * zz[2] > 0.99; },
    prefer: (m) => -Math.hypot(...pt(m, [-30, 0, 0]).map((v, i) => v - hornC[i])), label: "90 degree tube (branch 13)" });
  void yy; void mac13;
  const T13 = b.parts[macW].m;
  b.parts.pop();
  addSub(b, s13, T13);
  b.step();

  // 20 red 2L axle in the front (-x) thin liftarm of the U brick, flush with its inner face, 30 out
  const ax20 = b.put(AX2, RED, at(-30, -22, -100), 1, "red 2L axle (support pivot)");
  b.step();

  // ================================================================ 21 support (the cane)
  // Built in its own frame: the #1 connector's pin hole at the origin (axis x), the chain of
  // axles and joiners running along -z, the three-axle bush at the end with two #5 connectors
  // forming a fork that opens along -z.
  const sp = new Build(lib, "support");
  const c1 = sp.place("32013.dat", BGREEN, IDENTITY, "#1 connector (support pivot)");
  let cur = c1;
  const chain: [string, number, number, number][] = [[AX2, RED, -30, 0], ["59443.dat", GREEN, -50, 0], [AX2, RED, -70, 0], ["42195.dat", NOUGAT, -100, 0], [AX2, RED, -130, 0], ["42195.dat", NOUGAT, -160, 0]];
  for (const [f, c, zc] of chain) cur = sp.attach(f, c, { to: cur, accept: (m) => Math.abs(z(m) - zc) < 1 && Math.abs(x(m)) < 1 && Math.abs(y(m)) < 1, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: f === AX2 ? "red 2L axle (support)" : f === "59443.dat" ? "2L axle joiner (support)" : "3L axle joiner (support)" });
  const bush = sp.put("57585.dat", BLACK, at(0, 0, -200), 1, "bush with three axles (support fork)");
  const forks: number[] = [];
  for (const sx of [1, -1]) {
    const ax = sp.snaps(bush, (s) => s.gender === "M" && s.pos[0] * sx > 10)[0];
    forks.push(sp.attach("32015.dat", BROWN, { to: bush, where: near(ax.pos, 1), minConnections: 1,
      accept: (m) => { return Math.abs(dir(m, [1, 0, 0])[1]) > 0.95; }, angles: Array.from({ length: 16 }, (_, i) => i * 22.5),
      prefer: (m) => (-(pt(m, [0, 0, -30])[2] + pt(m, [0, -27.7, 11.5])[2]) + sx * (pt(m, [0, 0, -30])[0] + pt(m, [0, -27.7, 11.5])[0]) * 0.5) * 0.01,
      label: `#5 connector (support fork ${sx})`, maxOverlap: 6 }));
  }
  const ap21 = sp.attach(AXPIN, BLUE, { to: bush, where: (s) => s.kind === "axle" && s.gender === "F", accept: (m) => dir(m, [1, 0, 0])[1] > 0.99 && y(m) < 0, /* 43093: axle end at local +x */ label: "axle/pin (support)" });
  sp.attach("18654.dat", BGREEN, { to: ap21, accept: (m) => y(m) < -12, label: "1L liftarm (support)" });
  // mount: upright (fork up, the 1L liftarm pin towards the front), pin hole on the red axle,
  //   then swung back about the axle until the fork is around the trunk.
  const tilt = Number(process.env.M12_TILT ?? -24);
  const U = mul(rot("x", tilt), orient("-x", "+z", "+y"));
  const Tsp = new Float64Array(U);
  Tsp[3] = -30; Tsp[7] = -22; Tsp[11] = -100;
  const supIdx = addSub(b, sp, Tsp, "support");
  void ax20; void supIdx;
  b.step();

  // ================================================================ 22 the ring (loose, chained)
  // Built lying flat in its own frame (studs up, the text's "back" = +z): a red 1x4 round-end
  // plate at the back, four red 4x4 quarter-ring corner plates (80015), 1x4s under the side and
  // front joints, a 1x4 with four round tiles on the back, black 1x2s over the side joints and
  // the black 1x4 with the hanging bar (chain end) on the front.
  const rg = new Build(lib, "ring");
  const RND14 = "77845.dat", TAG = " [loose:ring]";
  rg.place(RND14, RED, IDENTITY, "red 1x4 round-end plate (ring)" + TAG);
  rg.put("80015.dat", RED, at(-20, -8, -70, rot("y", 180)), 1, "red quarter-ring plate, back left (ring)" + TAG);
  rg.put("80015.dat", RED, at(20, -8, -70, rot("y", -90)), 1, "red quarter-ring plate, back right (ring)" + TAG);
  const r2 = rg.put(RND14, RED, at(0, -16, 0), 1, "red 1x4 round-end plate (ring back)" + TAG);
  // (98138's snap data doesn't register on a stud: placed exactly on the four studs, glued in the sim)
  for (const tx of [-30, -10, 10, 30]) rg.put("98138.dat", RED, at(tx, -24, 0), 0, "red 1x1 round tile (ring)" + TAG);
  void r2;
  for (const sx of [-1, 1]) rg.put(RND14, RED, at(90 * sx, 0, -90, rot("y", 90)), 1, "red 1x4 round-end plate (ring side)" + TAG);
  rg.put("80015.dat", RED, at(-20, -8, -110, rot("y", 90)), 2, "red quarter-ring plate, front left (ring)" + TAG);
  rg.put("80015.dat", RED, at(20, -8, -110), 2, "red quarter-ring plate, front right (ring)" + TAG);
  for (const sx of [-1, 1]) rg.put("35480.dat", BLACK, at(90 * sx, -16, -90, rot("y", 90)), 2, "black 1x2 round-end plate (ring side)" + TAG);
  rg.put(RND14, RED, at(0, 0, -180), 2, "red 1x4 round-end plate (ring front)" + TAG);
  const hangM = at(0, -16, -180);
  rg.put("30043.dat", BLACK, hangM, 2, "black 1x4 plate with hanging bar (ring)" + TAG);
  // Standing upright in the slot between the two rows of wall panels (panel floors y = -16,
  // walls at z = 40 and 80): studs towards the back (+z), the tiled back edge at the bottom, the
  // hanging bar at the top pointing towards the trunk.
  const Tring = orient("+x", "-z", "+y", [0, -26, 52]);
  addSub(b, rg, Tring);
  b.step();
  // chain (21 links, 16L span) from the bar of the ring to the back bar of the trunk plate with
  // bars (over the leaves plate). Flexible: drawn as LDraw draws shaped chains (end pieces
  // 60169k01 + links 60169k02) along a hanging curve; it has no snap data (glued to the ring).
  const ringBarTip = pt(mul(Tring, hangM), [0, 8, -20]);
  const Aend: V3 = [ringBarTip[0], ringBarTip[1], ringBarTip[2] + 6]; // chain end on the bar, near its tip
  const Bp: V3 = [0, -176, 30]; // chain end on the trunk bar, on top of the leaves plate
  const chainParts = chainPath(Bp, Aend);
  for (const c of chainParts) b.place(c.file, LBG, c.m, c.label + TAG);
  b.step();

  // ================================================================ 23 the root
  // Built in the frame of its red #1 connector (pin hole axis x at the origin, axle hole along -z):
  // 4L axle, green 2x2 round plate, tan 2x2 round brick, tan 2x2x2 cone, sand green crown and
  // the dark grey bar with ball.
  const rt = new Build(lib, "root");
  rt.place("32013.dat", RED, IDENTITY, "#1 connector (root)");
  rt.put(AX4, BLACK, at(0, 0, -50, rot("y", 90)), 1, "4L axle (root)");
  rt.put(RPLATE, GREEN, at(0, 0, -38, rot("x", 90)), 1, "green 2x2 round plate (root)");
  rt.put(RBRICK, TAN, at(0, 0, -62, rot("x", 90)), 1, "tan 2x2 round brick (root)");
  const cone2 = rt.put("3942c.dat", TAN, at(0, 0, -110, rot("x", 90)), 1, "tan 2x2x2 cone (root)");
  const crown = rt.attach("39262.dat", SAND_GREEN, { to: cone2, own: hole, accept: (m) => z(m) < -110 && dir(m, [0, -1, 0])[2] < -0.99, label: "sand green crown (root)" });
  rt.attach("22484.dat", DBG, { to: crown, accept: (m) => pt(m, [0, 0, -18])[2] < z(rt.parts[crown].m) - 5, offsets: [-20, -10, -6, -4, -2, 0, 2, 4, 6, 10, 20], label: "bar with ball (root)" });
  // 23.5 the connector's pin hole on the stud at the tip of the curved bar facing the (final)
  //   front; the root hangs from it and rests on the floor, pointing down and away from the base.
  const cbM = b.parts[cbar].m;
  const out = dir(cbM, [1, 0, 0]); // the stud at local x = +4 sticks out towards local +x
  const pivot = pt(cbM, [14, -100, 80]);
  let Troot: Mat4 = IDENTITY;
  for (let phi = 0; phi <= 90; phi += 1) {
    const h: V3 = [Math.sin((phi * Math.PI) / 180), Math.cos((phi * Math.PI) / 180), 0];
    const zc: V3 = [-h[0], -h[1], -h[2]];
    const T = frame(out as V3, cross3(zc, out as V3), zc, pivot);
    const tmp = new Build(lib, "tmp");
    for (const p of rt.parts) tmp.place(p.file, p.color, mul(T, p.m));
    Troot = T;
    if (tmp.bounds().max[1] <= 0) break;
  }
  // (the stud in the #1 connector's pin hole does not register as a connection in the tooling:
  //  the root is placed exactly on the stud and glued to the bar in the sim instead of swinging)
  addSub(b, rt, Troot);
  b.step();

  // ================================================================ 24 small frame ("post", separate model)
  // Bent liftarm standing on edge (holes front-back): the 7L arm along the floor pointing right,
  // the 3L arm upright on the left (as built; the finished model is turned so it is on the right).
  const fr = new Build(lib, "small frame");
  const lb = fr.place("32009.dat", LBG, orient("-y", "+z", "-x"), "double bent liftarm (post)");
  const lh = (xx: number) => fr.snaps(lb, (s) => hole(s) && Math.abs(s.pos[0] - xx) < 2 && Math.abs(s.pos[1]) < 12)[0];
  const ap24 = fr.attach(AXPIN, BLUE, { to: lb, where: near(lh(160).pos, 12), accept: (m) => dir(m, [1, 0, 0])[2] > 0.99, label: "axle/pin (post)" });
  const p3 = fr.attach(PIN3, BLUE, { to: lb, where: near(lh(120).pos, 12), accept: (m) => Math.abs(z(m)) < 1, offsets: [-10, 0, 10], label: "3L pin (post)" });
  const p2 = fr.attach(PIN, BLACK, { to: lb, where: near(lh(80).pos, 12), accept: (m) => z(m) > 5, label: "black pin (post)" });
  fr.attach("32523.dat", DBG, { to: [p2, p3], minConnections: 2, accept: (m) => z(m) > 10, label: "dark grey 3L liftarm, back (post)" });
  fr.attach("32523.dat", DBG, { to: [p3, ap24], minConnections: 2, accept: (m) => z(m) < -10, label: "dark grey 3L liftarm, front (post)" });
  const topAx = fr.snaps(lb, (s) => s.kind === "axle" && s.pos[1] < -50)[0];
  const ax24 = fr.attach(AX3, 14, { to: lb, where: near(topAx.pos, 12), accept: (m) => Math.abs(z(m)) < 1, offsets: [-20, -10, 0, 10, 20], label: "yellow 3L axle (post)" });
  for (const sz of [-1, 1])
    fr.attach("60483.dat", RED, { to: ax24, accept: (m) => z(m) * sz > 10 && pt(m, [0, 0, 20])[0] > x(m) + 10, label: "red 2L liftarm (post)" });
  const fb = fr.bounds();
  const Tfr = at(-150 - (fb.min[0] + fb.max[0]) / 2, -fb.max[1], 220 - (fb.min[2] + fb.max[2]) / 2);
  for (const p of fr.parts) b.place(p.file, p.color, mul(Tfr, p.m), (p.label ?? p.file).replace(" (post)", "") + " (post: small frame)");
  b.step();

  // Finished model: turn it round so it faces -Z like the book's final picture.
  const R = rot("y", 180);
  for (const p of b.parts) p.m = mul(R, p.m);


  if (DBGP) report(b);
  if (process.env.M12_STATS) {
    const grp = (f: (l: string) => boolean) => { const t = new Build(lib, "t"); for (const p of b.parts) if (f(p.label ?? "")) t.place(p.file, p.color, p.m); return t; };
    for (const [n, f] of [["all", () => true], ["tree (no post)", (l: string) => !l.includes("post")], ["post", (l: string) => l.includes("post")], ["ring+chain", (l: string) => l.includes("loose:ring")]] as [string, (l: string) => boolean][]) {
      const t = grp(f), bb = t.bounds();
      console.log(n, t.parts.length, "parts; min", bb.min.map(Math.round), "max", bb.max.map(Math.round), "size mm", bb.size.map((v) => Math.round(v * 0.4)));
    }
    console.log("chain pieces", b.parts.filter((p) => p.file.startsWith("60169k")).length);
  }
  return b;
}

/** Debug: print the rigid bodies (part labels) and free joints of the model. */
function report(b: Build) {
  const { robot, bodyOfPart } = assemble(b.lib, b.parts, { name: b.name, autoPorts: false });
  const groups = new Map<string, string[]>();
  b.parts.forEach((p, i) => (groups.get(bodyOfPart[i]) ?? groups.set(bodyOfPart[i], []).get(bodyOfPart[i])!).push(`${i}:${p.label ?? p.file}`));
  for (const [k, v] of groups) console.log(k, v.length, v.slice(0, 6).join(" | "), v.length > 6 ? "..." : "");
  for (const j of robot.freeJoints) console.log(j.id, j.a, j.b, JSON.stringify(j.axis));
}
