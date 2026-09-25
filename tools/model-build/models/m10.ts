// Mission 10 Fragile Microhabitats (bag 16), scripted from the official building instructions
// (text-based book text-bi-08 + picture book book-08, checked against the field-setup photos).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
//
// Two separate free-standing models, placed side by side, both facing the front (-Z):
//   * SPIDER HABITAT (left, steps 1-9, 34 parts): an upright liftarm frame (lime/green/brown) with a
//     white 9x9 liftarm "web" standing on the mat, hinged on one tan 3L pin (no friction) at its
//     bottom-left corner, a spider on a stud pin, and a brown 3L liftarm hanging freely from a grey
//     pin (no friction) under the top brown arm, resting against the web's left beam.
//   * SNAIL HABITAT (right, steps 10-23, 30 parts; the text calls it "the worm"): a grey/brown bent
//     liftarm body standing on the mat, and a neck (lime bent liftarm with cams, eyes, orange head)
//     hung from the body by two brown 3L links on free-spinning pins; the neck leans on the body's
//     brown bent liftarm.
// Parts 0-33 are the spider habitat, 34-63 the snail habitat (labels start "spider"/"snail").
// On the field both stand on Dual Lock pads (spider: under the lime/green bottom liftarms; snail:
// under the grey bottom arm). Moving parts: the web's 9L beams are joined by free grey pins (the
// grid can shear; left alone it leans ~2° left onto the upper brown arm), the web swings on the
// tan pin (it stands on the mat), the hanging brown 3L swings; the snail neck hangs on the links
// (a 2-link chain), the thin liftarms + head turn on the red axle (in the lime corner pin hole),
// the orange head and the eyes turn on the round white bar.
// Data gaps: the white 4L bar in the thin liftarms' / cross block's axle holes registers no
// connection (bar and orange block are glued by the mission-model loader).
//
// Everything lies in liftarm planes, so parts are placed exactly: positions are worked out on the
// hole grid in a "math" frame (units of 1 hole = 20 LDU, x right, y UP, z towards the builder) and
// converted to LDraw (x, -y, -z). Every part placed with `put` is verified to connect.
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build } from "../src/build";

const BLACK = 0, BLUE = 1, RED = 4, ORANGE = 25, YELLOW = 14, WHITE = 15, TAN = 19, GREEN = 2, LIME = 27, BROWN = 70, LBG = 71, DBG = 72, GOLD = 297;
const PIN = "61332.dat", PIN_FREE = "3673.dat", PIN3 = "42924.dat", PIN3_FREE = "39888.dat", AXPIN = "43093.dat", AXPIN_FREE = "3749.dat";
const HALFPIN = "89678.dat"; // red 1L pin with a (hollow) stud
const L2 = "60483.dat", L3 = "32523.dat", L5 = "32316.dat", L9 = "40490.dat", L3X5 = "32526.dat", B7X3 = "32271.dat", B4X4 = "32348.dat";
const THIN2 = "41677.dat", CAM = "6575a.dat", XBLOCK = "42003.dat", BAR4 = "30374.dat", TPIECE = "4697b.dat";
const AX2 = "32062.dat", AX3 = "4519.dat", AX4 = "3705.dat", RPLATE = "85861.dat", DISH = "43898.dat", SPIDER = "29111.dat";

type V3 = [number, number, number];
type V2 = [number, number];
const U = 20; // LDU per hole

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Placement from where the part's local X, Y, Z axes point in the math frame (x right, y up,
 * z towards the builder) and the math-frame position (hole units) of the part's origin.
 */
function M(X: V3, Y: V3, Z: V3, p: V3): Mat4 {
  const det = X[0] * (Y[1] * Z[2] - Y[2] * Z[1]) - Y[0] * (X[1] * Z[2] - X[2] * Z[1]) + Z[0] * (X[1] * Y[2] - X[2] * Y[1]);
  if (Math.abs(det - 1) > 1e-6) throw new Error(`not a rotation (det ${det})`);
  const c = (v: V3): V3 => [v[0], -v[1], -v[2]];
  const [x, y, z] = [c(X), c(Y), c(Z)];
  return new Float64Array([x[0], y[0], z[0], p[0] * U, x[1], y[1], z[1], -p[1] * U, x[2], y[2], z[2], -p[2] * U]);
}
/**
 * Liftarm lying in a vertical plane (holes along z) at `layer` (z): its origin (end hole / centre)
 * at `o`, its length axis (local +Z) along `d`. `bend` picks the side the 3L/4L arm of a bent
 * liftarm turns to (local +X): "ccw" = `d` turned 90° counter-clockwise (seen from the front).
 */
function beam(o: V2, d: V2, layer: number, bend: "ccw" | "cw" = "ccw"): Mat4 {
  const Z: V3 = [d[0], d[1], 0];
  const Y: V3 = [0, 0, bend === "ccw" ? 1 : -1];
  return M(cross(Y, Z), Y, Z, [o[0], o[1], layer]);
}
/**
 * Pin/axle along z through hole (x, y), centred at z = zc, its local +X pointing to +z (s = 1) or -z.
 * (Axle/pins 43093/3749: local +X = axle side. 3L pins 42924/39888: the 1L part beyond the stop
 * ring is at local -X.)
 */
function alongZ(x: number, y: number, zc: number, s: 1 | -1): Mat4 {
  const X: V3 = [0, 0, s], Y: V3 = [0, 1, 0];
  return M(X, Y, cross(X, Y), [x, y, zc]);
}
const unit2 = (v: V2): V2 => {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
};
const add2 = (a: V2, b: V2, k = 1): V2 => [a[0] + b[0] * k, a[1] + b[1] * k];

/** Translate a placement by (dx, dy, dz) LDU. */
const shift = (m: Mat4, t: V3): Mat4 => {
  const r = new Float64Array(m);
  r[3] += t[0]; r[7] += t[1]; r[11] += t[2];
  return r;
};

// ============================================================================================
// SPIDER HABITAT (steps 1-9). Frame hole grid: the first lime 2L liftarm's axle hole at (0, 0),
// layer z = 0 (the back of the frame); layers grow towards the front.
// ============================================================================================
function spiderHabitat(b: Build) {
  const put = (file: string, color: number, m: Mat4, label: string, min = 1) => b.put(file, color, m, min, label);

  // ---- Step 1: lime 2L liftarm (pin hole left), black pin + blue axle/pin sticking out front
  b.place(L2, LIME, beam([0, 0], [-1, 0], 0), "spider: lime 2L liftarm (back, bottom)");
  put(PIN, BLACK, alongZ(-1, 0, 0.5, 1), "spider: black pin");
  put(AXPIN, BLUE, alongZ(0, 0, 0.5, -1), "spider: blue axle/pin (axle in the lime liftarm)");
  b.step();
  // ---- Step 2: green 3x5 L, 3L arm at the bottom pointing left, 5L upright on the right
  put(L3X5, GREEN, beam([1, 4], [0, -1], 1, "cw"), "spider: green 3x5 L (back)", 2);
  b.step();
  // ---- Step 3: blue 3L pins (stop ring at the back) in the top two holes, 2L sticking out front
  put(PIN3, BLUE, alongZ(1, 4, 2, 1), "spider: blue 3L pin (top)");
  put(PIN3, BLUE, alongZ(1, 3, 2, 1), "spider: blue 3L pin");
  b.step();
  // ---- Step 4: brown 7x3 bent liftarm upright, 2nd/3rd holes on the pins, 3L arm up-right;
  //      blue axle/pin in its top axle hole, pin to the front
  put(B7X3, BROWN, beam([1, 2], [0, 1], 2, "cw"), "spider: brown 7x3 bent liftarm (upright)", 2);
  const top1: V2 = [1 + 1.6, 8 + 1.2]; // end of the 3L arm
  put(AXPIN, BLUE, alongZ(top1[0], top1[1], 2.5, -1), "spider: blue axle/pin (top)");
  b.step();
  // ---- Step 5: sub-assembly: lime 2L (pin hole right) + blue 3L pin + black 4L axle (1L out at
  //      the back) + green 3x5 L (5L upright on the left); its top holes onto the 3L pins, the
  //      axle's back end in the corner hole of the first L.
  put(L2, LIME, beam([1, 0], [1, 0], 2), "spider: lime 2L liftarm (step 5)", 0);
  put(PIN3, BLUE, alongZ(2, 0, 3, 1), "spider: blue 3L pin (step 5)", 0);
  put(AX4, BLACK, alongZ(1, 0, 2.5, 1), "spider: black 4L axle", 1);
  put(L3X5, GREEN, beam([1, 4], [0, -1], 3, "ccw"), "spider: green 3x5 L (front)", 3);
  b.step();
  // ---- Step 6: lime 2L liftarm on the front ends of the axle and pin
  put(L2, LIME, beam([1, 0], [1, 0], 4), "spider: lime 2L liftarm (front, bottom)", 2);
  b.step();
  // ---- Step 7: blue axle/pin (pin into the corner hole of the upright bent liftarm, axle front);
  //      second brown 7x3: 3L end on that axle, corner hole on the top axle/pin, 7L running down
  //      to the right over the web
  put(AXPIN, BLUE, alongZ(1, 8, 2.5, 1), "spider: blue axle/pin (corner)");
  // 3L arm from its end (1, 8) to the corner at top1: direction (0.8, 0.6), so the 7L arm (local
  // -Z from the corner) runs along (0.96, -0.28)
  const z7: V2 = [-0.96, 0.28];
  const o7 = add2(top1, z7, -6);
  put(B7X3, BROWN, beam(o7, z7, 3, "ccw"), "spider: brown 7x3 bent liftarm (top arm)", 2);
  b.step();
  // ---- Step 8: grey pin (no friction) from the back into the 1st free hole of the 7L arm, a brown
  //      3L liftarm hung from it by its top hole. It swings freely; left alone it rests against
  //      the top of the web's left beam, tilted ~38° to the right.
  const hp = add2(top1, [0.96, -0.28]);
  put(PIN_FREE, LBG, alongZ(hp[0], hp[1], 2.5, 1), "spider: grey pin (free) for the hanging liftarm");
  const th = (38 * Math.PI) / 180, u: V2 = [Math.sin(th), -Math.cos(th)];
  put(L3, BROWN, beam(add2(hp, u), u, 2), "spider: brown 3L liftarm (hanging, swings)");
  b.step();

  // ---- Step 9: the web, a 9x9 grid of white 9L liftarms standing upright behind the frame's
  //      front L: horizontal beams (bottom, middle, top) in the back layer z = 1, vertical beams
  //      (left, middle, right) in front of them (z = 2). The tan 3L pin (no friction) at its
  //      bottom-left corner sticks 1L out to the front into the free right hole of the front L:
  //      the web can swing about it (it stands on the mat).
  const x0 = 3; // web's left column
  put(PIN3_FREE, TAN, alongZ(x0, 0, 2, 1), "spider web: tan 3L pin (hinge)");
  put(L9, WHITE, beam([x0 + 4, 0], [1, 0], 1), "spider web: 9L bottom (A)");
  put(L9, WHITE, beam([x0, 4], [0, 1], 2), "spider web: 9L left (B)");
  for (const x of [x0 + 4, x0 + 8]) put(PIN_FREE, LBG, alongZ(x, 0, 1.5, 1), "spider web: grey pin");
  for (const y of [4, 8]) {
    put(PIN_FREE, LBG, alongZ(x0, y, 1.5, 1), "spider web: grey pin");
    put(L9, WHITE, beam([x0 + 4, y], [1, 0], 1), `spider web: 9L ${y === 4 ? "middle (C)" : "top (D)"}`);
    for (const x of [x0 + 4, x0 + 8]) put(PIN_FREE, LBG, alongZ(x, y, 1.5, 1), "spider web: grey pin");
  }
  put(L9, WHITE, beam([x0 + 4, 4], [0, 1], 2), "spider web: 9L middle vertical (E)", 3);
  put(L9, WHITE, beam([x0 + 8, 4], [0, 1], 2), "spider web: 9L right (F)", 3);
  // red 1L pin with stud in the hole above the centre of the middle vertical, stud to the front
  const X: V3 = [0, 0, 1], Y: V3 = [0, 1, 0];
  const hpin = put(HALFPIN, RED, M(X, Y, cross(X, Y), [x0 + 4, 5, 2.5]), "spider web: red 1L pin with stud");
  b.attach(SPIDER, BLACK, { to: hpin, offsets: [0], accept: (m) => m[11] < b.parts[hpin].m[11] - 2, label: "spider (on the stud)" });
  b.step();
}

// ============================================================================================
// SNAIL HABITAT (steps 10-23). Body hole grid: the corner hole of the grey 4x4 bent liftarms at
// (0, 0); back bent liftarm layer z = 0, middle layer 1, front bent liftarm layer 2.
// ============================================================================================
function snailHabitat(b: Build) {
  const put = (file: string, color: number, m: Mat4, label: string, min = 1) => b.put(file, color, m, min, label);
  const first = (file: string, color: number, m: Mat4, label: string) => b.place(file, color, m, label);

  // ---- Step 10: grey 4x4 bent liftarm (4L arm along the bottom to the left, other arm up-right),
  //      yellow 3L axles in its end axle holes, 2L sticking out to the front
  first(B4X4, LBG, beam([-3, 0], [1, 0], 0, "ccw"), "snail body: grey 4x4 bent liftarm (back)");
  const topAx: V2 = [1.8, 2.4];
  put(AX3, YELLOW, alongZ(-3, 0, 1, 1), "snail body: yellow 3L axle (bottom)");
  put(AX3, YELLOW, alongZ(topAx[0], topAx[1], 1, 1), "snail body: yellow 3L axle (top)");
  b.step();
  // ---- Step 11: grey pin (no friction) from the back, left of the corner hole
  put(PIN_FREE, LBG, alongZ(-1, 0, -0.5, 1), "snail body: grey pin (back link pivot)");
  b.step();
  // ---- Step 12: dark grey 5L with a blue 3L pin (1L out at each side) in its right hole; pin in
  //      the corner hole, the bottom axle through the 5L's 2nd hole (the 5L sticks out 1 left)
  put(L5, DBG, beam([-2, 0], [1, 0], 1), "snail body: dark grey 5L liftarm", 1);
  put(PIN3, BLUE, alongZ(0, 0, 1, -1), "snail body: blue 3L pin (corner)");
  b.step();
  // ---- Step 13: brown 7x3 bent liftarm, 7L end on the top axle, continuing up-right, 3L arm at
  //      the top pointing right
  const d7: V2 = [0.6, 0.8];
  put(B7X3, BROWN, beam(topAx, d7, 1, "cw"), "snail body: brown 7x3 bent liftarm");
  b.step();
  // ---- Step 14: second grey 4x4 bent liftarm in front, grey pin (no friction) from the front
  put(B4X4, LBG, beam([-3, 0], [1, 0], 2, "ccw"), "snail body: grey 4x4 bent liftarm (front)", 3);
  put(PIN_FREE, LBG, alongZ(-1, 0, 2.5, 1), "snail body: grey pin (front link pivot)");
  b.step();

  // ---- Steps 15-20: the neck, built separately (same frame). Its resting pose on the body (it is
  //      a free mechanism): the lime bent liftarm's top 3L arm lies on the body's brown 3L arm
  //      (lime corner 1 hole above the brown's, 1.1 holes further left), the lime 7L arm leaning
  //      along the brown 7L arm with a small gap; the lime 7L end N0 (the cams' axle) hangs from
  //      the body's grey pins B = (-1, 0) by the cams (N0 -> P, 2 holes) and the brown links
  //      (P -> B, 2 holes). The links hang nearly upright (~82°, as in the field-setup photo); the
  //      round ends of the cams then just clear the top of the grey bent liftarms.
  const brownCorner = add2(topAx, d7, 6); // (5.4, 7.2)
  const B: V2 = [-1, 0];
  const N0 = add2(add2(brownCorner, [-1.1, 1]), d7, -6);
  const D: V2 = [N0[0] - B[0], N0[1] - B[1]], DL = Math.hypot(D[0], D[1]);
  const kh = Math.sqrt(4 - (DL * DL) / 4); // knee height off the B-N0 line (knee to the upper left)
  const P: V2 = [B[0] + D[0] / 2 - (kh * D[1]) / DL, B[1] + D[1] / 2 + (kh * D[0]) / DL];
  const LC = add2(N0, d7, 6); // lime corner
  const n = new Build(b.lib, "snail neck");
  const nput = (file: string, color: number, m: Mat4, label: string, min = 1) => (n.parts.length === 0 ? n.place(file, color, m, label) : n.put(file, color, m, min, label));
  // 15: lime 7x3 (7L from the cams' axle up to the corner, 3L arm at the top pointing right),
  //     yellow 3L axle through its 7L end, 1L out at each side
  nput(B7X3, LIME, beam(N0, d7, 1, "cw"), "snail neck: lime 7x3 bent liftarm");
  nput(AX3, YELLOW, alongZ(N0[0], N0[1], 1, 1), "snail neck: yellow 3L axle");
  n.step();
  // 16: four dark grey cams (two each side), round end on the axle, pointed end towards P
  //     (cam: axle holes at local y = -20 (round end) ... +20 (pointed end), 10 LDU thick along z)
  const cd = unit2([P[0] - N0[0], P[1] - N0[1]]);
  const cmid: V2 = [(P[0] + N0[0]) / 2, (P[1] + N0[1]) / 2];
  for (const z of [1.75, 2.25, 0.25, -0.25]) {
    const Yc: V3 = [cd[0], cd[1], 0], Zc: V3 = [0, 0, 1];
    nput(CAM, DBG, M(cross(Yc, Zc), Yc, Zc, [cmid[0], cmid[1], z]), "snail neck: dark grey cam");
  }
  n.step();
  // 17: tan axle/pins (no friction) in the pointed ends, pin sides out to the front and back
  nput(AXPIN_FREE, TAN, alongZ(P[0], P[1], 2.5, -1), "snail neck: tan axle/pin (front)");
  nput(AXPIN_FREE, TAN, alongZ(P[0], P[1], -0.5, 1), "snail neck: tan axle/pin (back)");
  n.step();
  // 18: black thin 2L liftarms on a red 2L axle through the lime corner hole (they turn freely
  //     there), pointing up
  nput(AX2, RED, alongZ(LC[0], LC[1], 1, 1), "snail neck: red 2L axle (in the corner pin hole)", 0);
  nput(THIN2, BLACK, beam(LC, [0, 1], 0.25), "snail neck: black thin 2L liftarm (back)");
  nput(THIN2, BLACK, beam(LC, [0, 1], 1.75), "snail neck: black thin 2L liftarm (front)");
  n.step();
  // 19: white 4L bar through the top holes of the thin liftarms (centred) and the axle hole of the
  //     orange 1x3 axle/pin/pin cross block, which lies on the lime 3L arm pointing right; red 1L
  //     pin with stud in its right hole, gold T-piece stem in that stud (arms front/back)
  const bar: V2 = [LC[0], LC[1] + 1];
  nput(BAR4, WHITE, M([1, 0, 0], [0, 0, 1], [0, -1, 0], [bar[0], bar[1], -1]), "snail neck: white 4L bar (bars in axle holes register no connection)", 0);
  nput(XBLOCK, ORANGE, M([0, 0, 1], [1, 0, 0], [0, 1, 0], [bar[0] + 1, bar[1], 1]), "snail neck: orange cross block (head, turns on the bar)", 0);
  const hp = nput(HALFPIN, RED, M([0, 1, 0], [1, 0, 0], [0, 0, -1], [bar[0] + 2, bar[1] + 0.5, 1]), "snail neck: red 1L pin with stud");
  n.attach(TPIECE, GOLD, { to: hp, own: (s) => s.axis[1] < -0.9, offsets: [0], accept: (m) => m[7] < n.parts[hp].m[7] - 2 && Math.abs(m[10]) > 0.99, label: "snail neck: gold T-piece (antennae)" });
  n.step();
  // 20: eyes: lime 1x1 round plate with open stud + yellow 3x3 dish, onto each end of the bar,
  //     studs facing out (the bar passes through the open stud)
  for (const s of [1, -1] as const) {
    const Y: V3 = [0, 0, -s], X: V3 = [1, 0, 0];
    const zc = s === 1 ? 2 + 0.4 : 0 - 0.4;
    const pm = M(X, Y, cross(X, Y), [bar[0], bar[1], zc]);
    nput(RPLATE, LIME, pm, `snail neck: lime round plate (eye ${s === 1 ? "front" : "back"})`);
    nput(DISH, YELLOW, mul(pm, new Float64Array([1, 0, 0, 0, 0, 1, 0, -8, 0, 0, 1, 0])), `snail neck: yellow 3x3 dish (eye ${s === 1 ? "front" : "back"})`);
  }
  n.step();

  // ---- Steps 21-23: brown 3L links. 21: on the back tan pin; 22: the neck is lifted and the link
  //      hangs (nearly upright) onto the body's back grey pin; 23: front link on the front tan and grey pins.
  b.step();
  put(L3, BROWN, beam([(B[0] + P[0]) / 2, (B[1] + P[1]) / 2], unit2([P[0] - B[0], P[1] - B[1]]), -1), "snail: brown 3L link (back)", 1);
  b.step();
  for (const p of n.parts) b.place(p.file, p.color, p.m, p.label);
  b.step();
  put(L3, BROWN, beam([(B[0] + P[0]) / 2, (B[1] + P[1]) / 2], unit2([P[0] - B[0], P[1] - B[1]]), 3), "snail: brown 3L link (front)", 2);
}

export function build(lib: Library) {
  const b = new Build(lib, "M10 Fragile Microhabitats");
  // snail first in its own build so its first part can be placed freely, then merged
  const s = new Build(lib, "snail habitat");
  snailHabitat(s);
  spiderHabitat(b);
  const nSpider = b.parts.length;
  // snail habitat to the right of the spider habitat: 60 LDU gap, fronts aligned
  const sp = b.bounds(), sn = s.bounds();
  const dx = sp.max[0] + 60 - sn.min[0];
  const dz = sp.min[2] - sn.min[2];
  for (const p of s.parts) b.parts.push({ ...p, m: shift(p.m, [dx, 0, dz]), step: p.step + 9 });
  // stand on y = 0, centred in x/z
  // (the mat level from axis-aligned parts only: bounding boxes of tilted parts overshoot)
  const bb = b.bounds();
  const aligned = new Build(lib, "aligned");
  aligned.parts = b.parts.filter((p) => [0, 1, 2, 4, 5, 6, 8, 9, 10].every((k) => Math.abs(Math.abs(p.m[k]) - Math.round(Math.abs(p.m[k]))) < 1e-6));
  const t: V3 = [-(bb.min[0] + bb.max[0]) / 2, -aligned.bounds().max[1], -(bb.min[2] + bb.max[2]) / 2];
  for (const p of b.parts) p.m = shift(p.m, t);
  if (process.env.M10_INFO) {
    const a = new Build(lib, "a"), c = new Build(lib, "c");
    a.parts = b.parts.slice(0, nSpider);
    c.parts = b.parts.slice(nSpider);
    for (const [name, g] of [["spider", a], ["snail", c]] as const) {
      const q = g.bounds();
      console.log(name, g.parts.length, "parts; bounds min", q.min.map(Math.round), "max", q.max.map(Math.round), "size mm", q.size.map((v) => +(v * 0.4).toFixed(1)));
    }
  }
  return b;
}
