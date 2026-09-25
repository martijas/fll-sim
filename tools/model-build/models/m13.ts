// Mission 13 Keystone Species (bag 19 + frames/15L beams from bag 0), scripted from the official
// building instructions (text-based book text-bi-11 + picture book book-11). Bag 20 (the
// team-built keystone species) is not part of this model.
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right. The model stands on y = 0.
//
// Two separate builds (the book says "you do not need to combine the two parts"):
//  * The dock (step 37): a flat dark grey 11x15 frame with an upright black 5x7 frame pinned to
//    the back half of each short side and a black 3L liftarm inside each short side at the front.
//  * The restoration platform (steps 1-36): a rectangle of two upright 7x11 end frames (left/right)
//    joined by two side walls (9L + two 3x5 L-liftarms, 15L beam on top). An insert (5x11 panel,
//    two 3x3 blocks, flat 7x11 frame) slides up and down inside it, guided by thin 5L liftarms
//    running between the pairs of green 7L liftarms on the end frames; two handles (axle-pin +
//    3L axle joiner) stick out front and back through the gap between the 9L and the 15L beams.
//    Four brown 7L "tree trunks" are hinged on the insert frame; with the insert down (handles
//    resting on the 9L beams) the trunks are held upright between the stops on the 15L beams
//    (ball pins / 1L liftarm / pin joiner); lifting the insert lets them fall outwards.
//    On top of each end frame a vertical shaft (5L axle with stop, bush, 2L liftarm crank, axle
//    joiner, 3L axle with stop) carries a lime cross block + grey 1x2 pin brick + yellow tile that
//    turns about the shaft.
// The platform is placed on the dock the way it fits: the end frames rest on the dock's short
// sides, between the two upright 5x7 frames, the green 1L liftarms on the blue 3L pins at the
// bottom of the end frames hooking into the upright frames' windows.
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, at, near, pt, rot } from "../src/build";

const BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, BGREEN = 10, YELLOW = 14, TAN = 19, LIME = 27, BROWN = 70, LBG = 71, DBG = 72, NOUGAT = 84, DKGREEN = 288;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", PINFREE = "3673.dat", PIN3FREE = "39888.dat", PIN34 = "32002.dat";
const STUDPIN = "89678.dat", BALLPIN = "66906.dat", BARBALL = "80477.dat", JOINER = "62462.dat";
const F7x11 = "39794.dat", F11x15 = "39790.dat", F5x7 = "64179.dat";
const L1 = "18654.dat", L3 = "32523.dat", L7 = "32524.dat", L9 = "40490.dat", L15 = "32278.dat", LBENT = "32526.dat", THIN5 = "32017.dat";

type Dir = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
type V = [number, number, number];
const DV: Record<Dir, V> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Rotation from where two of the part's local axes point (the third follows, right-handed). */
function R(o: { x?: Dir; y?: Dir; z?: Dir }): Mat4 {
  let a = o.x && DV[o.x], b = o.y && DV[o.y], c = o.z && DV[o.z];
  if (!c) c = cross(a!, b!);
  else if (!a) a = cross(b!, c);
  else if (!b) b = cross(c, a);
  return new Float64Array([a![0], b![0], c[0], 0, a![1], b![1], c[1], 0, a![2], b![2], c[2], 0]);
}
/** Mirror a direction in x when s = -1 (left/right symmetric partners). */
const sx = (s: number, d: Dir): Dir => (s > 0 || d[1] !== "x" ? d : ((d[0] === "+" ? "-" : "+") + "x") as Dir);

export function build(lib: Library) {
  const b = new Build(lib, "M13 Keystone Species");
  const put = (file: string, color: number, p: V, r: Mat4, min: number, label?: string) => b.put(file, color, at(p[0], p[1], p[2], r), min, label);
  /** Pin-like part whose local +X points along `d`, origin at `p`. */
  const pin = (file: string, color: number, p: V, d: Dir, min = 1, label?: string) => put(file, color, p, R({ x: d, y: d[1] === "y" ? "+x" : "+y" }), min, label);

  // Heights (LDU, -y up): the dock is 1L thick on the floor; the platform stands on it.
  const yDock = -10; // dock frame centre
  const yEnd = -90; // end frames' centre (bottom beam holes at y = -30, top beam holes at y = -150)
  const yHandle = -70; // insert down: the handle joiners rest on the 9L beams (top at y = -60)

  // ---- Steps 1-9 / 11-19: the two end frames (s = +1 right = "first end", s = -1 left) ------------
  // Each end frame stands upright running front-back, its original front face (with the green 7L
  // liftarms) turned inwards; the lever assembly ends up on the front half of both ends.
  const buildEnd = (s: number) => {
    const X = (x: number) => x * s;
    const fr = b.place(F7x11, BLACK, at(X(140), yEnd, 0, R({ x: "-y", y: "+x" })), s > 0 ? "right end frame (first end)" : "left end frame (second end)");
    // 1.2/1.3 black pin 1L out towards the inside; blue 3L pin 1L out on both sides (stop ring inside)
    pin(PIN, BLACK, [X(130), -30, -20], "+x", 1, "pin (bottom beam, inside)");
    pin(PIN3, BLUE, [X(140), -30, 20], sx(s, "+x"), 1, "blue 3L pin (bottom beam)");
    b.step();
    // 2 pin into the bottom corner (front corner) from the outside
    pin(PIN, BLACK, [X(150), -30, -100], "+x", 1, "pin (bottom corner, outside)");
    b.step();
    // 3 green 1L liftarms on the two pins on the outside
    put(L1, BGREEN, [X(160), -30, 20], R({ y: "+x", z: "+y" }), 1, "green 1L (dock latch)");
    put(L1, BGREEN, [X(160), -30, -100], R({ y: "+x", z: "+y" }), 1, "green 1L");
    b.step();
    // 4 lever: grey 1x2 brick with pins (+ yellow tile) outside, lime cross block on its pins sitting
    //   on the top beam, brown 5L axle with stop through the cross block's axle hole and the top beam
    put("53540.dat", LBG, [X(160), -180, -10], R({ y: "+y", z: sx(s, "+x") }), 0, "lever 1x2 brick with pins");
    put("3069b.dat", YELLOW, [X(160), -188, -10], rot("y", 90), 1, "lever yellow tile");
    put("42003.dat", LIME, [X(140), -170, -20], R({ x: "-y", y: "+z" }), 1, "lever cross block");
    put("15462.dat", BROWN, [X(140), -130, -40], R({ x: "-y", y: "+z" }), 2, "5L axle with stop (lever shaft)");
    b.step();
    // 5 red bush under the top beam
    put("3713.dat", RED, [X(140), -130, -40], R({ x: "+x", z: "+y" }), 1, "bush");
    b.step();
    // 6 green 2L liftarm crank (pin hole towards the middle) and brown 2L axle joiner
    put("60483.dat", GREEN, [X(140), -110, -40], R({ x: "+x", y: "+y" }), 1, "2L liftarm crank");
    put("59443.dat", BROWN, [X(140), -80, -40], R({ x: "+x", z: "+y" }), 1, "axle joiner");
    b.step();
    // 7 brown 3L axle with stop from below through the bottom beam into the joiner
    put("24316.dat", BROWN, [X(140), -50, -40], R({ x: "+y", y: "+z" }), 2, "3L axle with stop");
    b.step();
    // 8 two pins in the top beam, 1L out towards the inside (above the two bottom pins)
    for (const z of [-20, 20]) pin(PIN, BLACK, [X(130), -150, z], "+x", 1, "pin (top beam, inside)");
    b.step();
    // 9 green 7L liftarms upright on the top and bottom pins (the guides for the insert)
    for (const z of [-20, 20]) put(L7, BGREEN, [X(120), -90, z], R({ y: "+x", z: "+y" }), 2, "green 7L guide");
    b.step();
    return fr;
  };

  // ---- Steps 10 / 21: side walls (9L + two 3x5 L-liftarms), zs = +1 back ("first side"), -1 front
  const buildSide = (zs: number) => {
    const Z = (z: number) => z * zs;
    b.place(L9, DBG, at(0, -50, Z(100), R({ y: "+z", z: "+x" })), zs > 0 ? "back side 9L" : "front side 9L");
    for (const x of [-80, -60, 60, 80]) pin(PIN, BLACK, [x, -50, Z(110)], "+z", 1, "pin (9L to L-liftarm)");
    // L-liftarms (corner at local (0,0,80), 3L arm along local +x pointing up, 5L arm towards the middle)
    for (const s of [-1, 1]) put(LBENT, BLACK, [s * 60, -50, Z(120)], R({ x: "-y", z: s < 0 ? "-x" : "+x" }), 2, "3x5 L-liftarm");
    // pins sticking out towards the end frames' edge holes (corner and top of the 3L arm).
    // The top one goes into the end frame's centre edge hole, whose snap data is broken (see report).
    for (const s of [-1, 1]) for (const y of [-50, -90]) pin(PIN, BLACK, [s * 140, y, Z(110)], "+z", 1, "pin (L-liftarm to end frame)");
    b.step();
  };

  buildEnd(1); // steps 1-9
  buildSide(1); // step 10 (back wall, pinned to the first end)
  buildEnd(-1); // steps 11-19 (step 20: the second end pinned to the back wall)
  buildSide(-1); // step 21 (front wall)

  // ---- Step 22: green 15L beams on top of the side walls, with the tree stops on their inner face
  for (const zs of [-1, 1]) {
    const Z = (z: number) => z * zs;
    const beam = b.place(L15, GREEN, at(0, -130, Z(120), R({ y: "+z", z: "+x" })), zs < 0 ? "front 15L beam" : "back 15L beam");
    // the front beam's pins point back into the end frames; the back one is the same assembly
    // turned 180 degrees (so its stops are mirrored in x as well)
    for (const x of [-140, 140]) pin(PIN, BLACK, [x, -130, Z(110)], "+z", 2, "pin (15L to end frame)");
    for (const x of [-100, 100]) pin(PIN, BLACK, [x, -130, Z(110)], "+z", 1, "pin (15L stop)");
    const X = (x: number) => x * -zs; // front: as built; back: rotated 180
    put(JOINER, DKGREEN, [X(-100), -130, Z(90)], R({ x: "+z", y: "+y" }), 1, "pin joiner (tree stop)");
    put(L1, BGREEN, [X(100), -130, Z(100)], R({ y: "+z", z: "+x" }), 1, "green 1L (tree stop)");
    // ball pins (pin at local +x, ball at local -x): pushed in from the inner face, ball inside
    const inward = (m: Mat4, lx: number) => (pt(m, [lx, 0, 0])[2] - m[11]) * -zs > 5 && Math.abs(m[11] - Z(110)) < 1; // pin flush in the beam
    b.attach(BALLPIN, RED, { to: beam, where: near([X(60), -130, Z(120)], 2), accept: (m) => inward(m, -15), label: "red ball pin (tree stop)" });
    b.attach(BARBALL, DBG, { to: beam, where: near([X(-60), -130, Z(120)], 2), accept: (m) => inward(m, -38), label: "pin with towball on bar (tree stop)" });
  }
  b.step();

  // ---- Steps 23-33: the insert (hangs in the rectangle, handles resting on the 9L beams) --------
  const yPanel = yHandle + 20, yFrame = yHandle - 40;
  b.place("64782.dat", LBG, at(0, yPanel, 0), "insert 5x11 panel");
  // 23 tan 3/4 pins in the centre hole of each short side, the 1/2 pin sticking out sideways
  for (const s of [-1, 1]) pin(PIN34, TAN, [s * 110, yPanel, 0], s < 0 ? "-x" : "+x", 1, "tan 3/4 pin (panel)");
  b.step();
  // 24 pins front and back
  for (const zs of [-1, 1]) pin(PIN, BLACK, [0, yPanel, zs * 50], "+z", 1, "pin (panel)");
  b.step();
  // 25 3x3 blocks upright, cross of holes facing front/back; two pins up from each
  for (const zs of [-1, 1]) put("39793.dat", BLACK, [0, yHandle, zs * 60], R({ x: "+y", y: "+z" }), 1, "3x3 block");
  for (const zs of [-1, 1]) for (const x of [-20, 20]) pin(PIN, BLACK, [x, yHandle - 30, zs * 60], "+y", 1, "pin (block to frame)");
  b.step();
  // 26 black 7x11 frame lying flat on the four pins; tan 3/4 pins in its short sides' centre holes
  //    (those edge holes have broken snap data: placed exactly, held by the thin liftarms)
  put(F7x11, BLACK, [0, yFrame, 0], R({ x: "+z", y: "-y" }), 2, "insert 7x11 frame");
  for (const s of [-1, 1]) pin(PIN34, TAN, [s * 110, yFrame, 0], s < 0 ? "-x" : "+x", 0, "tan 3/4 pin (frame)");
  b.step();
  // 27 light grey thin 5L liftarms on the tan pins (2nd hole from the top / bottom hole)
  for (const s of [-1, 1]) put(THIN5, LBG, [s * 115, yFrame + 20, 0], R({ y: "+x", z: "+y" }), 1, "thin 5L guide");
  b.step();
  // 28 grey (frictionless) pins: front-left and back-right edge holes of the frame
  pin(PINFREE, LBG, [-80, yFrame, -70], "+z", 1, "grey pin (tree hinge)");
  pin(PINFREE, LBG, [80, yFrame, 70], "+z", 1, "grey pin (tree hinge)");
  b.step();
  // 29 tan 3L pins with a green 1L spacer: front-right and back-left (stop ring end in the frame)
  pin(PIN3FREE, TAN, [80, yFrame, -80], "-z", 1, "tan 3L pin (tree hinge)");
  put(L1, BGREEN, [80, yFrame, -80], R({ y: "+z", z: "+x" }), 1, "green 1L spacer");
  pin(PIN3FREE, TAN, [-80, yFrame, 80], "+z", 1, "tan 3L pin (tree hinge)");
  put(L1, BGREEN, [-80, yFrame, 80], R({ y: "+z", z: "+x" }), 1, "green 1L spacer");
  b.step();

  // 30-33 tree trunks: brown 7L liftarms hinged at their end hole, standing upright (insert down),
  //    two red 1/2 pins with stud in the top hole and the hole two below it. Right trunks (30) have
  //    the studs facing front, left trunks (31) facing back.
  const yTip = yFrame - 120;
  const trunks = [
    { x: 80, z: -100, studs: "-z" as Dir, right: true, label: "front-right" },
    { x: 80, z: 80, studs: "-z" as Dir, right: true, label: "back-right" },
    { x: -80, z: -80, studs: "+z" as Dir, right: false, label: "front-left" },
    { x: -80, z: 100, studs: "+z" as Dir, right: false, label: "back-left" },
  ];
  for (const t of trunks) {
    put(L7, BROWN, [t.x, yFrame - 60, t.z], R({ y: "+z", z: "+y" }), 1, `tree trunk (${t.label})`);
    const face = t.z + (t.studs === "-z" ? -10 : 10);
    for (const y of [yTip, yTip + 40]) pin(STUDPIN, RED, [t.x, y, face], t.studs, 1, "red 1/2 pin with stud");
  }
  b.step();
  // 32/33 tree crowns: brown 1x3 rounded plate + 3x5 cloud plate (one end even with the plate's) +
  //    two 1x1 round plates with leaves; the plate goes on the two stud pins, cloud towards the hinge.
  const crown = (right: boolean) => {
    const c = new Build(lib, right ? "tree crown (red)" : "tree crown (lime)");
    c.place("77850.dat", BROWN, at(0, 0, 0), "1x3 plate with rounded ends");
    // left crowns: right sides even (cloud extends to the left); right crowns: left sides even
    c.put("35470.dat", BGREEN, at(right ? 20 : -20, -8, 0), 3, "3x5 cloud plate");
    // leaves: rot about y so the three leaves point right (+x) / left / back
    const leaf = (x: number, color: number, deg: number) => c.put("32607.dat", color, at(x, -16, 0, rot("y", deg)), 1, "1x1 round plate with leaves");
    if (!right) {
      leaf(0, GREEN, -45); // right stud, leaves pointing right
      leaf(-20, LIME, 135); // to its left, leaves pointing left
    } else {
      leaf(0, GREEN, 135); // left stud, leaves pointing left
      leaf(20, RED, -135); // to its right, leaves pointing back
    }
    return c;
  };
  for (const t of trunks) {
    const studs = b.parts.map((p, i) => (p.file === STUDPIN && Math.abs(p.m[3] - t.x) < 1 && Math.abs(p.m[11] - (t.z + (t.studs === "-z" ? -10 : 10))) < 1 ? i : -1)).filter((i) => i >= 0);
    // plate anti-studs towards the trunk; the even end of the plate at the trunk's top
    const rotation = t.right ? R({ x: "+y", y: t.studs === "-z" ? "+z" : "-z" }) : R({ x: "-y", y: t.studs === "-z" ? "+z" : "-z" });
    b.attachGroup(crown(t.right), { to: studs, where: (s) => s.kind === "stud", rotation, minConnections: 2, maxOverlap: 6, label: `tree crown (${t.label})` });
  }
  b.step();
  // 34/35 (the insert is slid into the rectangle: the thin 5L liftarms run between the green 7L pairs)
  b.step();
  // 36 handles: blue axle-pin in the centre hole of each 3x3 block, nougat 3L axle joiner on it
  for (const zs of [-1, 1]) {
    pin(AXPIN, BLUE, [0, yHandle, zs * 70], zs < 0 ? "-z" : "+z", 1, "blue axle-pin (handle)");
    put("42195.dat", NOUGAT, [0, yHandle, zs * 100], R({ x: "+x", y: "+y" }), 1, "handle (3L axle joiner)");
  }
  b.step();

  // ---- Step 37: the dock -------------------------------------------------------------------------
  b.place(F11x15, DBG, at(0, yDock, 0, R({ x: "+z", y: "-y" })), "dock 11x15 frame");
  for (const s of [-1, 1]) {
    // 37.1/37.2 pins out of each short side: back edge hole and the centre edge hole (the centre
    // one's snap data is broken: placed exactly, held by the upright frame)
    pin(PIN, BLACK, [s * 150, yDock, 80], "+x", 1, "pin (dock side)");
    pin(PIN, BLACK, [s * 150, yDock, 0], "+x", 0, "pin (dock side, centre hole)");
  }
  // 37.3 black 3L liftarms inside the short sides at the front
  for (const s of [-1, 1]) {
    for (const z of [-80, -40]) pin(PIN, BLACK, [s * 130, yDock, z], "+x", 1, "pin (dock 3L)");
    put(L3, BLACK, [s * 120, yDock, -60], R({ y: "+x", z: "+z" }), 2, "dock 3L liftarm");
  }
  // 37.4 upright 5x7 frames on the pins (bottom corner holes)
  for (const s of [-1, 1]) put(F5x7, BLACK, [s * 160, yDock - 60, 40], R({ x: "+z", y: "+x" }), 1, s < 0 ? "dock left upright" : "dock right upright");
  b.step();
  return b;
}
