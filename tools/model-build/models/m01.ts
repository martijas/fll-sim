// Mission 01 Drone Survey (book 01, bags 1-2), scripted from the official building instructions
// (text-based book text-bi-01 + picture book-01). LDraw frame: -Y up, -Z = front, +X = right.
//
// Two separate objects on the mat, posed as in the field setup guide:
//  * the "cable" chain: red base (left) - 2 cables - drone - 2 cables - chair on a turntable (right).
//    Every cable is a 32L axle with an angle connector #1 on each end; all pins at the joints are
//    free-spinning (yellow/tan), so each cable pair hinges about Z at both ends and the drone can be
//    lifted off the mat. Base, drone leg and chair base all rest on the floor (cables tilted ~4-5 deg).
//    The chair's 6x6 round plate spins on the 4x4 turntable base.
//  * the stand with the LiDAR map: the map frame pivots on two tan axle-pins in the 5x5 L-brick base;
//    at the start it is rotated forward (map face down), as in the setup photo.
// Not snap-connected (no usable snap data): helmet visor, video game controller, red 1x1 round tile.
import { IDENTITY, mul, type Library, type Mat4 } from "@fll-sim/ldraw";
import { analyzePart } from "@fll-sim/assembly";
import { Build, all, at, axisIs, dir, near, orient, pt, rot, type SnapInfo } from "../src/build";

const BLACK = 0, RED = 4, YELLOW = 14, WHITE = 15, TAN = 19, LIME = 27, LBG = 71, DBG = 72, GREEN = 2, BGREEN = 10;
const TRBLUE = 33, TRLBLUE = 43, TRCLEAR = 47, TRBLACK = 10375, GOLD = 297, DKORANGE = 484, BLUE = 1;
const PIN = "61332.dat", FREEPIN = "3673.dat", AXPIN = "43093.dat";
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const P = (a: number, b: number, c: number): [number, number, number] => [a, b, c];

const bboxCache = new Map<string, number[]>();
/** Local bounding-box centre of a part. */
function lcenter(lib: Library, file: string): [number, number, number] {
  if (!bboxCache.has(file)) {
    const t = new Build(lib, "tmp");
    t.place(file, 0, IDENTITY);
    const bb = t.bounds(0);
    bboxCache.set(file, bb.min.map((v, k) => (v + bb.max[k]) / 2));
  }
  const c = bboxCache.get(file)!;
  return [c[0], c[1], c[2]];
}

/**
 * Attach a stud part onto the given studs (or anti-studs). By default the part's bounding-box
 * centre must lie over the centre of those studs (x/z); pass `at` to override, `at: null` to skip.
 */
function onStuds(b: Build, file: string, color: number, to: number | number[], o: {
  studs: [number, number, number][]; at?: [number, number] | null; min?: number; prefer?: (m: Mat4) => number; accept?: (m: Mat4) => boolean; label?: string; own?: (s: SnapInfo) => boolean; maxOverlap?: number; flip?: boolean; under?: boolean;
}) {
  const at = o.at === undefined ? [o.studs.reduce((a, p) => a + p[0], 0) / o.studs.length, o.studs.reduce((a, p) => a + p[2], 0) / o.studs.length] : o.at;
  const c = lcenter(b.lib, file);
  const t = new Build(b.lib, "tmp");
  t.place(file, 0, IDENTITY);
  const vert = (s: SnapInfo) => s.kind === "stud" || s.kind === "other" || (s.kind === "round" && Math.abs(s.axis[1]) > 0.99);
  const own = t.snaps(0, (s) => vert(s) && (!o.own || o.own(s)));
  // seated: at least one of the part's own stud/anti-stud snaps coincides with a target stud
  // every listed stud lies inside the part's footprint (disambiguates rotations)
  const lb = (() => { const bb = t.bounds(0); return bb; })();
  const covers = (m: Mat4) => {
    const cs = [lb.min[0], lb.max[0]].flatMap((a) => [lb.min[2], lb.max[2]].map((cc) => pt(m, [a, 0, cc])));
    const [x0, x1] = [Math.min(...cs.map((q) => q[0])), Math.max(...cs.map((q) => q[0]))];
    const [z0, z1] = [Math.min(...cs.map((q) => q[2])), Math.max(...cs.map((q) => q[2]))];
    return o.studs.every((p) => p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1);
  };
  // on top: the part reaches above the stud plane; under: it reaches below it
  const side = (m: Mat4) => {
    const ys = [lb.min[1], lb.max[1]].map((yy) => pt(m, [0, yy, 0])[1]);
    return o.under ? Math.max(...ys) > o.studs[0][1] + 4 : Math.min(...ys) < o.studs[0][1] - 4;
  };
  const tg = (Array.isArray(to) ? to : [to]).flatMap((i) => b.snaps(i, (s) => vert(s) && o.studs.some((p) => near(p, 1)(s))));
  const seated = (m: Mat4) => own.some((s) => {
    const w = pt(m, s.pos), a = dir(m, s.axis);
    return tg.some((t) => t.gender === (o.under ? "F" : "M") && t.gender !== s.gender && Math.hypot(w[0] - t.pos[0], w[1] - t.pos[1], w[2] - t.pos[2]) < 1 && Math.abs(a[0] * t.axis[0] + a[1] * t.axis[1] + a[2] * t.axis[2]) > 0.99);
  });
  return b.attach(file, color, {
    to,
    where: (s) => vert(s) && o.studs.some((p) => near(p, 2)(s)),
    own: o.own,
    minConnections: o.min ?? 1,
    offsets: [0],
    maxOverlap: o.maxOverlap ?? 10,
    accept: (m) => dir(m, [0, -1, 0])[1] * (o.flip ? -1 : 1) < -0.99 && seated(m) && covers(m) && side(m) && (!at || (Math.abs(pt(m, c)[0] - at[0]) < 1.5 && Math.abs(pt(m, c)[2] - at[1]) < 1.5)) && (!o.accept || o.accept(m)),
    prefer: o.prefer,
    label: o.label,
  });
}
/** A "cable": black 32L axle (along X) with an angle connector #1 on each end, pin holes along Z. */
export function cable(lib: Library) {
  const c = new Build(lib, "cable");
  const ax = c.place("50450.dat", BLACK, IDENTITY, "32L axle");
  const offs = Array.from({ length: 71 }, (_, i) => -350 + i * 10);
  for (const side of [-1, 1])
    c.attach("32013.dat", BLACK, {
      to: ax,
      own: (s) => s.kind === "axle" || s.secs.includes("A"),
      offsets: offs,
      accept: (m) => Math.abs(x(m) - side * 330) < 1 && Math.abs(Math.abs(dir(m, [1, 0, 0])[2]) - 1) < 0.01,
      label: side < 0 ? "left connector" : "right connector",
    });
  return c;
}
const grid = (xs: number[], yy: number, zs: number[]) => xs.flatMap((a) => zs.map((c) => P(a, yy, c)));

export function build(lib: Library) {
  const b = new Build(lib, "M01 Drone Survey");

  // ================= Base (steps 1-8) ================================================
  // 1.1 red 4x6 plate, horizontal (6 along X, 4 along Z); top at y = 0.
  const plate = b.place("3032.dat", RED, IDENTITY, "base 4x6 plate");
  // 1.2 2x2 slope, slope on the left, left two columns, back rows
  const slopeL = (m: Mat4) => (dir(m, [0, 0, -1])[0] < -0.9 ? 1 : 0);
  onStuds(b, "3039.dat", RED, plate, { studs: grid([-50, -30], 0, [10, 30]), prefer: slopeL, accept: (m) => slopeL(m) > 0, min: 2, label: "slope back" });
  b.step();
  // 2 second slope in front of it
  onStuds(b, "3039.dat", RED, plate, { studs: grid([-50, -30], 0, [-30, -10]), accept: (m) => slopeL(m) > 0, min: 2, label: "slope front" });
  b.step();
  // 3 red 2x2 brick, centred front-back, right of the slopes
  const br22 = onStuds(b, "3003.dat", RED, plate, { studs: grid([-10, 10], 0, [-10, 10]), label: "2x2 brick" });
  b.step();
  // 4.1 red 1x2 bricks with hole in front of / behind it; 4.2 yellow free pins sticking 1L out
  const holeF = onStuds(b, "3700.dat", RED, plate, { studs: grid([-10, 10], 0, [-30]), label: "front hole brick" });
  const holeB = onStuds(b, "3700.dat", RED, plate, { studs: grid([-10, 10], 0, [30]), label: "back hole brick" });
  const basePinF = b.attach(FREEPIN, YELLOW, { to: holeF, accept: (m) => Math.abs(z(m) + 40) < 1, label: "base front pin" });
  const basePinB = b.attach(FREEPIN, YELLOW, { to: holeB, accept: (m) => Math.abs(z(m) - 40) < 1, label: "base back pin" });
  b.step();
  // 5 red 2x4 brick on the two rightmost columns
  const br24 = onStuds(b, "3001.dat", RED, plate, { studs: grid([30, 50], 0, [-30, -10, 10, 30]), label: "2x4 brick" });
  b.step();
  // 6 four red 2x2 round plates with rounded bottom under the plate (feet; placed "upside down" on
  //   the flipped base, so they end up studs-up into the base with the rounded bottoms on the floor)
  for (const [cx, cz] of [[20, -20], [-20, -20], [20, 20], [-20, 20]])
    onStuds(b, "2654a.dat", RED, plate, { studs: grid([cx - 10, cx + 10], 8, [cz - 10, cz + 10]), under: true, label: "rounded-bottom foot" });
  b.step();
  // 7.1 red 1x4 brick on the rightmost column; 7.2 red 2x4 brick left of it
  const br14 = onStuds(b, "3010.dat", RED, br24, { studs: grid([50], -24, [-30, -10, 10, 30]), label: "1x4 brick" });
  const br24b = onStuds(b, "3001.dat", RED, [br24, br22, holeF, holeB], { studs: grid([10, 30], -24, [-30, -10, 10, 30]), label: "upper 2x4 brick" });
  b.step();
  // 8 red 2x4 tile, left column on the upper 2x4 brick's right column (flush with the right side)
  onStuds(b, "87079.dat", RED, [br14, br24b], { studs: grid([30, 50], -48, [-30, -10, 10, 30]), label: "2x4 tile" });
  b.step();
  // ================= Middle assembly = the drone (steps 10-18), own frame ===============
  const d = new Build(lib, "drone");
  // 10.1 transparent blue 2x4 plate, horizontal; top at y = 0
  const dp = d.place("3020.dat", TRBLUE, IDENTITY, "drone 2x4 plate");
  // 10.2 / 11 black 1x2 plate with inverted curved slope: plate row on the back (front) row,
  //   curved slope overhanging to the back (front)
  const curvedOut = (sgn: number) => (m: Mat4) => (dir(m, [0, 0, -1])[2] * sgn > 0.9 ? 1 : 0);
  const cvB = onStuds(d, "1750.dat", BLACK, dp, { studs: grid([-10, 10], 0, [10]), at: null, accept: (m) => curvedOut(1)(m) > 0 && Math.abs(x(m)) < 1, label: "inverted curved slope back" });
  const cvF = onStuds(d, "1750.dat", BLACK, dp, { studs: grid([-10, 10], 0, [-10]), at: null, accept: (m) => curvedOut(-1)(m) > 0 && Math.abs(x(m)) < 1, label: "inverted curved slope front" });
  d.step();
  // 12 red 2x2 brick centred on them
  const dbr = onStuds(d, "3003.dat", RED, [cvB, cvF], { studs: grid([-10, 10], -8, [-10, 10]), label: "drone 2x2 brick" });
  d.step();
  // 13.1 dark grey 1x2 bricks with rotation-joint socket left and right, socket facing outwards
  //   (80431 has no anti-stud snaps in the LDraw data: placed at its seat on the 2x4 plate studs,
  //   it is held by the 2x6 plate on top and the pin in its hole)
  const sock = [-1, 1].map((sg) => d.place("80431.dat", DBG, sg < 0 ? orient("-z", "+y", "+x", [-30, -32, 0]) : orient("+z", "+y", "-x", [30, -32, 0]), "socket brick"));
  // 13.2 red 1L pins with stud, stud outwards; 13.3 trans-black 1x1 round tiles on those studs
  const rp = sock.map((sk, i) => d.attach("89678.dat", RED, { to: sk, accept: (m) => dir(m, [-1, 0, 0])[0] * (i ? 1 : -1) > 0.9, label: "1L pin with stud" }));
  rp.forEach((p, i) => d.attach("98138.dat", TRBLACK, { to: p, where: (s) => s.kind === "stud", label: "trans-black 1x1 round tile" }));
  d.step();
  // 14 white 2x6 plate centred on top (outer columns overhang the socket bricks)
  const d26 = onStuds(d, "3795.dat", WHITE, [dbr, ...sock], { studs: grid([-30, -10, 10, 30], -32, [-10, 10]), label: "white 2x6 plate" });
  d.step();
  // 15.1 white 1x2 bricks with hole in front of / behind it (on the curved slopes' top studs)
  const dh = [-1, 1].map((sg) => onStuds(d, "3700.dat", WHITE, sg < 0 ? cvF : cvB, { studs: grid([-10, 10], -16, [sg * 30]), label: "white hole brick" }));
  // 15.2 tan 3L free pins: 1L in the hole, 2L sticking out to the front (back)
  const dpin = dh.map((h, i) => d.attach("39888.dat", TAN, { to: h, offsets: [-20, -10, 0, 10, 20], accept: (m) => Math.abs(z(m) - (i ? 50 : -50)) < 1, label: "tan 3L pin" }));
  d.step();
  // 16 white 3x3 quarter-round corner plates forming the plus-shaped rotor frame; each has its
  //   rounded corner towards the centre and legs along the 2x6 (left/right arms) and over the hole
  //   bricks (front/back arms)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    onStuds(d, "68568.dat", WHITE, [d26, ...dh], {
      studs: [P(sx * 50, -40, sz * 10), P(sx * 30, -40, sz * 10), P(sx * 10, -40, sz * 30)],
      at: [sx * 30, sz * 30],
      label: "white 3x3 corner plate",
    });
  d.step();
  // 17 black 2x2 round tiles with hole on the four arms
  const cps = d.parts.length;
  for (const [cx, cz] of [[-40, 0], [40, 0], [0, -40], [0, 40]])
    onStuds(d, "15535.dat", BLACK, [cps - 4, cps - 3, cps - 2, cps - 1], { studs: grid([cx - 10, cx + 10], -48, [cz - 10, cz + 10]), label: "rotor (2x2 round tile)" });
  d.step();
  // 18 two stacked transparent light blue 2x2 bricks under the 2x4 plate (the drone's leg)
  const leg1 = onStuds(d, "6223.dat", TRLBLUE, dp, { studs: grid([-10, 10], 8, [-10, 10]), under: true, label: "trans-light-blue 2x2 brick" });
  onStuds(d, "6223.dat", TRLBLUE, leg1, { studs: grid([-10, 10], 32, [-10, 10]), under: true, label: "trans-light-blue 2x2 brick" });

  // ================= Chair assembly (steps 25-33), own frame ============================
  const c = new Build(lib, "chair");
  // 25.1 light grey 6x6 round plate (top y = 0); 25.2 lime 2x4 plate, front-back, centred
  const r66 = c.place("11213.dat", LBG, IDENTITY, "6x6 round plate");
  const lime = onStuds(c, "3020.dat", LIME, r66, { studs: grid([-10, 10], 0, [-30, -10, 10, 30]), label: "lime 2x4 plate" });
  // 26.1 light grey 2x2 round plate right of it; 26.2 dark grey 2x2 round plate with 1 centre stud
  const r22 = onStuds(c, "4032a.dat", LBG, r66, { studs: grid([30, 50], 0, [-10, 10]), label: "2x2 round plate" });
  const r22s = onStuds(c, "18674.dat", DBG, r22, { studs: grid([30, 50], -8, [-10, 10]), label: "2x2 round plate with centre stud" });
  c.step();
  // 27 light grey 1x2 plates on the front and back rows of the lime plate
  const cp = [-1, 1].map((sg) => onStuds(c, "3023b.dat", LBG, lime, { studs: grid([-10, 10], -8, [sg * 30]), label: "1x2 plate" }));
  c.step();
  // 28.1 light grey 1x2 bricks with hole in front of / behind them; 28.2 yellow free pins, 1L out
  const ch = [-1, 1].map((sg) => onStuds(c, "3700.dat", LBG, r66, { studs: grid([-10, 10], 0, [sg * 50]), label: "chair hole brick" }));
  const chPin = ch.map((h, i) => c.attach(FREEPIN, YELLOW, { to: h, accept: (m) => Math.abs(z(m) - (i ? 60 : -60)) < 1, label: "chair pin" }));
  c.step();
  // 29 dark grey 2x2 curved slopes over the 1x2 plate + hole brick, tall side outwards
  for (const sg of [-1, 1])
    onStuds(c, "15068.dat", DBG, [cp[sg < 0 ? 0 : 1], ch[sg < 0 ? 0 : 1]], { studs: [...grid([-10, 10], -16, [sg * 30]), ...grid([-10, 10], -24, [sg * 50])], label: "curved slope" });
  c.step();
  // 30 black L-shaped bar: long leg down into the hollow stud of the round plate, short leg on top
  //    pointing to the front
  const lbar = c.attach("87618.dat", BLACK, {
    to: r22s,
    offsets: Array.from({ length: 41 }, (_, i) => -100 + i * 5),
    // upside down (handle on top), handle pointing to the front, lower end ~1 plate into the stud
    accept: (m) => dir(m, [0, -1, 0])[1] > 0.9 && pt(m, [0, 0, -20])[2] < pt(m, [0, 0, 0])[2] - 5 && pt(m, [0, -98, 0])[1] > -10 && pt(m, [0, -98, 0])[1] < 0,
    label: "L-shaped bar",
  });
  c.step();
  // 31 lime minifig seat: column of studs on the left (backrest on the right), between the curved slopes
  const seat = onStuds(c, "4079.dat", LIME, lime, { studs: grid([-10, 10], -8, [-10, 10]), at: null, min: 2, accept: (m) => dir(m, [0, 0, 1])[0] > 0.9 && Math.abs(z(m)) < 1 && Math.abs(x(m)) < 1, label: "minifig seat" });
  c.step();
  // 32 "radar dish": gold telescope, gold 1x1 round plate with open stud, trans-clear 3x3 dish;
  //    pushed sideways onto the bar's short leg, telescope pointing to the front
  const sd = new Build(lib, "radar dish");
  const tel = sd.place("64644.dat", GOLD, IDENTITY, "telescope");
  const gp = sd.attach("85861.dat", GOLD, { to: tel, offsets: [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10], accept: (m) => y(m) < -2 && y(m) > -8, label: "gold 1x1 round plate" });
  sd.attach("43898.dat", TRCLEAR, { to: gp, where: (s) => s.kind === "stud" && s.gender === "M", accept: (m) => y(m) < -6 && dir(m, [0, -1, 0])[1] < -0.9, label: "3x3 dish" });
  c.attachGroup(sd, {
    to: lbar,
    where: (s) => Math.abs(s.axis[2]) > 0.9,
    ownPart: [2],
    offsets: Array.from({ length: 13 }, (_, i) => -30 + i * 5),
    accept: (T) => pt(T, [0, 40, 0])[2] < pt(T, [0, -4, 0])[2] - 30,
    label: "radar dish",
  });
  c.step();
  // 33 base for the chair: light grey 8x8 round plate with a black 4x4 turntable base; the 6x6
  //    round plate's snap-stud clicks into the turntable, so the chair assembly spins freely
  const tt = c.attach("61485.dat", BLACK, { to: r66, where: (s) => s.kind === "round" && s.gender === "M", offsets: [-8, -6, -4, -2, 0, 2, 4, 6, 8], accept: (m) => y(m) > 4 && dir(m, [0, -1, 0])[1] < -0.9, label: "turntable 4x4 base" });
  const ttb = c.snaps(tt, (s) => s.gender === "F" && s.kind === "stud")[0].pos[1];
  onStuds(c, "74611.dat", LBG, tt, { studs: grid([-30, -10, 10, 30], ttb, [-30, -10, 10, 30]), under: true, label: "8x8 round plate" });
  c.step();

  // ================= Minifigure (steps 21-23, seated in 47.5), own frame (faces -Z) ========
  const mf = new Build(lib, "minifigure");
  const TEAL = 3, BROWN = 70;
  const hips = mf.place("3815.dat", TEAL, IDENTITY, "minifig hips");
  // legs bent 90 degrees at the hip pin (sitting): leg "down" points to the front
  const legs = ["3816.dat", "3817.dat"].map((f) => mf.place(f, TEAL, rot("x", -90, [0, 12, 0]), "minifig leg"));
  const torso = mf.place("973.dat", BROWN, at(0, -32, 0), "minifig torso (brown vest over striped tank top)");
  const arms = (["3818.dat", "3819.dat"] as const).map((f, i) =>
    mf.attach(f, YELLOW, { to: torso, where: (s) => s.kind === "round" && s.pos[0] * (i ? 1 : -1) > 0, accept: (m) => (x(m) * (i ? 1 : -1) > 10) && pt(m, [0, 18, -10])[2] < z(m) - 5, prefer: (m) => -pt(m, [0, 18, -10])[2] * 0.1 + pt(m, [0, 18, -10])[1] * 0.05, label: "minifig arm" }),
  );
  const hands = arms.map((a) => mf.attach("3820.dat", YELLOW, { to: a, offsets: [-4, -2, 0, 2, 4], label: "minifig hand" }));
  const head = mf.place("3626c.dat", YELLOW, at(0, -56, 0), "minifig head (big smile)");
  mf.place("2446.dat", WHITE, at(0, -56, 0), "white helmet");
  mf.place("2447.dat", BLACK, at(0, -56, 0), "black visor (no snap data: placed at the helmet pivot)");
  // 23 black video game controller in his hands (held by the hand clips; no usable snap: placed
  //    between the two hands)
  const hc = hands.map((h) => { const bb = mf.bounds(h); return bb.min.map((v, k) => (v + bb.max[k]) / 2); });
  mf.place("53118.dat", BLACK, at(0, (hc[0][1] + hc[1][1]) / 2 - 6, (hc[0][2] + hc[1][2]) / 2 - 2), "video game controller");
  // 47.5 the minifigure sits in the chair: the backs of his legs on the seat's two studs, facing -X
  c.attachGroup(mf, {
    to: seat,
    where: (s) => s.kind === "stud" && s.gender === "M",
    ownPart: legs,
    offsets: [0],
    // hips centred over the seat, back of the thighs on the studs at x = -10
    accept: (T) => dir(T, [0, 0, -1])[0] < -0.9 && dir(T, [0, -1, 0])[1] < -0.9 && Math.abs(pt(T, [0, 0, 0])[2]) < 2,
    minConnections: 2,
    maxOverlap: 30,
    label: "minifigure",
  });
  c.step();

  // ================= Put it together (steps 9, 19, 20, 24, 34, 35), flat first ================
  b.step();
  // 9 first cable (back): its left pin hole onto the base's back pin
  const conn = (g: number[], side: -1 | 1) => g[side < 0 ? 1 : 2];
  const holeAt = (T: Mat4, lx: number) => pt(T, [lx, 0, 0]);
  const cab1 = b.attachGroup(cable(lib), {
    to: basePinB, ownPart: [1],
    accept: (T) => Math.abs(holeAt(T, -330)[2] - 50) < 1 && holeAt(T, 330)[0] > 600,
    label: "cable 1 (back, base-drone)",
  });
  b.step();
  // 19 drone: back tan pin through the cable's right hole, 1L of pin left behind the cable
  const droneIdx = b.attachGroup(d, {
    to: conn(cab1, 1), ownPart: [14],
    offsets: [-20, -10, 0, 10, 20],
    accept: (T) => dir(T, [0, -1, 0])[1] < -0.9 && dir(T, [1, 0, 0])[0] > 0.9 && Math.abs(pt(T, [0, 0, 0])[2]) < 1,
    maxOverlap: 40,
    label: "drone",
  });
  b.step();
  // 20 second cable (front): base front pin to the drone's front pin
  const cab2 = b.attachGroup(cable(lib), {
    to: [basePinF, droneIdx[13]], ownPart: [1, 2], minConnections: 2,
    accept: (T) => Math.abs(holeAt(T, -330)[2] + 50) < 1 && holeAt(T, 330)[0] > 600,
    label: "cable 2 (front, base-drone)",
  });
  b.step();
  // 24 third cable (back): onto the free outer part of the drone's back pin
  const cab3 = b.attachGroup(cable(lib), {
    to: droneIdx[14], ownPart: [1],
    accept: (T) => Math.abs(holeAt(T, -330)[2] - 70) < 1 && holeAt(T, 330)[0] > 1200,
    label: "cable 3 (back, drone-chair)",
  });
  b.step();
  // 34 chair assembly: its back pin into the right hole of cable 3
  const chairIdx = b.attachGroup(c, {
    to: conn(cab3, 1), ownPart: [9],
    offsets: [-20, -10, 0, 10, 20],
    accept: (T) => dir(T, [0, -1, 0])[1] < -0.9 && dir(T, [1, 0, 0])[0] > 0.9 && Math.abs(pt(T, [0, 0, 0])[2]) < 1,
    maxOverlap: 40,
    label: "chair",
  });
  b.step();
  // 35 fourth cable (front): drone front pin (outer part) to the chair's front pin
  const cab4 = b.attachGroup(cable(lib), {
    to: [droneIdx[13], chairIdx[8]], ownPart: [1, 2], minConnections: 2,
    accept: (T) => Math.abs(holeAt(T, -330)[2] + 70) < 1 && holeAt(T, 330)[0] > 1200,
    label: "cable 4 (front, drone-chair)",
  });
  b.step();

  // ================= Stand with the LiDAR map (steps 36-47), own frame =====================
  const st = new Build(lib, "stand");
  // 36.1 light grey 4x6 technic brick with open centre, horizontal (top y = 0)
  const hb = st.place("32531a.dat", LBG, IDENTITY, "4x6 hollow technic brick");
  // 36.2 bright green 2x6 plate with two rounded corners on the back two rows, rounded corners back
  onStuds(st, "18980.dat", BGREEN, hb, { studs: grid([-50, -30, -10, 10, 30, 50], 0, [30]), at: [0, 20], accept: (m) => dir(m, [0, 0, -1])[2] > 0.9, label: "2x6 plate with rounded corners" });
  st.step();
  // 37.1 dark orange 2x2 tile in front of it; 37.2 green 1x2 rounded plates left and right of the tile
  onStuds(st, "3068b.dat", DKORANGE, hb, { studs: grid([-10, 10], 0, [-30]), at: [0, -20], label: "dark orange 2x2 tile" });
  const g12 = [-1, 1].map((sg) => onStuds(st, "35480.dat", GREEN, hb, { studs: [P(sg * 50, 0, -10)], at: [sg * 40, -10], label: "green 1x2 rounded plate" }));
  st.step();
  const top = st.parts.map((_, i) => i).slice(1);
  // 38.1 green 1x2 rounded plate front-back on the left; 38.2 bright green 1x3 rounded plate right of
  //   it; 38.3 red 1x1 round tile right of that one's middle stud
  onStuds(st, "35480.dat", GREEN, top, { studs: grid([-50], -8, [-10, 10]), label: "green 1x2 rounded plate" });
  onStuds(st, "77850.dat", BGREEN, top, { studs: grid([-30], -8, [-10, 10, 30]), label: "bright green 1x3 rounded plate" });
  // (98138's anti-stud snap in the LDraw data is reversed, so it cannot snap onto an upright stud:
  //  placed on the stud by position; it only rests there)
  st.place("98138.dat", RED, at(-10, -16, 10), "red 1x1 round tile (unsnapped)");
  st.step();
  // 39.1 green 1x2 rounded plate front-back right of the red tile; 39.2 bright green 2x2 round plate
  onStuds(st, "35480.dat", GREEN, top, { studs: grid([10], -8, [10, 30]), label: "green 1x2 rounded plate" });
  onStuds(st, "4032a.dat", BGREEN, top, { studs: grid([30, 50], -8, [-10, 10]), label: "bright green 2x2 round plate" });
  st.step();
  // 40.1 black pins into the front side holes, 40.2 blue axle/pins into the back side holes (axle out)
  const side = (sg: number) => (m: Mat4) => x(m) * sg > 55;
  const bp = [-1, 1].map((sg) => st.attach(PIN, BLACK, { to: hb, where: all(axisIs("x"), near([sg * 50, 10, -20], 2)), accept: side(sg), label: "black pin" }));
  const ap = [-1, 1].map((sg) => st.attach(AXPIN, BLUE, { to: hb, where: all(axisIs("x"), near([sg * 50, 10, 20], 2)), own: (s) => s.kind === "round", accept: (m) => side(sg)(m) && pt(m, [-10, 0, 0])[0] * sg < pt(m, [10, 0, 0])[0] * sg, label: "blue axle/pin" }));
  // 40.3 light grey 4x4 bent liftarms: back axle hole on the axle, 3rd hole on the black pin, front
  //   half sloping down
  const arm = [-1, 1].map((sg, i) => st.attach("32348.dat", LBG, {
    to: [bp[i], ap[i]], minConnections: 2,
    accept: (m) => x(m) * sg > 60 && Math.abs(z(m) - 20) < 1 && pt(m, [48, 0, 96])[1] > 20,
    label: "4x4 bent liftarm",
  }));
  st.step();
  // 41 tan axle/pins in the liftarms' front axle holes, pin sticking outwards (the pivot)
  const tp = [-1, 1].map((sg, i) => st.attach("3749.dat", TAN, { to: arm[i], where: (s) => s.kind === "axle" && s.pos[1] > 20, accept: (m) => x(m) * sg > 75 && pt(m, [10, 0, 0])[0] * sg < pt(m, [-10, 0, 0])[0] * sg, label: "tan axle/pin (pivot)" }));
  st.step();
  // 42 light grey 2L pin joiners on yellow free pins, pushed from the inside into the liftarms'
  //   second hole from the front (the joiners point inwards)
  const holes2 = arm.map((a) => st.snaps(a, (s) => s.kind === "round" && s.gender === "F").sort((p1, p2) => p2.pos[1] - p1.pos[1])[0]);
  const yp = [-1, 1].map((sg, i) => st.attach(FREEPIN, YELLOW, { to: arm[i], where: near(holes2[i].pos, 1), accept: (m) => x(m) * sg < 70 && x(m) * sg > 55, label: "yellow pin" }));
  yp.forEach((p, i) => st.attach("62462.dat", LBG, { to: p, accept: (m) => x(m) * [-1, 1][i] < 45, label: "2L pin joiner" }));
  st.step();

  // 43/44 the two halves of the stand's base. Each is a dark grey 5x5 L-shaped technic brick; the
  //   tan pivot pin goes into the hole of its side leg nearest the corner. After the book's 180
  //   degree turn the corner is at the back (outer side), the long legs meet in the middle behind
  //   the pivots, and the curved slopes sit at the back and at the outer side (text 43.5/44.5).
  //   (The text describes building them with the corner at the front; this is the same half as
  //   seen after the turn.)
  const piv = tp.map((p) => b0pos(st, p));
  const halves = [-1, 1].map((sg, i) => {
    const pv = piv[i];
    const zc = pv[2] + 30; // row (the L's corner row) 1.5 studs behind the pivot hole
    // (placed by computation: the pivot pin's snap frame is turned with the bent liftarm, so the
    //  attach search's 90-degree steps never give an upright brick; the hole still engages the pin)
    const hole = sg < 0 ? P(-40, 10, 10) : P(-10, 10, 40);
    const R = sg < 0 ? IDENTITY : rot("y", 90);
    const hw = pt(R, hole);
    const lb = st.place("32555.dat", DBG, at(sg * 90 - hw[0], pv[1] - hw[1], pv[2] - hw[2], R), "5x5 L-shaped technic brick");
    const top = st.bounds(lb).min[1] + 4, bot = top + 24;
    // under the free end of the long leg: light grey 1x2 plate
    const p12 = onStuds(st, "3023b.dat", LBG, lb, { studs: grid([sg * 10, sg * 30], bot, [zc]), under: true, label: "1x2 plate" });
    // under the long leg next to the corner: 2x2 plate with side studs, raised row behind, side studs back
    const s1 = onStuds(st, "4304.dat", DBG, lb, { studs: grid([sg * 50, sg * 70], bot, [zc]), under: true, at: [sg * 60, zc + 12], accept: (m) => dir(m, [0, 0, -1])[2] > 0.9, label: "2x2 plate with side studs (back)" });
    // under the side leg (2nd and 3rd stud from the corner): the same, raised column outside
    const s2 = onStuds(st, "4304.dat", DBG, lb, { studs: grid([sg * 90], bot, [zc - 20, zc - 40]), under: true, at: [sg * 102, zc - 30], accept: (m) => dir(m, [0, 0, -1])[0] * sg > 0.9, label: "2x2 plate with side studs (side)" });
    // 1x2 plates on the raised rows (not on the side studs)
    const q1 = onStuds(st, "3023b.dat", LBG, s1, { studs: grid([sg * 50, sg * 70], bot - 8, [zc + 20]), label: "1x2 plate" });
    const q2 = onStuds(st, "3023b.dat", LBG, s2, { studs: grid([sg * 110], bot - 8, [zc - 20, zc - 40]), label: "1x2 plate" });
    // dark grey 2x2 curved slopes: low edge on the 1x2 plate, tall edge on the L-brick
    onStuds(st, "15068.dat", DBG, [q1, lb], { studs: [...grid([sg * 50, sg * 70], bot - 16, [zc + 20]), ...grid([sg * 50, sg * 70], top, [zc])], label: "curved slope (back)" });
    onStuds(st, "15068.dat", DBG, [q2, lb], { studs: [...grid([sg * 110], bot - 16, [zc - 20, zc - 40]), ...grid([sg * 90], top, [zc - 20, zc - 40])], label: "curved slope (side)" });
    st.step();
    return { lb, p12, s2, zc, top, bot };
  });
  // 45 light grey 1x4 plate under the long legs' 1x2 plates, joining the two halves
  const zc = halves[0].zc, bot = halves[0].bot;
  onStuds(st, "3710.dat", LBG, halves.map((h) => h.p12), { studs: grid([-30, -10, 10, 30], bot + 8, [zc]), under: true, label: "1x4 plate (joins the halves)" });
  st.step();
  // 46 dark grey 1x4 tile on the same row, on top
  onStuds(st, "2431.dat", DBG, halves.map((h) => h.lb), { studs: grid([-30, -10, 10, 30], halves[0].top, [zc]), label: "1x4 tile" });
  st.step();
  // 47 small dish: black 1x2 plate with vertical bar, white 2x2 dish (upside down) over the bar,
  //    gold 1x1 round plate upside down, gold telescope; the plate goes on the two side studs of
  //    the left half's side 2x2 plate, dish on top, telescope pointing left
  const sd2 = new Build(lib, "small dish");
  const bp12 = sd2.place("88072.dat", BLACK, IDENTITY, "1x2 plate with vertical bar");
  const offs = Array.from({ length: 25 }, (_, i) => -24 + i * 2);
  const dsh = sd2.attach("4740.dat", WHITE, { to: bp12, where: (s) => s.kind === "stud" && s.pos[2] < -15, offsets: offs, accept: (m) => dir(m, [0, -1, 0])[1] > 0.9 && y(m) < -4 && y(m) > -14, label: "white 2x2 dish" });
  const gp2 = sd2.attach("85861.dat", GOLD, { to: [bp12, dsh], where: (s) => s.pos[2] < -15, offsets: offs, accept: (m) => dir(m, [0, -1, 0])[1] > 0.9 && y(m) < b0y(sd2, dsh) - 6 && y(m) > b0y(sd2, dsh) - 16, label: "gold 1x1 round plate" });
  sd2.attach("64644.dat", GOLD, { to: [bp12, gp2], where: (s) => s.pos[2] < -15, offsets: offs, accept: (m) => dir(m, [0, -1, 0])[1] > 0.9 && y(m) < y(sd2.parts[gp2].m) - 4, label: "gold telescope" });
  const sideStuds = st.snaps(halves[0].s2, (s) => s.kind === "stud" && Math.abs(s.axis[0]) > 0.9);
  st.attachGroup(sd2, {
    to: halves[0].s2, where: (s) => sideStuds.includes(s) || (s.kind === "stud" && Math.abs(s.axis[0]) > 0.9 && s.pos[0] < -115),
    ownPart: [0], offsets: [0], minConnections: 1,
    accept: (T) => dir(T, [0, 0, -1])[1] < -0.9 && dir(T, [0, -1, 0])[0] < -0.9,
    label: "small dish",
  });
  st.step();

  // ---- Pose on the mat: base, drone leg and chair base all rest on the floor. The cables hinge
  //      on the free-spinning pins (axes along Z), so tilt each cable pair about its left pin.
  const floorOf = (idx: number[]) => Math.max(...idx.map((i) => b.bounds(i).max[1]));
  const baseIdx = Array.from({ length: 16 }, (_, i) => i);
  const P0: [number, number] = [0, -14]; // base pin axis (x, y)
  const hBase = floorOf(baseIdx) - P0[1]; // pin height above the floor
  const pinD = b.snaps(droneIdx[14], (s) => s.kind === "round")[0].pos; // drone pin axis
  const hDrone = floorOf(droneIdx) - pinD[1];
  const pinC = b.snaps(chairIdx[9], (s) => s.kind === "round")[0].pos;
  const hChair = floorOf(chairIdx) - pinC[1];
  const L = 660; // pin-to-pin length of a cable (32L axle + two angle connectors)
  const a = Math.asin((hDrone - hBase) / L), c2 = Math.asin((hDrone - hChair) / L);
  const P1: [number, number] = [P0[0] + L * Math.cos(a), P0[1] - L * Math.sin(a)];
  const P2: [number, number] = [P1[0] + L * Math.cos(c2), P1[1] + L * Math.sin(c2)];
  const move = (idx: number[], T: Mat4) => idx.forEach((i) => (b.parts[i].m = mul(T, b.parts[i].m)));
  /** rotate by deg about the Z axis through `from`, then move `from` to `to` */
  const rz = (deg: number, from: [number, number], to: [number, number]) => {
    const R = rot("z", deg);
    const q = pt(R, [from[0], from[1], 0]);
    return rot("z", deg, [to[0] - q[0], to[1] - q[1], 0]);
  };
  const deg = 180 / Math.PI;
  move([...cab1, ...cab2], rz(-a * deg, P0, P0));
  move(droneIdx, rz(0, [pinD[0], pinD[1]], P1));
  move([...cab3, ...cab4], rz(c2 * deg, [pinD[0], pinD[1]], P1));
  move(chairIdx, rz(0, [pinC[0], pinC[1]], P2));

  // ---- The stand at its starting position (field setup guide, mission 01): rotated forward about
  //      its pivot pins as far as it goes (LiDAR map face down), behind and right of the drone, the
  //      base turned about 12 degrees.
  const stBase = new Set(Array.from({ length: st.parts.length - halves[0].lb }, (_, k) => halves[0].lb + k));
  const pv = piv[1];
  const floorSt = Math.max(...[...stBase].map((i) => st.bounds(i).max[1]));
  const rotating = st.parts.map((_, k) => k).filter((k) => !stBase.has(k));
  const turn = (d: number) => { const R = rot("x", d); const q = pt(R, pv); return rot("x", d, [0, pv[1] - q[1], pv[2] - q[2]]); };
  let phi = 0;
  for (let d = 1; d <= 180; d++) {
    const T = turn(d);
    // lowest point of the parts' collision boxes
    const low = Math.max(...rotating.flatMap((k) => {
      const m = mul(T, st.parts[k].m);
      return analyzePart(lib, st.parts[k].file).boxes.flatMap((bx) => [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => pt(m, [bx.c[0] + sx * bx.h[0], bx.c[1] + sy * bx.h[1], bx.c[2] + sz * bx.h[2]])[1]))));
    }));
    if (low > floorSt) break;
    phi = d;
  }
  const Tst = turn(phi);
  rotating.forEach((k) => (st.parts[k].m = mul(Tst, st.parts[k].m)));
  // drone centre -> stand base row centre: +384 LDU in X, +470 LDU in Z (from the setup photo)
  const dc = b.bounds(droneIdx[0]);
  const target = [(dc.min[0] + dc.max[0]) / 2 + 384, Math.max(...b.parts.map((_, i) => b.bounds(i).max[1])), 470];
  const rowC = [0, floorSt, halves[0].zc];
  const Ry = rot("y", -12);
  const rc = pt(Ry, rowC as [number, number, number]);
  const Tw = rot("y", -12, [target[0] - rc[0], target[1] - rc[1], target[2] - rc[2]]);
  b.step();
  for (const p of st.parts) b.place(p.file, p.color, mul(Tw, p.m), p.label);

  // floor at y = 0 (the chain's feet; the tilted stand's bounding boxes overstate its depth),
  // centred in x/z
  const bb = b.bounds();
  move(b.parts.map((_, i) => i), at(-(bb.min[0] + bb.max[0]) / 2, -target[1], -(bb.min[2] + bb.max[2]) / 2));
  return b;
}
const b0y = (b: Build, i: number) => b.parts[i].m[7];
/** Position of a part's first snap (pin axis point). */
function b0pos(b: Build, i: number) {
  return b.snaps(i, (s) => s.kind === "round" && s.gender === "M")[0].pos;
}
