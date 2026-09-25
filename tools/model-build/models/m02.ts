// Mission 02 Exploding Seeds (book 02, bag 3 + two hoses from bag 0), scripted from the official
// building instructions (text-based book text-bi-02 + picture book-02).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
//
// World orientation used here = the builder's view from step 5.4 on: the 5x7 frame lies with its 7L
// sides running front-back, the upright (T-beam + 11L) stands in the middle, the sloped stem runs
// from the low front end (6L bar the seeds hang on) up to the high back end (yellow connectors
// holding the hoses). The book's final 1:1 picture is the top view of this (front at the bottom).
//
// Game pieces: three seeds, each hooked by a gold ring on the green 6L bar. Seed 1 hangs from its
// ring on an L-bar; seeds 2 and 3 lie on the ends of the two bent lime hoses, whose spring holds
// them against the bar. Unhooking a ring releases its seed (M02: seeds no longer touching the stalk).
//
// Tooling limits (see the comments at each place): bars in axle holes never connect, the gold ring
// 3917 has no snap data, 15469's underside doesn't mate with the dome, the butterfly's snap is
// flipped, and LDraw has only a straight 19L hose, so the bent hoses are built from its own
// segment subparts (57539k01/k02) placed along a curve (each segment is a separate "part").
import { IDENTITY, mul, type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, all, at, orient, axisIs, dir, near, pt, type SnapInfo } from "../src/build";

const BLACK = 0, BLUE = 1, RED = 4, PINK = 5, BGREEN = 10, YELLOW = 14, TAN = 19, LIME = 27, BROWN = 70, LBG = 71, DBG = 72, LILAC = 85, GOLD = 297;
const PIN = "61332.dat", PIN3 = "42924.dat";
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const hole = (s: SnapInfo) => s.gender === "F";
type V = [number, number, number];
const cross = (a: V, c: V): V => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const add = (a: V, c: V, k = 1): V => [a[0] + c[0] * k, a[1] + c[1] * k, a[2] + c[2] * k];
const dot = (a: V, c: V) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const norm = (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };
/** Placement from the world directions of the part's local X, Y, Z axes (must be orthonormal, right-handed). */
const mat = (X: V, Y: V, Z: V, t: V): Mat4 => {
  if (Math.abs(dot(X, cross(Y, Z)) - 1) > 1e-6) throw new Error(`mat: not a rotation ${X} ${Y} ${Z}`);
  return new Float64Array([X[0], Y[0], Z[0], t[0], X[1], Y[1], Z[1], t[1], X[2], Y[2], Z[2], t[2]]);
};

/** Append a sub-assembly under placement T (parts keep their own labels). */
function merge(dst: Build, sub: Build, T: Mat4, label?: string): number[] {
  const step = (dst as unknown as { curStep: number }).curStep;
  return sub.parts.map((p) => {
    dst.parts.push({ ...p, m: mul(T, p.m), step, label: p.label ?? label });
    return dst.parts.length - 1;
  });
}

/**
 * Flexible hose (57539, 19L) bent along a cubic Bezier from end A (leaving along `oa`) to end B
 * (leaving along `ob`), with the control-arm length chosen so the centre line is `len` LDU long.
 * LDraw 57539 is straight, so the hose is built from its own end/segment subparts (57539k01 /
 * 57539k02, spaced as in 57539.dat) placed along the curve, all labelled `label`.
 */
function placeHose(b: Build, A: V, oa: V, B: V, ob: V, len: number, label: string): number[] {
  const bez = (k: number, u: number): V => {
    const P1 = add(A, oa, k), P2 = add(B, ob, k), w = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
    return [0, 1, 2].map((i) => w[0] * A[i] + w[1] * P1[i] + w[2] * P2[i] + w[3] * B[i]) as V;
  };
  const N = 2000;
  const table = (k: number) => {
    const pts = Array.from({ length: N + 1 }, (_, i) => bez(k, i / N));
    const acc = [0];
    for (let i = 1; i <= N; i++) acc.push(acc[i - 1] + Math.hypot(...add(pts[i], pts[i - 1], -1)));
    return { pts, acc };
  };
  let lo = 0, hi = 2000;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (table(mid).acc[N] < len) lo = mid; else hi = mid;
  }
  const { pts, acc } = table(lo);
  const L = acc[N];
  const at_ = (sArc: number): { p: V; t: V } => {
    const target = (sArc / len) * L;
    let i = 1;
    while (i < N && acc[i] < target) i++;
    const f = (target - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
    const p = add(pts[i - 1], add(pts[i], pts[i - 1], -1), f);
    return { p, t: norm(add(pts[i], pts[i - 1], -1)) };
  };
  const frame = (Y: V, pos: V): Mat4 => {
    const ref: V = Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const X = norm(cross(ref, Y)), Z = cross(X, Y);
    return mat(X, Y, Z, pos);
  };
  const out: number[] = [];
  const s0 = at_(0), s1 = at_(len);
  out.push(b.place("57539k01.dat", LIME, frame([-s0.t[0], -s0.t[1], -s0.t[2]], s0.p), label));
  for (let sArc = 13.4; sArc < len - 13; sArc += 5.8) {
    const q = at_(sArc);
    out.push(b.place("57539k02.dat", LIME, frame([-q.t[0], -q.t[1], -q.t[2]], q.p), label));
  }
  out.push(b.place("57539k01.dat", LIME, frame(s1.t, s1.p), label));
  return out;
}

/**
 * Seed body (steps 21-24 / 28-31), upright in its own frame: brown 2x2 dome bottom (origin, bottom
 * at y = 8) with two tan 1x1 round plates stacked inside the bowl, brown 2x2 round brick with four
 * points on the rim, brown 2x2 round tile with centre stud on top (top face y = -52, hollow stud).
 */
function seedCore(lib: Library, name: string): Build {
  const s = new Build(lib, name);
  s.place("15395.dat", BROWN, IDENTITY, `${name} dome bottom`);
  s.place("6141.dat", TAN, at(0, -8, 0), `${name} tan plate`);
  s.place("6141.dat", TAN, at(0, -16, 0), `${name} tan plate`);
  // Tooling limit: the brick's underside snaps don't match the dome rim / tan plate stud, so each
  // seed body falls into two rigid groups (dome + plates, brick + tile + what sits on it).
  s.place("15469.dat", BROWN, at(0, -44, 0), `${name} round brick with points`);
  s.place("18674.dat", BROWN, at(0, -52, 0), `${name} round tile with stud`);
  return s;
}

export function build(lib: Library) {
  const b = new Build(lib, "M02 Exploding Seeds");

  // ================= Base (steps 1-4) ================================================
  // 1.1 light grey 5x7 hollow frame, 7L sides running front-back (x = ±40), bottom on y = 0.
  const frame = b.place("64179.dat", LBG, at(0, -10, 0), "5x7 frame");
  // 1.2 black pin in the middle hole of the (right) 7L side, pointing into the frame
  const pinMid = b.attach(PIN, BLACK, { to: frame, where: all(axisIs("x"), near([40, -10, 0])), accept: (m) => Math.abs(x(m) - 30) < 1, label: "pin into frame" });
  b.step();
  // 2.1 black pin in the front hole of that side, sticking out (right)
  const pinOutF = b.attach(PIN, BLACK, { to: frame, where: all(axisIs("x"), near([40, -10, -40])), accept: (m) => Math.abs(x(m) - 50) < 1, label: "pin out front" });
  // 2.2 blue 3L pin in the back hole: 1L out, 1L into the frame, stop ring on the outside
  const pin3 = b.attach(PIN3, BLUE, {
    to: frame, where: all(axisIs("x"), near([40, -10, 40])), accept: (m) => Math.abs(x(m) - 40) < 2 && pt(m, [-10, 0, 0])[0] > 45, label: "3L pin through frame",
  });
  b.step();
  // 3 dark grey 5L beam on the outside of that side
  b.attach("32316.dat", DBG, { to: [pinOutF, pin3], minConnections: 2, accept: (m) => x(m) > 50, label: "outer 5L beam right" });
  b.step();
  // 4 two pins in the outer holes of the opposite side + a second 5L beam
  const pl = [-40, 40].map((zz) => b.attach(PIN, BLACK, { to: frame, where: all(axisIs("x"), near([-40, -10, zz])), accept: (m) => Math.abs(x(m) + 50) < 1 }));
  b.attach("32316.dat", DBG, { to: pl, minConnections: 2, accept: (m) => x(m) < -50, label: "outer 5L beam left" });
  b.step();

  // ================= Upright (step 5) ================================================
  // T-beam (stem up) with two pins to the left, 11L beam on them; bottom row of the T onto the two
  // pins that point into the frame.
  const s5 = new Build(lib, "upright");
  const tb = s5.place("60484.dat", LBG, orient("+z", "+x", "+y")); // holes along x, stem up (local +z -> -y), bar along world z
  const tHoles = s5.snaps(tb, hole);
  const tBottom = tHoles.filter((s) => s.pos[1] > 30);
  const tCentre = tBottom.sort((a, c) => Math.abs(a.pos[2]) - Math.abs(c.pos[2]))[0];
  const tTop = tHoles.sort((a, c) => a.pos[1] - c.pos[1])[0];
  const tp1 = s5.attach(PIN, BLACK, { to: tb, where: near(tCentre.pos, 1), accept: (m) => Math.abs(x(m) + 10) < 1 });
  const tp2 = s5.attach(PIN, BLACK, { to: tb, where: near(tTop.pos, 1), accept: (m) => Math.abs(x(m) + 10) < 1 });
  s5.attach("32525.dat", LIME, {
    to: [tp1, tp2], minConnections: 2, accept: (m) => Math.abs(x(m) + 20) < 1 && Math.abs(pt(m, [0, 0, 100])[1] - tCentre.pos[1]) < 1 && pt(m, [0, 0, -100])[1] < 0, label: "11L upright",
  });
  const up = b.attachGroup(s5, {
    to: [pinMid, pin3], ownPart: [0], minConnections: 2,
    accept: (T) => pt(T, [0, 0, 0])[1] < -20 && Math.abs(pt(T, [0, 0, 0])[0] - 20) < 1 && pt(T, [-20, 0, 0])[0] < pt(T, [0, 0, 0])[0],
    label: "upright", maxOverlap: 50,
  });
  void up;
  b.step();

  // ================= Stand top (steps 6-7) ===========================================
  // 6 lime 7x3 bent liftarm left of the 11L, 7L arm upright, 3L arm angled up and back (+z); black
  //   pins (sticking right) in holes 2 and 4 from the axle end (-> 11L top hole and the one 2 below)
  //   and in the two holes next to the far axle hole.
  const bent = b.place("32271.dat", LIME, orient("+z", "-x", "-y", [-20, -150, 20]), "7x3 bent liftarm");
  const bentPins = ([[0, 0, 20], [0, 0, 60], [0, 0, 120], [16, 0, 132]] as [number, number, number][]).map((lp) => {
    const h = pt(b.parts[bent].m, lp);
    return b.attach(PIN, BLACK, { to: bent, where: near(h, 1), accept: (m) => Math.abs(x(m) + 10) < 1 && Math.abs(pt(m, [0, 0, 0])[1] - h[1]) < 1 });
  });
  b.step();
  // 7 lime 7L beam on the two upper pins, its back end level with the bent liftarm's back axle hole
  // The beam sits at 36.87 deg on the two pins (the tool only tries 90 deg steps), so it is placed
  // from the hole geometry; the pins still connect it.
  const d7: V = [0, -0.6, 0.8];
  b.place("32524.dat", LIME, mat(cross([1, 0, 0], d7), [1, 0, 0], d7, [0, -258, 4]), "back 7L (stem carrier)");
  b.step();

  // ================= Stem (steps 8-15), built flat in its own frame ======================
  // Stem frame: pin holes along X (front = -X), stem running along -Z from the lime #5 connector
  // (origin) towards the yellow top, "up" = -Y (the side the #5's second arm points to).
  const st = new Build(lib, "stem");
  const c5 = st.place("32015.dat", LIME, IDENTITY, "#5 angle connector");
  const ax1 = st.attach("32062.dat", RED, { to: c5, where: near([0, 0, -10], 1), accept: (m) => Math.abs(z(m) + 30) < 1, label: "red 2L axle" });
  b.step();
  // 9 yellow #3: straight end on the red axle, angled end bending up (-Y)
  const c3a = st.attach("32016.dat", YELLOW, { to: ax1, accept: (m) => Math.abs(z(m) + 60) < 1 && Math.abs(x(m)) < 1 && pt(m, [0, -11.5, 27.7])[1] < -1 && pt(m, [0, -11.5, 27.7])[2] < -61, label: "#3 connector 1" });
  b.step();
  // 10 blue 3L pins through both pin holes, 1L out each side, stop ring at the back (+X)
  st.attach(PIN3, BLUE, { to: c5, where: all(axisIs("x"), near([0, 0, 0], 1)), accept: (m) => Math.abs(x(m)) < 1 && pt(m, [-10, 0, 0])[0] > 5, label: "blue pin (#5)" });
  st.attach(PIN3, BLUE, { to: c3a, where: all(axisIs("x"), near([0, 0, -60], 1)), accept: (m) => Math.abs(x(m)) < 1 && pt(m, [-10, 0, 0])[0] > 5, label: "blue pin (#3)" });
  b.step();
  // 11 red 2L axle in the angled end, second #3 with its angled end on it (straight end out, parallel)
  const angEnd = st.snaps(c3a, (s) => s.kind === "axle" && Math.abs(s.pos[1]) > 1)[0];
  const ax2 = st.attach("32062.dat", RED, { to: c3a, where: near(angEnd.pos, 1), accept: (m) => Math.hypot(...add(pt(m, [0, 0, 0]) as V, angEnd.pos as V, -1)) > 15, label: "red 2L axle 2" });
  const e1 = pt(st.parts[c3a].m, [0, -11.5, 27.7]), c1 = pt(st.parts[c3a].m, [0, 0, 0]);
  const c3bAt = add(e1, norm(add(e1, c1, -1)), 30); // centre of the second #3, 30 LDU further along
  const c3b = st.attach("32016.dat", YELLOW, {
    to: ax2, label: "#3 connector 2",
    accept: (m) => Math.hypot(...add(pt(m, [0, 0, 0]), c3bAt, -1)) < 1 && Math.abs(dir(m, [0, 0, -1])[2] + 1) < 0.01,
  });
  b.step();
  // 12.1 red 1/2 pin with stud in its pin hole, stud at the front (-X)
  const c3bC = pt(st.parts[c3b].m, [0, 0, 0]);
  st.attach("89678.dat", RED, { to: c3b, where: all(axisIs("x"), near(c3bC, 1)), accept: (m) => pt(m, [4, 0, 0])[0] < -10 && pt(m, [-20, 0, 0])[0] > -12, label: "red pin with stud" });
  // 12.2 grey 3L axle in the straight end, 2L sticking out
  const strEnd = pt(st.parts[c3b].m, [0, 0, -30]);
  const ax3 = st.attach("4519.dat", LBG, { to: c3b, where: (s) => s.kind === "axle" && Math.abs(s.pos[2] - (c3bC[2] - 10)) < 2, accept: (m) => Math.abs(z(m) - (strEnd[2] - 10)) < 1, label: "grey 3L axle" });
  b.step();
  // 13 flower: lime 1x1 round plate with leaves + pink 1x1 round plate, green 3L bar pushed up
  //    through both (top flush with the pink plate); the bar goes from the back (+X) through the
  //    red pin, leaves pointing along the stem (-Z).
  const fl = new Build(lib, "flower");
  const lp = fl.place("32607.dat", LIME, IDENTITY, "leaf plate (flower)");
  fl.attach("85861.dat", PINK, { to: lp, where: (s) => s.kind === "stud", accept: (m) => y(m) < -4, label: "pink round plate" });
  fl.place("87994.dat", BGREEN, at(0, -8, 0), "green 3L bar (flower)");
  merge(st, fl, mat([0, 0, -1], [-1, 0, 0], [0, 1, 0], [18, c3bC[1], c3bC[2]]));
  b.step();
  // 14 lime leaf plate on the red pin's stud (bar passes through its hollow stud), leaves up (-Y)
  st.place("32607.dat", LIME, mat([0, -1, 0], [1, 0, 0], [0, 0, 1], [-18, c3bC[1], c3bC[2]]), "leaf plate (front)");
  b.step();
  // 15 two yellow axle connectors with axle hole on the grey axle: first connector end to the
  //    front (-X), second to the back (+X)
  const joiners = [[-155, -1], [-175, 1]].map(([zz, sx]) => st.attach("42135.dat", YELLOW, {
    to: ax3, label: sx < 0 ? "hose connector front" : "hose connector back",
    accept: (m) => Math.abs(pt(m, [0, 0, -20])[2] - zz) < 1 && dir(m, [0, 0, 1])[0] * sx > 0.99,
  }));
  b.step();

  // ================= 16 stem onto the stand ============================================
  // The back ends of the blue pins go into the back 7L: #3 pin in its high (back) end hole, #5 pin
  // three holes lower (= its centre hole). Stem -Z runs up the 7L (d7), stem "up" is perpendicular.
  const STEM = mat([-1, 0, 0], [0, 0.8, 0.6], [0, 0.6, -0.8], [20, -258, 4]);
  const stem = merge(b, st, STEM);
  const S = (i: number) => stem[i];
  b.step();
  // 17 green 6L bar with stop in the #5's second (upward) axle hole
  const u5 = norm(add(pt(b.parts[S(c5)].m, [0, -27.7, 11.5]), pt(b.parts[S(c5)].m, [0, 0, 0]), -1));
  const e5 = pt(b.parts[S(c5)].m, [0, -27.7, 11.5]);
  const bx: V = [1, 0, 0], by: V = [-u5[0], -u5[1], -u5[2]];
  // Tooling limit: a round bar in an axle hole is rejected as a connection ("round pin in an axle
  // hole"), so the bar is seated only 2.5 LDU deep (instead of 16) to register as held; it is
  // 13.5 LDU (5 mm) further out than in the real model.
  b.place("63965a.dat", BGREEN, mat(bx, by, cross(bx, by), add(e5, u5, -2.5 + 16)), "6L bar (seed hook)");
  b.step();

  // ================= 18-20 front 7L, butterfly, leaves ==================================
  // 18.1 second lime 7L on the front ends of the blue pins (parallel to the back one)
  const front7 = b.place("32524.dat", LIME, mat(cross([1, 0, 0], d7), [1, 0, 0], d7, [40, -258, 4]), "front 7L");
  // hole k from the right (high) end of the front 7L
  const h7 = (k: number): V => [40, -294 + (k - 1) * 12, 52 - (k - 1) * 16];
  // 18.2 red 1/2 pins with stud, stud to the front (+X), in holes 2 and 5 from the right
  const studPin = (k: number) => b.attach("89678.dat", RED, {
    to: front7, where: all(axisIs("x"), near(h7(k), 1)), label: `red pin with stud (front 7L hole ${k})`,
    accept: (m) => pt(m, [4, 0, 0])[0] > 50 && pt(m, [-20, 0, 0])[0] < 32,
  });
  const sp2 = studPin(2);
  studPin(5);
  b.step();
  // 19 purple butterfly on the left (lower) one, placed from the stud position. Tooling limit: its
  // stud-tube snap has a negative Y scale, which flips its axis, so the stud rules only accept it
  // upside down (wings into the beam); placed the right way up it is reported as a loose part.
  b.place("80674.dat", LILAC, orient("+z", "-x", "-y", [50, h7(5)[1], h7(5)[2]]), "butterfly");
  b.step();
  // 20 two leaf sprigs: lime 1x1 round plate with leaves + carrot-top bar through its hollow stud
  // 20.4 one onto the red pin's stud (hole 2), bar in the pin's hollow stud, leaves up
  b.attach("32607.dat", LIME, { to: sp2, where: (s) => s.kind === "stud", accept: (m) => Math.abs(pt(m, [0, 0, 0])[0] - 58) < 0.5, prefer: (m) => -dir(m, [1, 0, 0])[1], offsets: [-12, -8, -4, 0, 4, 8, 12], label: "leaf plate (front 7L)" });
  // carrot top: bar (24 LDU) from the top of the plate's hollow stud (x = 62) down into the pin's stud
  b.place("33183.dat", LIME, mat([0, 1, 0], [-1, 0, 0], [0, 0, 1], [62 - 24, h7(2)[1], h7(2)[2]]), "carrot-top sprig (front 7L)");
  // 20.5 the other behind the bent liftarm, bar through its back (high) axle hole, leaves to the front (-Z)
  b.place("32607.dat", LIME, mat([0, 0, -1], [1, 0, 0], [0, -1, 0], [-38, -294, 52]), "leaf plate (bent liftarm)");
  // Tooling limit: a bar in an axle hole is never a connection, so this sprig (2 parts) shows up as a
  // loose group although it is pushed 12 LDU deep into the bent liftarm's axle hole.
  b.place("33183.dat", LIME, mat([0, -1, 0], [1, 0, 0], [0, 0, 1], [-42 + 24, -294, 52]), "carrot-top sprig (bent liftarm)");
  b.step();

  // ================= Seeds (steps 21-35) ================================================
  // Point on the 6L bar, t LDU out from its stop ring; the bar's direction u5.
  const barStop = add(e5, u5, 13.5 + 8);
  const P = (t: number) => add(barStop, u5, t);
  // Rings (3917) threaded on the bar: ring plane perpendicular to the bar, resting on it (inner
  // radius 16, bar radius 4 -> ring centre 12 below the bar axis, in the ring plane).
  const dn = norm(add([0, 1, 0], u5, -dot([0, 1, 0], u5)));
  // 3917 local frame: stud base at y 0..-12.5 (hollow stud tip at y = 0), ring centre (0,-28,0),
  // ring normal z. `d` = direction from the ring centre towards the base (and the seed).
  // NOTE: in the book the ring's stud axis is perpendicular to the ring plane; the LDraw 3917
  // geometry has it in the ring plane (ring "on top" of the stud), which is what is used here.
  const ring = (C: V, d: V, label: string) => {
    const n = norm(cross(d, dn)); // ring normal ~ along the bar
    return b.place("3917.dat", GOLD, mat(cross(d, n), d, n, add(C, d, 28)), label);
  };
  const seedAt = (name: string, domeOrigin: V, axisY: V, ref: V, label: string) => {
    const Y = norm(axisY), X = norm(cross(Y, ref)), Z = cross(X, Y);
    return merge(b, seedCore(lib, name), mat(X, Y, Z, domeOrigin), label);
  };

  // --- 21-27 seed 1 (the one hanging on the L-bar) --------------------------------------
  // L-shaped brown bar upright in the tile's hollow stud (down to the tan plates' stud), two red
  // bushes on it under the knuckle, tan 1x1 round plate with open stud + gold ring on the short arm.
  // Its ring hangs on the 6L bar right at the stop ring; the seed hangs below it, beside the stand.
  const C1 = add(P(16), dn, 12);
  const d1: V = [1, 0, 0];
  ring(C1, d1, "seed 1 gold ring");
  const B1 = add(C1, d1, 28); // stud tip of the ring base
  const K = add(B1, d1, 16.8); // knuckle centre of the L-bar
  const lz: V = d1; // L-bar local -z (short arm) points back to the ring
  b.place("87618.dat", BROWN, mat(cross([0, -1, 0], lz), [0, -1, 0], lz, K), "seed 1 L-shaped bar");
  b.place("85861.dat", TAN, mat([0, 1, 0], [-1, 0, 0], [0, 0, 1], add(B1, d1, 2.8)), "seed 1 tan round plate (ring stud)");
  for (const dy of [15.5, 35.5]) b.place("3713.dat", RED, mat([1, 0, 0], [0, 0, -1], [0, 1, 0], add(K, [0, dy, 0])), "seed 1 red bush");
  seedAt("seed 1", add(K, [0, 118.5, 0]), [0, 1, 0], [0, 0, 1], "seed 1");
  b.step();

  // --- 28-35 seeds 2 and 3 on the hoses -------------------------------------------------
  // Each: seed body lying horizontal, brown 2L bar with stop in the dome's bottom, gold ring on
  // its outer end, lime 19L hose from the tile's hollow stud to a yellow connector at the top of
  // the stem (back seed -> back connector, front seed -> front connector). The rings hook onto the
  // 6L bar outside seed 1's ring; the bent hoses form a loop over the stand.
  const hoseSeed = (name: string, t: number, d: V, conn: number) => {
    const C = add(P(t), dn, 12);
    ring(C, d, `${name} gold ring`);
    const B = add(C, d, 28);
    b.place("78258.dat", BROWN, mat(cross(d, [0, 1, 0]), d, [0, 1, 0], add(B, d, 4)), `${name} 2L bar with stop`);
    const dome0 = add(B, d, 16);
    seedAt(name, dome0, [-d[0], -d[1], -d[2]], [0, 1, 0], name);
    // hose: from the connector's axle end (tube 10 LDU inside) to the tile's hollow stud (12 inside)
    const cm = b.parts[conn].m;
    const o = norm(dir(cm, [0, 0, 1]));
    const A = add(pt(cm, [0, 0, 10]), o, 10);
    const Bh = add(dome0, d, 64);
    return placeHose(b, A, o, Bh, d, 340, `${name} hose`);
  };
  b.step();
  hoseSeed("seed 2 (back)", 38, [-1, 0, 0], stem[joiners[1]]);
  b.step();
  hoseSeed("seed 3 (front)", 62, [1, 0, 0], stem[joiners[0]]);
  b.step();

  return b;
}
