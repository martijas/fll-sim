// Mission 05 Reaching Roots (bag 7), scripted from the official building instructions
// (text-based book + picture book, 34 steps). LDraw frame: -Y up, -Z = front (towards the
// builder), +X = right.
//
// Layout (world, LDU): two light grey 5x7 frames stand upright front-to-back at x = ±40 (bottom at
// y = 0, front beam at z = -40); a 3x3 block joins their front beams; the two brown 7x3 bent
// liftarms (the trunk) sit on the inner faces of the front beams at x = ±20. The trunk extension
// (step 8) hinges on a white axle/pin in the trunks' corner holes (y = -210, z = -40) and the root
// arm (steps 24-32) hinges on a 4L axle at the tip of the extension. In the field setup guide photo
// (match start) the extension has fallen forward over the front detail, its 3L arm hanging down,
// and the root arm lies back towards the tree with the lever standing up.
import { IDENTITY, mul, type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, all, at, axisIs, near, orient, rot, type SnapInfo } from "../src/build";

const LBG = 71, DBG = 72, BLACK = 0, BLUE = 1, BROWN = 70, GREEN = 2, BGREEN = 10, RED = 4, TAN = 19, WHITE = 15, NOUGAT = 84, YELLOW = 14, CORAL = 353;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", AXPIN3 = "65249.dat", AXPIN3F = "11214.dat", PIN3FREE = "39888.dat", STUDPIN = "65826.dat";
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const hole = (s: SnapInfo) => s.gender === "F";
type V3 = [number, number, number];

/** Matrix from the images of the local X, Y, Z axes and the origin. */
const frame = (ax: V3, ay: V3, az: V3, o: V3): Mat4 => new Float64Array([ax[0], ay[0], az[0], o[0], ax[1], ay[1], az[1], o[1], ax[2], ay[2], az[2], o[2]]);
const tr = (t: V3): Mat4 => at(t[0], t[1], t[2]);
const apply = (m: Mat4, p: V3): V3 => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
/** Snap whose axis line passes through p (within tol), at most `along` away along the axis. */
const onAxis = (p: V3, tol = 1.5, along = 15) => (s: SnapInfo) => {
  const v = [p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]];
  const t = v[0] * s.axis[0] + v[1] * s.axis[1] + v[2] * s.axis[2];
  return Math.abs(t) <= along && Math.hypot(v[0] - t * s.axis[0], v[1] - t * s.axis[1], v[2] - t * s.axis[2]) <= tol;
};
const near3 = (a: V3, b: V3, tol = 1.5) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

/** A part placed relative to a local frame (a sub-assembly), placed in the model later. */
interface Local { file: string; color: number; m: Mat4; label: string; min: number }

// ---- pose of the two hinged sub-assemblies (degrees) --------------------------------------
// theta: trunk extension about the white axle/pin, angle of its 7L arm from straight up towards
//        the back (+Z); negative = fallen forward (book: about +25, resting on the axle joiner).
// psi:   root arm about the 4L axle, angle of its green 7L beams below the horizontal towards
//        the back.
// phi:   lever (5L liftarm on the free tan pin), clockwise from upright seen from the root arm's
//        front (towards the back of the tree once mounted).
// Default = the match-start pose of the field setup guide photo (found with a collision search,
// see poseSearch below).
const POSE = { theta: -117, psi: 19, phi: -19 };

export function build(lib: Library) {
  const env = (k: string, d: number) => (process.env[k] !== undefined ? Number(process.env[k]) : d);
  return make(lib, { theta: env("M05_THETA", POSE.theta), psi: env("M05_PSI", POSE.psi), phi: env("M05_PHI", POSE.phi) });
}

export function make(lib: Library, pose: { theta: number; psi: number; phi: number }) {
  const b = new Build(lib, "M05 Reaching Roots");
  /** Pin-like part attached into a given hole with its centre at a given point. */
  const pinAt = (file: string, color: number, to: number | number[], holePos: V3, centre: V3, label?: string, extra?: (m: Mat4) => boolean) =>
    b.attach(file, color, { to, where: onAxis(holePos), accept: (m) => near3([x(m), y(m), z(m)], centre) && (!extra || extra(m)), offsets: [-30, -20, -10, 0, 10, 20, 30], label });

  // ---- Group 1: steps 1-6 ---------------------------------------------------------------
  // 1.1 right 5x7 hollow frame, upright, running front-back (7L liftarms upright)
  const FR = orient("+z", "-x", "-y", [40, -70, 0]);
  const f1 = b.place("64179.dat", LBG, FR, "right hollow frame");
  // 1.2 pin from the top into the middle hole on the top side of the bottom beam
  const upPinR = pinAt(PIN, BLACK, f1, [40, -10, 0], [40, -20, 0], "pin up (right frame)");
  b.step();
  // 2 two pins from the left into the bottom two holes on the left of the front beam
  const p2 = [-10, -50].map((yy) => pinAt(PIN, BLACK, f1, [40, yy, -40], [30, yy, -40]));
  b.step();
  // 3 dark grey 3x3 block, upright facing front, its two right side holes onto those pins
  const blk = b.put("39793.dat", DBG, orient("+x", "+z", "-y", [0, -30, -40]), 2, "3x3 block (front)");
  b.step();
  // 4 two pins from the left into the block's two left side holes
  const p4 = [-10, -50].map((yy) => pinAt(PIN, BLACK, blk, [-21, yy, -40], [-30, yy, -40]));
  b.step();
  // 5 right trunk: 7x3 bent liftarm upright on the inner face of the frame's front beam, the 3L
  //   arm at the top pointing back; blue axle/pin in its bottom axle hole, pin two holes up, both
  //   into the top two left holes of the front beam.
  const TR = orient("+z", "-x", "-y", [20, -90, -40]); // local z = up the 7L, local x = back
  const trunkR = b.place("32271.dat", BROWN, TR, "right trunk bent liftarm");
  pinAt(AXPIN, BLUE, [trunkR, f1], [20, -90, -40], [30, -90, -40], "right trunk axle/pin");
  pinAt(PIN, BLACK, [trunkR, f1], [20, -130, -40], [30, -130, -40], "right trunk pin");
  b.step();
  // 6 blue 3L pin (stop ring on the left) with a 1L liftarm in the middle, its right end in the
  //   4th hole from the bottom of the bent liftarm
  const pin6 = pinAt(PIN3, BLUE, trunkR, [20, -150, -40], [0, -150, -40], "trunk 3L pin", (m) => m[0] > 0.5); // stop ring (at local -x) on the left
  b.put("18654.dat", BROWN, at(0, -150, -40, rot("z", 90)), 1, "1L liftarm (trunk)");
  b.step();

  // ---- Group 2: steps 7-13 --------------------------------------------------------------
  // 7 green 2L liftarm on a red 2L axle in the top axle hole of the right trunk, on its outer
  //   side, hanging back-down at right angles to the 3L arm; axle/pin + 3L axle joiner +
  //   axle/pin from its pin hole run left under the 3L arm (to the left trunk's green 2L).
  //   In the trunk frame: 3L arm direction (0.8,0,0.6), the green 2L runs along (0.6,0,-0.8).
  const greenM = (side: 1 | -1, T: Mat4) => mul(T, frame([-0.8, 0, -0.6], [0, 1, 0], [0.6, 0, -0.8], [32, -20 * side, 144]));
  const along = (T: Mat4, ly: number, lz = 20): V3 => apply(T, [32 + 0.6 * lz, ly, 144 - 0.8 * lz]);
  const gR = b.put("60483.dat", GREEN, greenM(1, TR), 0, "green 2L liftarm (right)");
  const topR = apply(TR, [32, 0, 144]);
  pinAt("32062.dat", RED, [trunkR, gR], topR, apply(TR, [32, -10, 144]), "red 2L axle (right)");
  const apR = pinAt(AXPIN, BLUE, gR, along(TR, -20), along(TR, -10), "joint axle/pin (right)");
  const joiner = b.attach("42195.dat", NOUGAT, { to: apR, accept: (m) => near3([x(m), y(m), z(m)], along(TR, 20)), label: "3L axle joiner (trunk)" });
  const apL = b.attach(AXPIN, BLUE, { to: joiner, accept: (m) => near3([x(m), y(m), z(m)], along(TR, 50)), label: "joint axle/pin (left)" });
  b.step();

  // 8 trunk extension, built in the frame of its bent liftarm ("UB": local z = along the 7L
  //   from the front axle hole, local x = side of the 3L arm, local y = world +X):
  //   5L liftarm on its right with a red stud pin + coral flower plate in the back hole, two
  //   pins joining it to the bent liftarm's 4th hole and corner hole, white 3L axle/pin through
  //   the front axle hole (1L out on the left, pin on the right).
  const ext: Local[] = [
    { file: "32271.dat", color: BROWN, m: IDENTITY, label: "upper bent liftarm", min: 0 },
    { file: "32316.dat", color: BROWN, m: frame([1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 20, 100]), label: "trunk extension 5L", min: 0 },
  ];
  // pins from the left of the 5L into the bent liftarm (centre at the joint face y = 10)
  for (const zz of [60, 120]) ext.push({ file: PIN, color: BLACK, m: frame([0, 1, 0], [-1, 0, 0], [0, 0, 1], [0, 10, zz]), label: "trunk extension pin", min: 2 });
  // extension frame in the world: hinge = the right trunk's corner hole (x = 0 between the trunks)
  const hinge: V3 = [0, -210, -40];
  const th = (pose.theta * Math.PI) / 180;
  const d: V3 = [0, -Math.cos(th), Math.sin(th)], e: V3 = [0, -Math.sin(th), -Math.cos(th)];
  const E = frame(e, [1, 0, 0], d, hinge);
  const extIdx: number[] = [];
  for (const p of ext) extIdx.push(b.put(p.file, p.color, mul(E, p.m), p.min, p.label));
  // red 1L pin with a stud in the back hole of the 5L, stud on the right; coral flower plate on it
  const bp5 = apply(E, [0, 20, 140]);
  const sp = b.attach(STUDPIN, RED, { to: extIdx[1], where: near(bp5, 12), accept: (m) => m[0] > 0.99, label: "red stud pin (extension)" });
  b.attach("24866.dat", CORAL, { to: sp, where: (s) => s.kind === "stud" && s.gender === "M", label: "coral flower plate" });
  // white 3L axle/pin (pin at its own -X end): axle through the front axle hole of the bent
  // liftarm with 1L out on the left, pin on the right -> into the right trunk's corner hole
  b.put(AXPIN3, WHITE, mul(E, frame([0, -1, 0], [1, 0, 0], [0, 0, 1], [0, 0, 0])), 2, "white 3L axle/pin (extension hinge)");
  b.step();

  // 9 left trunk bent liftarm (same pose as the right one, 40 LDU to the left): corner hole on the
  //   white axle, 4th hole on the 3L pin; axle/pin + pin sticking out left for the left frame
  const TL = orient("+z", "-x", "-y", [-20, -90, -40]);
  const trunkL = b.put("32271.dat", BROWN, TL, 2, "left trunk bent liftarm");
  const tlAx = pinAt(AXPIN, BLUE, trunkL, [-20, -90, -40], [-30, -90, -40], "left trunk axle/pin");
  const tlPin = pinAt(PIN, BLACK, trunkL, [-20, -130, -40], [-30, -130, -40], "left trunk pin");
  b.step();
  // 10 red 2L axle from the left into the top axle hole, green 2L liftarm on it (outer side),
  //    its pin hole on the joint axle/pin
  const gL = b.put("60483.dat", GREEN, greenM(-1, TL), 1, "green 2L liftarm (left)");
  pinAt("32062.dat", RED, [trunkL, gL], apply(TL, [32, 0, 144]), apply(TL, [32, 10, 144]), "red 2L axle (left)");
  b.step();
  // 11 left 5x7 frame onto the four pins on the left; pin up in its bottom beam
  const f2 = b.put("64179.dat", LBG, orient("+z", "-x", "-y", [-40, -70, 0]), 4, "left hollow frame");
  const upPinL = pinAt(PIN, BLACK, f2, [-40, -10, 0], [-40, -20, 0], "pin up (left frame)");
  b.step();
  // 12 stabiliser: flat 3x3 block (rounded ends front/back) with pins up in its left and right
  //    holes, 5L liftarm on those pins; the 5L's end holes go onto the frames' pins
  const blk2 = b.put("39793.dat", DBG, at(0, -10, 0), 0, "3x3 block (stabiliser)");
  const sp1 = [-20, 20].map((xx) => pinAt(PIN, BLACK, blk2, [xx, -10, 0], [xx, -20, 0]));
  b.put("32316.dat", BROWN, orient("-z", "+y", "+x", [0, -30, 0]), 4, "5L stabiliser");
  void sp1; void upPinR; void upPinL;
  b.step();
  // 13 red 1L pins with a stud, studs to the front: three front holes of the right frame, the
  //    bottom front hole of the left frame, top and bottom holes of the front block's cross
  const studPin = (part: number, p: V3) =>
    b.attach(STUDPIN, RED, { to: part, where: all(hole, axisIs("z"), near(p, 3)), accept: (m) => m[8] < -0.99 && Math.abs(z(m) + 50) < 1, label: "stud pin (front)" });
  const studs = [...[-30, -70, -110].map((yy) => studPin(f1, [40, yy, -40])), studPin(f2, [-40, -30, -40]), ...[-50, -10].map((yy) => studPin(blk, [0, yy, -40]))];
  b.step();

  // ---- Group 3: steps 14-23, front detail, built lying flat on a green 3x3 plate ------------
  //    (its own frame: studs up = -y, front = -z; stud-grid parts placed exactly)
  const dd = new Build(lib, "front detail");
  dd.place("11212.dat", GREEN, IDENTITY, "3x3 plate"); // top at y = 0, studs at x,z in {-20,0,20}
  dd.put("3298.dat", BROWN, at(10, -24, 20), 4, "2x3 slope"); // 14.2 right two columns, slope at the front
  dd.step();
  dd.put("3002.dat", BROWN, at(-40, -24, 10), 2, "2x3 brick"); // 15 backs even, left two columns overhang
  dd.step();
  dd.put("3021.dat", BROWN, at(-50, 0, 0, rot("y", 90)), 4, "2x3 plate under the overhang"); // 16
  dd.step();
  dd.put("3004.dat", BROWN, at(-50, -48, 20), 2, "1x2 brick"); // 17 back row, left sides even
  dd.step();
  dd.put("3573.dat", BROWN, at(-10, -88, 20, rot("y", 90)), 1, "curved slope"); // 18 on the 1x2's right stud
  dd.step();
  // 19 green 1x2 slopes, tall side at the back: centred on the front row (right of the leftmost
  //    column, which the arch takes), and on the brick behind it
  dd.put("85984.dat", GREEN, at(-30, 0, -20), 2, "1x2 slope (front)");
  dd.put("85984.dat", GREEN, at(-30, -24, 0), 2, "1x2 slope");
  dd.step();
  // 20 brown 1x5x4 inverted half arch on the leftmost column, tall end at the back (its stepped
  //    bottom sits on the 1x2 brick, the 2x3 brick and the 2x3 plate), front two studs overhanging
  dd.put("30099.dat", BROWN, at(-60, -96, 20, rot("y", 90)), 3, "1x5x4 inverted arch");
  dd.step();
  // 21 brown 1x3 plate under the two overhanging studs (sticks out one more to the front)
  dd.put("3623.dat", BROWN, at(-60, 0, -60, rot("y", 90)), 2, "1x3 plate");
  dd.step();
  // 22.1 green 1x2 curved slope: front stud on the plate's front stud, back on the arch's low stud
  dd.put("11477.dat", GREEN, at(-60, 0, -70), 1, "1x2 curved slope");
  // 22.2 brown 1x1 slope on the arch's top stud, tall side at the back
  dd.put("54200.dat", BROWN, at(-60, -96, 20), 1, "1x1 slope");
  dd.step();
  b.step();
  // 23 the detail goes onto the six studs on the front of the tree, anti-studs to the back, the
  //    arch upright on the right; left, right and bottom sides even with the tree
  const detail = b.attachGroup(dd, { to: studs, where: (s) => s.gender === "M", rotation: orient("-x", "+z", "+y"), minConnections: 5, maxOverlap: 25 /* plates touching the frames */, accept: (T) => Math.abs(x(T) + 20) < 1 && Math.abs(y(T) + 30) < 1, label: "front detail" });
  b.step();

  // ---- Group 4: steps 24-32, root arm, built flat in its own frame "R" ---------------------
  //    (R: X = right along the 7L beams, Y = down, Z = back; 7L beams' holes face front/back)
  const r: Local[] = [];
  const beam = (zz: number): Mat4 => orient("+y", "+z", "+x", [0, 0, zz]);
  r.push({ file: "32524.dat", color: GREEN, m: beam(0), label: "green 7L (root arm, back)", min: 0 }); // 24.1
  // 24.2 blue 3L pins from the front into the rightmost and 4th-from-left holes, 2L out to the
  //      front; 25 a 1L liftarm pushed back onto each
  for (const xx of [60, 0]) r.push({ file: PIN3, color: BLUE, m: frame([0, 0, -1], [1, 0, 0], [0, -1, 0], [xx, 0, -20]), label: "root arm 3L pin", min: 1 });
  for (const xx of [60, 0]) r.push({ file: "18654.dat", color: BROWN, m: at(xx, 0, -20, rot("x", 90)), label: "1L liftarm (root arm)", min: 1 });
  // 26 lever: 5L liftarm upright on a free tan 3L pin in the 7L's 3rd hole from the right, a dark
  //    grey 3L axle/pin (axle to the back) in its top hole and a black pin in the hole below
  const lev: Local[] = [
    { file: "32316.dat", color: BROWN, m: orient("+x", "+z", "-y", [20, -40, -20]), label: "lever 5L", min: 0 },
    { file: PIN3FREE, color: TAN, m: frame([0, 0, -1], [1, 0, 0], [0, -1, 0], [20, 0, -20]), label: "tan free 3L pin (lever pivot)", min: 1 },
    { file: AXPIN3F, color: DBG, m: frame([0, 0, 1], [1, 0, 0], [0, 1, 0], [20, -80, -20]), label: "dark grey 3L axle/pin", min: 1 },
    { file: PIN, color: BLACK, m: frame([0, 0, 1], [1, 0, 0], [0, 1, 0], [20, -60, -30]), label: "lever pin", min: 1 },
  ];
  // 27 second green 7L onto the three pins on the front
  const g2: Local = { file: "32524.dat", color: GREEN, m: beam(-40), label: "green 7L (root arm, front)", min: 2 };
  // 28 red 3L axle joiner on the axle at the back of the lever top, yellow 3L axle in it;
  // 29 red bush + red ball on the yellow axle (the lever handle)
  lev.push({ file: "42195.dat", color: RED, m: at(20, -80, 20), label: "lever handle joiner", min: 1 });
  lev.push({ file: "4519.dat", color: YELLOW, m: frame([0, 0, 1], [0, 1, 0], [-1, 0, 0], [20, -80, 60]), label: "yellow 3L axle", min: 1 });
  lev.push({ file: "3713.dat", color: RED, m: at(20, -80, 60), label: "red bush", min: 1 });
  // (index 7: the ball is attached by search in step 29 below, this entry documents its pose)
  lev.push({ file: "32474.dat", color: RED, m: frame([1, 0, 0], [0, 0, -1], [0, 1, 0], [20, -80, 70 + 9.3]), label: "lever handle ball", min: 1 });
  // 30 bright green cross block on the two front pins, its axle bushing on the lever's left side
  lev.push({ file: "32291.dat", color: BGREEN, m: orient("-y", "+x", "+z", [0, -70, -40]), label: "cross block", min: 2 });
  // 31 red 2L axle into the bushing from the lever-top end, brown macaroni tube on it, other hole
  //    pointing away from the lever; red 2L axle in that; 32 brown 1x1 cone + brown claw on top
  lev.push({ file: "32062.dat", color: RED, m: frame([0, -1, 0], [1, 0, 0], [0, 0, 1], [0, -90, -40]), label: "red 2L axle (claw)", min: 1 });
  lev.push({ file: "25214.dat", color: BROWN, m: orient("-y", "+z", "-x", [0, -120, -40]), label: "macaroni tube", min: 1 });
  lev.push({ file: "32062.dat", color: RED, m: frame([1, 0, 0], [0, 1, 0], [0, 0, 1], [-30, -120, -40]), label: "red 2L axle (cone)", min: 1 });
  lev.push({ file: "59900.dat", color: BROWN, m: orient("+z", "+x", "+y", [-54, -120, -40]), label: "1x1 cone", min: 1 });
  lev.push({ file: "87747.dat", color: BROWN, m: orient("-z", "+x", "-y", [-58, -120, -40]), label: "claw", min: 0 });

  // 33 the root arm: its front holes (R x = -60) around the top axle hole of the extension's bent
  //    liftarm, green 7Ls on either side of it; a black 4L axle from the left through them
  //    (1L out on the left). R's Z runs towards world -X (the lever handle points left).
  const tip = apply(E, [32, 0, 144]);
  const ps = (pose.psi * Math.PI) / 180;
  const f: V3 = [0, Math.sin(ps), Math.cos(ps)];
  const RY: V3 = [0, f[2], -f[1]];
  const R0: V3 = [tip[0] + 60 * f[0] - 20, tip[1] + 60 * f[1], tip[2] + 60 * f[2]];
  const RW = frame(f, RY, [-1, 0, 0], R0);
  const LV = mul(mul(tr([20, 0, 0]), rot("z", pose.phi)), tr([-20, 0, 0]));
  // the root arm is built in the book's order, then hung on the 4L axle (step 33)
  b.step(); // 24
  const rootIdx: number[] = [];
  const putR = (p: Local, M: Mat4, min = 0) => rootIdx.push(b.put(p.file, p.color, mul(M, p.m), min, p.label));
  // placed first with no connection requirement (the arm is only joined to the tree by the 4L axle)
  putR(r[0], RW); putR(r[1], RW, 1); putR(r[2], RW, 1);
  b.step(); // 25
  putR(r[3], RW, 1); putR(r[4], RW, 1);
  b.step(); // 26
  for (const p of lev.slice(0, 4)) putR(p, mul(RW, LV), p === lev[0] ? 0 : 1);
  b.step(); // 27
  putR(g2, RW, 2);
  b.step(); // 28
  putR(lev[4], mul(RW, LV), 1); putR(lev[5], mul(RW, LV), 1);
  b.step(); // 29
  putR(lev[6], mul(RW, LV), 1);
  b.attach("32474.dat", RED, { to: rootIdx[rootIdx.length - 2], accept: (m) => Math.abs(x(m) - apply(mul(RW, LV), [20, -80, 80])[0]) < 12, label: "lever handle ball" });
  b.step(); // 30
  putR(lev[8], mul(RW, LV), 2);
  b.step(); // 31
  putR(lev[9], mul(RW, LV), 1); putR(lev[10], mul(RW, LV), 1); putR(lev[11], mul(RW, LV), 1);
  b.step(); // 32
  putR(lev[12], mul(RW, LV), 1); putR(lev[13], mul(RW, LV), 0);
  b.step(); // 33
  const ub = extIdx[0];
  const axle4 = pinAt("3705.dat", BLACK, [ub], tip, [tip[0] - 10, tip[1], tip[2]], "4L axle (root arm hinge)");
  b.step(); // 34 handle: red 3L joiner, red 2L axle, red ball on the left end of the 4L axle
  const j34 = b.attach("42195.dat", RED, { to: axle4, offsets: [-60, -50, -40, -30, -20, -10, 0], accept: (m) => Math.abs(x(m) - (tip[0] - 60)) < 2, label: "handle joiner" });
  const ax34 = b.attach("32062.dat", RED, { to: j34, accept: (m) => Math.abs(x(m) - (tip[0] - 90)) < 2, label: "handle axle" });
  b.attach("32474.dat", RED, { to: ax34, accept: (m) => x(m) < tip[0] - 95, label: "handle ball" });
  void tlAx; void tlPin; void pin6;
  return b;
}
