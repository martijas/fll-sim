// Book 06: Mission 06 Leafcutter Frenzy + Mission 07 Humongous Fungus (bags 8, 9, 10), scripted from
// the official building instructions (text-based book + picture book).
// LDraw frame: -Y up, -Z = front (towards the builder, the side with the rack gear), +X = right.
//
// Build frame used below (before the final re-centering): main base 6x12 plate top at y = 0, its stud
// columns c = 0..11 at x = X(c), stud rows r = 0..5 at z = Z(r) (row 0 = front row of the plate).
// Rows -3..-1 are in front of the plate (grooved wall at row -3, rack channel at rows -2/-1).
//
// Part groups (one script, several bodies):
//  * Main base + top "nest" (arches) + cam shaft + gear train + small base + web-trap base (M07): one rigid
//    model with two revolute axles (cam shaft, gear-train axle).
//  * Rack-gear slider (rack assembly, steps 13-20) with the leaf-cutter ANT (steps 40-48) on its platform:
//    slides in the grooved wall (rail-in-groove, no snap connection) -> separate loose body.
//  * Four leaf fragments (steps 68-69): 7L liftarm + leaf, dropped loosely into the slots of the nest,
//    resting on the cams -> four loose bodies.
//  * Web trap arm (steps 78-90): 15L liftarm captive under the trap-base axle connector (loose/sliding),
//    with the web frame on a free-spinning pivot pin (revolute) at its end.
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { analyzePart } from "@fll-sim/assembly";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";
import { Build, all, axisIs, near, orient, pt, rot } from "../src/build";

const TAN = 19, WHITE = 15, GREEN = 2, BGREEN = 10, LBG = 71, RED = 4, BLACK = 0, BLUE = 1, BROWN = 70, YELLOW = 14;
const ORANGE = 25, LORANGE = 191, DORANGE = 484, GLOW = 329, TCLEAR = 47;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", PINSTUD = "65826.dat";

type V3 = [number, number, number];
const X = (c: number) => -110 + 20 * c;
const Z = (r: number) => -50 + 20 * r;
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Matrix from the world directions of the part's local X, Y, Z axes and a translation. */
const M = (xd: V3, yd: V3, zd: V3, t: V3 = [0, 0, 0]): Mat4 =>
  new Float64Array([xd[0], yd[0], zd[0], t[0], xd[1], yd[1], zd[1], t[1], xd[2], yd[2], zd[2], t[2]]);
/** Matrix from local Y and Z directions (X = Y x Z). */
const MYZ = (yd: V3, zd: V3, t: V3 = [0, 0, 0]) => M(cross(yd, zd), yd, zd, t);
const withT = (m: Mat4, t: V3): Mat4 => { const r = new Float64Array(m); r[3] = t[0]; r[7] = t[1]; r[11] = t[2]; return r; };
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
/** Direction from the pin half to the axle half of an axle/pin (43093/3749: axle on local +x). */
const axleDir = (m: Mat4): V3 => [m[0], m[4], m[8]];

export function build(lib: Library) {
  const b = new Build(lib, "M06-07 Leafcutter Frenzy + Humongous Fungus");
  const warn: string[] = [];

  /** Place a part with an explicit matrix and check it snaps onto something already placed. */
  const add = (bb: Build, file: string, color: number, m: Mat4, label?: string, check = true) => {
    if (check && bb.parts.length) {
      const c = findConnectionsForParts(lib, bb.parts.map((p) => ({ file: p.file, m: p.m })), { file, m });
      if (c.connections === 0) warn.push(`${bb.name}: ${label ?? file} (#${bb.parts.length}) has no connection`);
    }
    return bb.place(file, color, m, label);
  };
  /** Upright part rotated `deg` about Y; (x, z) = local origin, ybot = world y of the part's underside. */
  const BOTTOM: Record<string, number> = { "15070.dat": 8 };
  const up = (bb: Build, file: string, color: number, deg: number, px: number, ybot: number, pz: number, label?: string, check = true) => {
    const bot = BOTTOM[file] ?? analyzePart(lib, file).max[1];
    return add(bb, file, color, rot("y", deg, [px, ybot - bot, pz]), label, check);
  };
  /** Copy a sub-build into `bb` with transform T (optionally a different transform per part). */
  const addGroup = (bb: Build, sub: Build, T: Mat4 | ((i: number) => Mat4), check = false) =>
    sub.parts.map((p, i) => add(bb, p.file, p.color, mul(typeof T === "function" ? T(i) : T, p.m), p.label, check));

  // =====================================================================================
  // Mission 06: main base (bag 8, steps 1-12)
  // =====================================================================================
  // 1-3 white 6x12 plate; back wall of tan slopes (slope to the back, studs on row 4); green 1x1 slope
  up(b, "3028.dat", WHITE, 0, 0, 8, 0, "6x12 base plate");
  up(b, "3040b.dat", TAN, 180, X(0), 0, Z(4));
  b.step();
  up(b, "3037.dat", TAN, 180, X(2.5), 0, Z(4));
  up(b, "3040b.dat", TAN, 180, X(5), 0, Z(4));
  up(b, "3037.dat", TAN, 180, X(7.5), 0, Z(4));
  up(b, "3040b.dat", TAN, 180, X(10), 0, Z(4));
  b.step();
  up(b, "54200.dat", GREEN, 180, X(11), 0, Z(5), "green 1x1 slope, tall side front");
  b.step();
  // 4 tan 1x8 brick along the right column, overhanging 3 studs in front
  up(b, "3008.dat", TAN, 90, X(11), 0, Z(0.5), "right wall 1x8 brick");
  b.step();
  // 5 tan 3x3 plate at the front-left (1 column overhang) + 1x2 plate under its left column
  up(b, "11212.dat", TAN, 0, X(0), 0, Z(1), "3x3 plate");
  up(b, "3023b.dat", TAN, 90, X(-1), 8, Z(1.5));
  b.step();
  // 6 grey 2x3 plate under the front overhang of the 1x8 brick
  up(b, "3021.dat", LBG, 90, X(10.5), 8, Z(-2), "2x3 under right wall");
  b.step();
  // 7 white grooved 1x4 brick (groove at the back) + A-shaped plate (back arm under the brick, point right)
  up(b, "2653.dat", WHITE, 180, X(8.5), 0, Z(-3), "grooved wall brick R");
  const A_ORIGIN: V3 = [X(9) + 10, 0, Z(-3) - 10]; // B-arm studs of 15706 land on cols 6..9 of row -3
  add(b, "15706.dat", LBG, rot("y", -45, [A_ORIGIN[0], 0, A_ORIGIN[2]]), "lower A-shaped plate", false);
  b.step();
  // 8 extension of the grooved wall: 2 grooved bricks on three 2x2 tiles-with-2-studs (studs to the front)
  for (const c of [4.5, 2.5, 0.5]) up(b, "33909.dat", WHITE, 180, X(c), 8, Z(-2.5), "2x2 tile with 2 studs", false);
  up(b, "2653.dat", WHITE, 180, X(4.5), 0, Z(-3), "grooved wall brick M");
  up(b, "2653.dat", WHITE, 180, X(0.5), 0, Z(-3), "grooved wall brick L");
  b.step();
  // 9 plates on the walls
  up(b, "78329.dat", BGREEN, 0, X(1), -24, Z(-3));
  up(b, "3460.dat", TAN, 0, X(7.5), -24, Z(-3));
  up(b, "60479.dat", TAN, 0, X(5.5), -24, Z(4));
  up(b, "3023b.dat", TAN, 90, X(11), -24, Z(0.5));
  b.step();

  // 10 small base (built separately, then set onto the angled arm of the A-plate, rotated 45 degrees).
  //    Local frame: 4x4 plate top at y = 0, columns -1..4 at x = sx(c), rows 0..3 at z = sz(r).
  const sb = new Build(lib, "small base");
  const sx = (c: number) => -30 + 20 * c, sz = (r: number) => -30 + 20 * r;
  up(sb, "3031.dat", WHITE, 0, 0, 8, 0, "small base 4x4");
  const sbPinA = up(sb, "30592.dat", LBG, 90, sx(1.5), 0, 0, "2x2 brick with pin");
  const sbPinB = up(sb, "30592.dat", LBG, 90, sx(3.5), 0, 0, "2x2 brick with pin");
  up(sb, "3020.dat", WHITE, 90, sx(-0.5), 0, 0);
  up(sb, "3710.dat", WHITE, 90, sx(4), 8, 0);
  up(sb, "3004.dat", LBG, 90, sx(-1), -8, 0);
  up(sb, "3009.dat", WHITE, 0, sx(1.5), -8, sz(0));
  up(sb, "3009.dat", WHITE, 0, sx(1.5), -8, sz(3));
  // small base local (col -1, row 3) sits on the A-arm stud nearest the A's point; rows run along the arm.
  const T_SB = rot("y", 45, [A_ORIGIN[0] + 14.142, 0, A_ORIGIN[2] - 70.711]);
  const sbIdx = addGroup(b, sb, T_SB);
  {
    const c = findConnectionsForParts(lib, b.parts.slice(0, sbIdx[0]).map((p) => ({ file: p.file, m: p.m })), { file: "3020.dat", m: b.parts[sbIdx[3]].m });
    if (!c.connections) warn.push("small base does not sit on the A-plate");
  }
  b.step();
  // 11 top of the back and right walls
  up(b, "15070.dat", BGREEN, 90, X(0), -32, Z(4), "tooth plate, tooth to the left");
  up(b, "3023b.dat", TAN, 0, X(3.5), -32, Z(4));
  up(b, "3023b.dat", TAN, 0, X(7.5), -32, Z(4));
  up(b, "3460.dat", TAN, 90, X(11), -32, Z(0.5));
  b.step();
  // 12 green round tile, upper A-plate (bridges main base and small base), plates on the front wall
  up(b, "98138.dat", GREEN, 0, X(10), -32, Z(-3));
  add(b, "15706.dat", LBG, rot("y", -45, [A_ORIGIN[0], -40, A_ORIGIN[2]]), "upper A-shaped plate");
  up(b, "78329.dat", BGREEN, 0, X(3), -32, Z(-3));
  up(b, "3023b.dat", TAN, 0, X(-0.5), -32, Z(-3));
  b.step();

  // =====================================================================================
  // Rack gear slider (steps 13-21) — slides left/right with its door rails in the wall's groove.
  // Built in place at its rightmost position (the corner tile stops against the 3x3 plate).
  // =====================================================================================
  const rackStart = b.parts.length;
  const xr = -190; // x of rack column 0
  const RX = (k: number) => xr + 20 * k;
  up(b, "91988.dat", WHITE, 0, RX(6.5), 0, Z(-1.5), "rack 2x14 plate", false);
  up(b, "32028.dat", WHITE, 0, RX(12.5), -8, Z(-2), "rail plate 1x2");
  up(b, "4510.dat", WHITE, 0, RX(7.5), -8, Z(-2), "rail plate 1x8");
  up(b, "32028.dat", WHITE, 0, RX(2.5), -8, Z(-2), "rail plate 1x2");
  b.step();
  up(b, "3039.dat", RED, 180, RX(0.5), -8, Z(-1), "platform slope (slope back)");
  up(b, "3623.dat", LBG, 0, RX(1), 0, Z(0));
  // 16 red 2x2 corner tile: cells (col 2,row -1), (col 3,row -1), (col 2,row 0)
  up(b, "14719.dat", RED, 0, RX(2), -8, Z(-1), "corner tile");
  up(b, "3039.dat", RED, 0, RX(0.5), -8, Z(-2), "platform slope (slope front)");
  up(b, "3023b.dat", TAN, 0, RX(0.5), 0, Z(-3));
  b.step();
  for (const k of [11.5, 7.5, 3.5]) up(b, "3743.dat", WHITE, 0, RX(k), -16, Z(-2), "rack 1x4");
  b.step();
  // 19-20 feet under the rack (flipped assembly: studs up into the underside here)
  up(b, "35480.dat", BLUE, 0, RX(12.5), 8, Z(-1), "blue foot");
  up(b, "2654a.dat", LBG, 0, RX(0.5), 8, Z(-0.5), "round foot");
  up(b, "2654a.dat", LBG, 0, RX(0.5), 8, Z(-2.5), "round foot");
  b.step();

  // =====================================================================================
  // 22-25 underside tile, small-base slopes, back wall brick, left cam bearing
  // =====================================================================================
  up(b, "41740.dat", TAN, 90, X(-1), 8, Z(-1.5), "1x4 with 2 studs under B2/3x3");
  b.step();
  add(b, "50950.dat", WHITE, mul(T_SB, rot("y", -90, [sx(0), -40 - 24, sz(0)])), "small base curved slope");
  add(b, "50950.dat", WHITE, mul(T_SB, rot("y", -90, [sx(0), -40 - 24, sz(3)])), "small base curved slope");
  b.step();
  up(b, "6112.dat", TAN, 0, X(5.5), -40, Z(4), "back wall 1x12 brick");
  b.step();
  up(b, "3002.dat", TAN, 0, X(0), -8, Z(1.5));
  up(b, "3004.dat", TAN, 0, X(0.5), -32, Z(2));
  up(b, "54200.dat", GREEN, 90, X(-1), -32, Z(2));
  up(b, "3023b.dat", TAN, 0, X(0.5), -32, Z(1));
  up(b, "6541.dat", TAN, 0, X(0), -40, Z(1), "1x1 brick with hole (gear-train bearing)");
  b.step();

  // =====================================================================================
  // 26-35 cam shaft along x at y = -54, z = Z(1)
  // =====================================================================================
  const AY = -54, AZ = Z(1), X0 = 20;
  const alongX = (px: number): Mat4 => M([0, 0, -1], [0, 1, 0], [1, 0, 0], [px, AY, AZ]); // local z -> +x
  add(b, "59443.dat", BLACK, alongX(X0), "2L axle connector", false);
  add(b, "3706.dat", RED, withT(rot("y", 0), [X0 - 60, AY, AZ]), "6L axle", false);
  add(b, "32073.dat", LBG, withT(rot("y", 0), [X0 + 50, AY, AZ]), "5L axle", false);
  for (const d of [-25, 25]) add(b, "32123b.dat", YELLOW, alongX(X0 + d), "half bush", false);
  const cam = (px: number, pointed: V3, label: string) => {
    const R = MYZ(pointed, [1, 0, 0]);
    const h = pt(R, [0, -20, 0]); // the wide-end hole goes on the axle
    return add(b, "6575a.dat", BLACK, withT(R, [px - h[0], AY - h[1], AZ - h[2]]), label, false);
  };
  const camA = cam(X0 - 35, [0, 0, 1], "cam (tip back)");
  const camB = cam(X0 + 35, [0, -1, 0], "cam (tip up)");
  for (const d of [-50, 50]) add(b, "3713.dat", BLACK, alongX(X0 + d), "bush", false);
  const camC = cam(X0 - 65, [0, 0, -1], "cam (tip front)");
  const camD = cam(X0 + 65, [0, 1, 0], "cam (tip down)");
  for (const d of [-75, 75]) add(b, "32123b.dat", YELLOW, alongX(X0 + d), "half bush", false);
  add(b, "32270.dat", BLACK, alongX(X0 - 90), "12T gear", false);
  up(b, "6541.dat", TAN, 90, X(1), -40, Z(1), "1x1 brick with hole (cam bearing L)");
  up(b, "32000.dat", WHITE, 90, X(11), -40, Z(0.5), "1x2 brick with holes (cam bearing R)");
  b.step();
  // 35 decorative caps (their LDraw snap data only has antistuds at the low end -> not snapped)
  up(b, "15068.dat", WHITE, 180, X(0.5), -64, Z(1.5), "2x2 curved slope over the cam bearing");
  up(b, "5907.dat", WHITE, 0, X(11), -64, Z(0), "1x2x1.667 curved (tall back)");
  up(b, "5907.dat", WHITE, 180, X(11), -64, Z(1), "1x2x1.667 curved (tall front)");
  b.step();

  // =====================================================================================
  // 36-39 front wall brick + gear train (axle along z at x = X(0), y = -54)
  // =====================================================================================
  up(b, "6111.dat", WHITE, 0, X(6.5), -40, Z(-3), "front wall 1x10 brick");
  b.step();
  up(b, "32000.dat", WHITE, 0, X(0.5), -40, Z(-3), "gear-train 1x2 brick with holes");
  const alongZ = (pz: number): Mat4 => new Float64Array([1, 0, 0, X(0), 0, 1, 0, AY, 0, 0, 1, pz]);
  add(b, "15462.dat", BROWN, rot("y", 90, [X(0), AY, -120 + 50]), "5L axle with stop", false);
  add(b, "18575.dat", TAN, alongZ(-90), "20T gear (meshes with the rack)", false);
  add(b, "3713.dat", BLACK, alongZ(-70), "bush", false);
  add(b, "46372.dat", LBG, alongZ(-50), "28T gear (meshes with the 12T)", false);
  b.step();
  up(b, "54200.dat", GREEN, 90, X(-1), -40, Z(-3));
  b.step();

  // =====================================================================================
  // 40-48 leaf-cutter ant, built in place on the rack platform (studs at RX(0..1), rows -2..-1, y -32)
  // =====================================================================================
  const ant = new Build(lib, "ant"); // local: ant centre at x = z = 0, bottom at y = 0
  up(ant, "2540.dat", BLACK, -90, 10, 0, 0, "handle plate (handle right)");
  up(ant, "88072.dat", BLACK, 180, 0, -8, 10, "plate with vertical bar");
  up(ant, "2540.dat", BLACK, 90, -10, 0, 0, "handle plate (handle left)");
  up(ant, "32828.dat", BLACK, 90, -10, -8, -10, "round plate with bar");
  up(ant, "32828.dat", BLACK, 90, 10, -8, -10, "round plate with bar");
  up(ant, "4032a.dat", BLACK, 0, 0, -16, 0, "2x2 round plate");
  // abdomen: round plate pushed down the upright bar (it stops 4 LDU above the arm of the bar plate)
  up(ant, "85861.dat", BROWN, 0, 0, -20, 30, "abdomen socket");
  up(ant, "15395.dat", RED, 0, 0, -28, 30, "dome bottom");
  up(ant, "4032a.dat", BLACK, 0, 0, -52, 30);
  up(ant, "3262.dat", RED, 0, 0, -60, 30, "dome top");
  up(ant, "85861.dat", BROWN, 0, -10, -24, -10, "eye");
  up(ant, "85861.dat", BROWN, 0, 10, -24, -10, "eye");
  // legs: clips on the handle bars (clip snaps are not in the library: placed at the bar, flagged unchecked)
  for (const side of [-1, 1] as const)
    for (const dz of [-8, 0, 8])
      add(ant, "3484.dat", BLACK, M(side > 0 ? [0, -1, 0] : [0, 1, 0], [side, 0, 0], [0, 0, 1], [side * 30, -6, dz]), "leg", false);
  // leaf held on the two forward bars (antistuds at the back, leaf to the left)
  add(ant, "3565.dat", GREEN, M([0, 1, 0], [0, 0, 1], [1, 0, 0], [-10, -14, -29]), "ant's leaf");
  // the ant stands on the 2x2 stud platform, head (leaf, eyes) facing +x? No: text 48 "leaf vertically on
  // the right" -> rotate the ant 90 degrees so its front (-z) points to +x... see picture: ant faces front.
  const T_ANT = rot("y", -90, [RX(0.5), -32, Z(-1.5)]);
  addGroup(b, ant, T_ANT);
  b.step();

  // =====================================================================================
  // Bag 9: top "nest" (steps 49-66): arches over the cam shaft, bottom at y = -64
  // =====================================================================================
  const NB = -64;
  up(b, "60479.dat", TAN, 0, X(5.5), NB, Z(4), "nest back 1x12 plate");
  up(b, "3040b.dat", TAN, 90, X(1), NB - 8, Z(4));
  b.step();
  up(b, "54200.dat", GREEN, 90, X(1), NB - 32, Z(4));
  b.step();
  const arch = (c: number) => up(b, "16577.dat", TAN, 90, X(c), NB - 8, Z(0.5), "1x8x2 arch");
  arch(2);
  b.step();
  up(b, "60479.dat", TAN, 0, X(5.5), NB, Z(-3), "nest front 1x12 plate");
  up(b, "3040b.dat", TAN, 90, X(1), NB - 8, Z(-3));
  up(b, "54200.dat", GREEN, 90, X(1), NB - 32, Z(-3));
  b.step();
  up(b, "98138.dat", GREEN, 0, X(3), NB - 8, Z(4));
  b.step();
  arch(4); up(b, "98138.dat", GREEN, 0, X(5), NB - 8, Z(4));
  b.step();
  arch(6); arch(7); up(b, "98138.dat", GREEN, 0, X(8), NB - 8, Z(4));
  b.step();
  arch(9); up(b, "98138.dat", GREEN, 0, X(10), NB - 8, Z(4));
  b.step();
  arch(11);
  b.step();
  const AT = NB - 8 - 48; // arch top
  up(b, "3832.dat", TAN, 0, X(6.5), AT, Z(2.5), "back 2x10 plate");
  b.step();
  for (const c of [2, 4, 9, 11]) up(b, "11477.dat", TAN, 180, X(c), AT - 8, Z(3.5), "1x2 curved slope");
  up(b, "15068.dat", WHITE, 180, X(6.5), AT - 8, Z(3.5), "2x2 curved slope");
  b.step();
  up(b, "3832.dat", TAN, 0, X(6.5), AT, Z(-0.5), "front 2x10 plate");
  up(b, "50950.dat", WHITE, 0, X(2), AT - 8, Z(-2), "1x3 curved slope");
  b.step();
  const SLOTS = [3, 5, 8, 10];
  for (const c of SLOTS) up(b, "3040b.dat", TAN, 180, X(c), AT - 8, Z(2), "slot slope (back)");
  b.step();
  for (const c of [2, 4, 9, 11, 6, 7]) up(b, "63864.dat", GREEN, 90, X(c), AT - 8, Z(1), "1x3 tile across the slot row");
  b.step();
  for (const c of SLOTS) up(b, "3040b.dat", TAN, 0, X(c), AT - 8, Z(0), "slot slope (front)");
  b.step();
  up(b, "15068.dat", WHITE, 0, X(6.5), AT - 8, Z(-1.5), "2x2 curved slope");
  for (const c of [4, 9, 11]) up(b, "50950.dat", WHITE, 0, X(c), AT - 8, Z(-2), "1x3 curved slope");
  b.step();
  up(b, "35480.dat", WHITE, 0, X(6.5), AT, Z(-3), "1x2 rounded plate");
  up(b, "98138.dat", GLOW, 0, X(7), AT - 8, Z(-3), "glow round tile");
  b.step();
  up(b, "59900.dat", WHITE, 0, X(6), AT - 8, Z(-3), "cone");
  up(b, "30367c.dat", TCLEAR, 0, X(6), AT - 8 - 24, Z(-3), "clear dome (glowing fungus)");
  b.step();

  // =====================================================================================
  // 68-69 leaves: 7L liftarm + 2 half pins with stud + leaf, dropped into the slots, resting on the cams
  // =====================================================================================
  const leafSub = (armColor: number, leafColor: number) => {
    const s = new Build(lib, "leaf");
    // local: liftarm vertical (holes facing x), centre at 0; top two holes at y = -60, -40
    const arm = add(s, "32524.dat", armColor, M([0, 0, 1], [1, 0, 0], [0, 1, 0]), "leaf 7L liftarm");
    const pins = [-60, -40].map((hy) =>
      // pin end in the hole from the -x face, collar on the face, stud tube outside (local +x -> -x)
      s.attach(PINSTUD, RED, { to: arm, where: near([0, hy, 0], 2), accept: (m) => m[0] < -0.9 && Math.abs(x(m) + 10) < 4, offsets: [-20, -16, -12, -10, -8, -6, -4, 0, 4, 8], label: "red 1L pin with stud" }),
    );
    s.attach("3565.dat", leafColor, { to: pins, minConnections: 2, accept: (m) => pt(m, [0, 0, -80])[1] < -80 && pt(m, [0, 2, 10])[0] < -12, label: "leaf" });
    return s;
  };
  const cams = [camC, camA, camB, camD]; // under slots 3, 5, 8, 10
  const leafColors: [number, number][] = [[GREEN, GREEN], [DORANGE, ORANGE], [LORANGE, YELLOW], [WHITE, WHITE]];
  const leaves: number[][] = [];
  for (const [i, c] of SLOTS.entries()) {
    const top = b.bounds(cams[i]).min[1];
    leaves.push(addGroup(b, leafSub(...leafColors[i]), withT(rot("y", 0), [X(c), top - 70, Z(1)])));
    b.step();
  }

  // =====================================================================================
  // Bag 10, Mission 07: web-trap base (steps 70-77), built in its own frame TF
  // (TF: -y up; "front" = -z = the side with the two white 3L liftarms; inner L corners at y = 0)
  // =====================================================================================
  const tb = new Build(lib, "web trap base");
  const Linner = (xl: number) => add(tb, "2477.dat", WHITE, orient("-z", "-x", "+y", [xl, -80, 0]), "inner 3x5 L", tb.parts.length > 0);
  const Louter = (xo: number) => add(tb, "2477.dat", WHITE, orient("+z", "+x", "+y", [xo, -80, -40]), "outer 3x5 L");
  const red3 = add(tb, "32523.dat", RED, orient("+z", "+x", "+y", [0, -60, 0]), "red 3L liftarm", false);
  for (const hy of [-80, -40]) tb.attach(PIN3, BLUE, { to: red3, where: near([0, hy, 0], 2), accept: (m) => Math.abs(x(m)) < 2, offsets: [0], label: "blue 3L pin" });
  tb.step();
  const li = Linner(-20), ri = Linner(20);
  tb.step();
  for (const [L, s] of [[li, -1], [ri, 1]] as const)
    for (const hz of [0, -40]) tb.attach(PIN, BLACK, { to: L, where: all(axisIs("x"), near([s * 20, 0, hz], 2)), accept: (m) => s * x(m) > 25, label: "foot pin" });
  tb.step();
  const frontSide = (xo: number, s: number) => {
    const L = Louter(xo);
    tb.attach(PIN, BLACK, { to: L, where: all(axisIs("z"), near([xo, -20, -40], 2)), accept: (m) => z(m) < -45, label: "black pin (front)" });
    tb.attach("65304.dat", LBG, { to: L, where: all(axisIs("z"), near([xo, -60, -40], 2)), accept: (m) => m[8] < -0.9 && Math.abs(z(m) + 40) < 3, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "pin with bush" });
    add(tb, "32523.dat", WHITE, orient("+x", "+z", "-y", [xo, -40, -60]), "white 3L liftarm");
    return L;
  };
  const lo = frontSide(-40, -1);
  tb.step();
  tb.attach(AXPIN, BLUE, { to: lo, where: all(axisIs("x"), near([-40, -40, -40], 2)), accept: (m) => axleDir(m)[0] > 0.9 && Math.abs(x(m) + 30) < 3, offsets: [-20, -10, 0, 10, 20], label: "axle pin" });
  const joiner = add(tb, "42195.dat", LBG, M([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, -40, -40]), "3L axle connector");
  tb.attach(AXPIN, BLUE, { to: joiner, where: near([0, -40, -40], 3), accept: (m) => Math.abs(x(m) - 30) < 3 && axleDir(m)[0] < -0.9, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "axle pin" });
  tb.step();
  frontSide(40, 1);
  tb.step();
  // 76 hollow frame + two 3L pins + 5L liftarm under the inner L feet
  add(tb, "64179.dat", LBG, orient("+x", "-z", "+y", [0, 100, -20]), "5x7 hollow frame", false);
  const g5 = add(tb, "32316.dat", LBG, orient("-z", "+y", "+x", [0, 20, -20]), "grey 5L liftarm");
  for (const xp of [-20, 20]) tb.attach(PIN3, BLUE, { to: g5, where: near([xp, 20, -20], 2), accept: (m) => Math.abs(y(m) - 20) < 2, offsets: [0], label: "blue 3L pin" });
  // 77 onto the small base pins (trap front faces the small base's back = towards +x+z in the model)
  const T_TB = mul(T_SB, rot("y", 180, [20, -194, -20]));
  const tbIdx = addGroup(b, tb, T_TB);
  {
    const frame = tbIdx[tb.parts.findIndex((p) => p.file === "64179.dat")];
    const c = findConnectionsForParts(lib, b.parts.filter((_, i) => i !== frame).map((p) => ({ file: p.file, m: p.m })), { file: "64179.dat", m: b.parts[frame].m });
    if (c.connections < 2) warn.push(`trap base frame: ${c.connections} connections to the small-base pins`);
  }
  b.step();

  // =====================================================================================
  // 78-90 web trap arm, built in its own frame AF (15L along x, holes along z, hole 1 at x = -140)
  // =====================================================================================
  const af = new Build(lib, "web trap arm");
  const beamX = (file: string, color: number, px: number, pz: number, label: string, py = 0) => add(af, file, color, orient("+y", "+z", "+x", [px, py, pz]), label, af.parts.length > 0);
  const l15 = beamX("32278.dat", WHITE, 0, 0, "15L liftarm");
  const webStart = af.parts.length;
  af.attach("39888.dat", TAN, { to: l15, where: near([-140, 0, 0], 2), accept: (m) => Math.abs(z(m)) < 2, offsets: [0], label: "tan 3L pin (pivot, no friction)" });
  const f5 = beamX("32316.dat", LBG, -180, -20, "front 5L");
  af.attach(PIN3, BLUE, { to: f5, where: near([-180, 0, -20], 2), accept: (m) => Math.abs(z(m)) < 2, offsets: [0], label: "blue 3L pin" });
  beamX("18654.dat", WHITE, -180, 0, "1L spacer");
  const b5 = beamX("32316.dat", LBG, -180, 20, "back 5L");
  af.step();
  // 82-84 bent liftarms (7L arm running left from the 5L, 3L arm pointing up-left)
  const bent = (bz: number, s: number) => {
    const bl = add(af, "32271.dat", WHITE, orient("-y", "+z", "-x", [-220, 0, bz]), "7x3 bent liftarm", false);
    af.attach("3749.dat", TAN, { to: [bl, s > 0 ? b5 : f5], where: near([-220, 0, bz], 12), minConnections: 2, label: "tan axle pin" });
    const e = af.snaps(bl, (q) => q.kind === "axle").sort((a, c) => a.pos[0] - c.pos[0])[0].pos; // 3L-arm end
    const n = af.snaps(bl, (q) => q.kind === "round").sort((a, c) => a.pos[1] - c.pos[1])[0].pos; // next hole
    af.attach(AXPIN, BLUE, { to: bl, where: near(e, 12), accept: (m) => s * axleDir(m)[2] < -0.9, label: "axle pin at arm end" });
    af.attach(PIN, BLACK, { to: bl, where: near(n, 3), accept: (m) => s * (z(m) - bz) > 5, label: "black pin" });
    return bl;
  };
  const bent1 = bent(40, 1);
  af.step();
  af.attach(AXPIN, BLUE, { to: bent1, where: near([-320, 0, 40], 3), accept: (m) => Math.abs(z(m) - 30) < 3 && axleDir(m)[2] < -0.9, offsets: [-20, -10, 0, 10, 20], label: "axle pin" });
  const j2 = add(af, "42195.dat", LBG, orient("+x", "+y", "+z", [-320, 0, 0]), "3L axle connector");
  af.attach(AXPIN, BLUE, { to: j2, where: near([-320, 0, 0], 3), accept: (m) => Math.abs(z(m) + 30) < 3 && axleDir(m)[2] > 0.9, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "axle pin" });
  af.step();
  bent(-40, -1);
  af.step();
  // 85 7L liftarms with red stud pins, clip bars and 1L liftarms, on the 3L arms' pins
  const web7 = (s: number) => {
    const w = new Build(lib, "web 7L");
    const l7 = add(w, "32524.dat", WHITE, orient("+y", "+z", "+x"), "web 7L liftarm"); // holes 1..7 at x = -60..60
    const out = (m: Mat4) => m[8] < -0.9 && Math.abs(z(m) + 10) < 4; // pin from the front face, stud towards -z
    w.attach(PINSTUD, RED, { to: l7, where: near([60, 0, 0], 2), accept: out, offsets: [-20, -16, -12, -10, -8, -6, -4, 0, 4, 8], label: "red pin with stud (rope)" });
    w.attach(PIN, BLACK, { to: l7, where: near([-60, 0, 0], 2), accept: (m) => z(m) < -5, label: "black pin" });
    const p3 = w.attach(PINSTUD, RED, { to: l7, where: near([-20, 0, 0], 2), accept: out, offsets: [-20, -16, -12, -10, -8, -6, -4, 0, 4, 8], label: "red pin with stud (clip)" });
    const st = w.snaps(p3, (q) => q.kind === "stud" && q.gender === "F")[0]?.pos ?? pt(w.parts[p3].m, [8, 0, 0]);
    // clip bar pushed into the pin's hollow stud, clip in front, fingers top/bottom (grips along x)
    add(w, "3484.dat", WHITE, M([0, 1, 0], [0, 0, 1], [1, 0, 0], [st[0], st[1], st[2] - 24]), "clip bar");
    w.attach("18654.dat", WHITE, { to: 2, accept: (m) => z(m) < -15, label: "1L liftarm" });
    return w;
  };
  // place: holes 5,6 (x = 20, 40) on the 3L arm pins, hole 1 pointing up-left
  const armHoles = (bl: number) => {
    const e = af.snaps(bl, (q) => q.kind === "axle").sort((a, c) => a.pos[0] - c.pos[0])[0].pos;
    const n = af.snaps(bl, (q) => q.kind === "round").sort((a, c) => a.pos[1] - c.pos[1])[0].pos;
    return { e, n };
  };
  const bent2 = af.parts.findIndex((p, i) => p.file === "32271.dat" && i !== bent1);
  for (const [bl, s] of [[bent2, -1], [bent1, 1]] as const) {
    const { e, n } = armHoles(bl);
    // local x from hole 5 (x=20) to hole 6 (x=40) runs from e (arm end) to n (next to it)
    const ux: V3 = [(n[0] - e[0]) / 20, (n[1] - e[1]) / 20, 0];
    const zz: V3 = [0, 0, s < 0 ? 1 : -1];
    const yy = cross(zz, ux);
    const R = M(ux, yy, zz);
    const p5 = pt(R, [20, 0, 0]);
    const T = withT(R, [e[0] - p5[0], e[1] - p5[1], e[2] + s * 20]);
    addGroup(af, web7(s), T);
  }
  af.step();
  // 86 rope: 21L string, one end stud on the front 7L's red stud pin (flexible part, approximated straight)
  {
    const rp = af.parts.findIndex((p) => p.label === "red pin with stud (rope)");
    const st = pt(af.parts[rp].m, [8, 0, 0]);
    // end stud plugged into the pin's hollow stud; the (rigid in LDraw) string runs out along the web
    add(af, "76065.dat", WHITE, M([0, -1, 0], [0, 0, -1], [1, 0, 0], [st[0], st[1] - 200, st[2]]), "braided string (approx.)");
  }
  const webEnd = af.parts.length;
  af.step();
  // 88-89 handle on the right end; 90 stop pin + 1L liftarm at hole 6
  af.attach(PIN3, BLUE, { to: l15, where: near([140, 0, 0], 2), accept: (m) => Math.abs(z(m)) < 2, offsets: [0], label: "blue 3L pin (handle)" });
  for (const s of [1, -1]) {
    const pj = add(af, "62462.dat", RED, orient("+z", "+y", "-x", [140, 0, s * 30]), "red pin connector");
    const ap = af.attach(AXPIN, BLUE, { to: pj, where: near([140, 0, s * 40], 12), accept: (m) => s * z(m) > 45 && s * axleDir(m)[2] > 0.9, offsets: [-10, 0, 10], label: "axle pin" });
    af.attach("32474.dat", RED, { to: ap, accept: (m) => s * z(m) > 52, offsets: [-30, -20, -10, 0, 10, 20, 30], label: "red ball" });
  }
  af.attach(PIN, BLACK, { to: l15, where: near([-40, 0, 0], 2), accept: (m) => z(m) < -5, label: "stop pin" });
  af.attach("18654.dat", WHITE, { to: af.parts.length - 1, accept: (m) => z(m) < -15, label: "stop 1L liftarm" });

  // AF -> TF: AF x -> +z, AF y -> +y (3L arms up, rope at the bottom), AF z -> -x; 15L centre at TF (0, 0, 72)
  // (hole 1 / pivot at z = -68: the web frame's 5L liftarms stop against the front of the trap base).
  const AF2TF = M([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, 0, 72]);
  // step 91: the web frame is swung up and over the trap base about the pivot (TF axis x through z = -60)
  const swing = (deg: number) => {
    const r = rot("x", deg);
    const p: V3 = [0, 0, -68];
    const q = pt(r, p);
    return withT(r, [p[0] - q[0], p[1] - q[1], p[2] - q[2]]);
  };
  const baseParts = tb.parts.map((p) => ({ file: p.file, m: p.m })); // trap base in its own (axis-aligned) frame
  let best = 0;
  for (let deg = 0; deg >= -180; deg -= 5) {
    let ov = 0;
    for (let i = webStart + 1; i < webEnd - 1; i++) {
      const m = mul(swing(deg), mul(AF2TF, af.parts[i].m));
      ov += findConnectionsForParts(lib, baseParts, { file: af.parts[i].file, m }).overlap;
    }
    if (ov > 60) break; // small overlaps near the pivot are pins brushing the axle connector
    best = deg;
  }
  const armIdx = addGroup(b, af, (i) => (i >= webStart && i < webEnd ? mul(T_TB, mul(swing(best), AF2TF)) : mul(T_TB, AF2TF)));
  b.step();

  // ---- ground the model (lowest point y = 0) and centre its footprint on the origin -------------
  const bb = b.bounds();
  const dx = -(bb.min[0] + bb.max[0]) / 2, dy = -bb.max[1], dz = -(bb.min[2] + bb.max[2]) / 2;
  for (const p of b.parts) { p.m = new Float64Array(p.m); p.m[3] += dx; p.m[7] += dy; p.m[11] += dz; }

  const nb = b.bounds();
  console.log(`web swing ${best} deg; footprint ${Math.round(nb.size[0] * 0.4)} x ${Math.round(nb.size[2] * 0.4)} mm, height ${Math.round(nb.size[1] * 0.4)} mm`);
  console.log(`groups: rack+ant from #${rackStart}, leaves ${leaves.map((l) => l[0]).join(",")}, trap base ${tbIdx[0]}.., arm ${armIdx[0]}..`);
  // Expected: decorative parts whose LDraw snap data cannot engage here (round tiles 98138, 1x1 round
  // plate with bar 32828, curved slopes 11477/15068/50950/5907 whose only antistuds are at the low end
  // hanging over a lower row) plus two parts checked before their pins were added.
  if (warn.length) console.log(`${warn.length} parts placed without a snap connection:`, warn.map((w) => w.replace(/^.*: /, "").replace(" has no connection", "")).join(", "));
  return b;
}
