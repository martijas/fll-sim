// Mission 05 Reaching Roots (bag 7), scripted from the official building instructions
// (text-based book + picture book). LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
import { IDENTITY, type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, all, at, axisIs, dir, dump, near, orient, pt, rot, type SnapInfo } from "../src/build";

const LBG = 71, DBG = 72, BLACK = 0, BLUE = 1, BROWN = 70, GREEN = 2, RED = 4, TAN = 19, WHITE = 15, NOUGAT = 84, PINK = 5, YELLOW = 14;
const PIN = "61332.dat", PIN3 = "42924.dat", AXPIN = "43093.dat", AXPIN3 = "65249.dat", AXPIN3F = "11214.dat", PIN3FREE = "39888.dat";
const round = (s: SnapInfo) => s.kind === "round";
const hole = (s: SnapInfo) => s.gender === "F";
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];

export function build(lib: Library) {
  const b = new Build(lib, "M05 Reaching Roots");

  // ---- Group 1 -------------------------------------------------------------------------
  // 1.1 Right 5x7 hollow frame, upright, running front-back.
  const f1 = b.place("64179.dat", LBG, orient("+z", "-x", "-y", [40, -70, 0]), "right hollow frame");
  // 1.2 pin into the middle hole on the top side of the bottom beam, sticking up
  const upPinR = b.attach(PIN, BLACK, { to: f1, where: all(axisIs("-y"), near([40, -10, 0], 5)), accept: (m) => y(m) < -12, label: "pin up (bottom beam)" });
  b.step();
  // 2 pins into the bottom two holes on the left face of the front beam, sticking out left
  const p2 = [-10, -50].map((yy) => b.attach(PIN, BLACK, { to: f1, where: all(axisIs("x"), near([40, yy, -40], 3)), accept: (m) => x(m) < 38 }));
  b.step();
  // 3 dark grey 3x3 block onto those two pins (its two side holes)
  if (process.env.M05_STOP === "3") {
    for (const i of p2) dump(b, i);
  }
  // (by its two side holes — the in-plane holes at x = ±21 in the part — not the face holes)
  const blk = b.attach("39793.dat", DBG, { to: p2, minConnections: 2, own: (s) => Math.abs(Math.abs(s.pos[0]) - 21) < 1, accept: (m) => x(m) < 30, label: "3x3 block" });
  b.step();
  // 4 two pins into the two holes on the left side of the block
  if (process.env.M05_STOP === "3") { dump(b, blk); return b; }
  const blkHoles = b.snaps(blk, (s) => hole(s) && axisIs("x")(s) && s.pos[0] < b.bounds(blk).min[0] + 12 && s.secs.startsWith("R 6 16"));
  if (blkHoles.length !== 2) throw new Error(`step 4: expected 2 left holes on the block, found ${blkHoles.length}`);
  const p4 = blkHoles.map((h) => b.attach(PIN, BLACK, { to: blk, where: near(h.pos, 1), accept: (m) => x(m) < h.pos[0] }));
  b.step();

  // 5 bent liftarm with an axle/pin in its front axle hole and a pin two holes up, then its two
  //   pins into the top two holes on the left face of the frame's front beam.
  const s5 = new Build(lib, "trunk side");
  const bent = s5.place("32271.dat", BROWN, IDENTITY);
  // (pins pushed in from the +y face: with the arm upright and the 3L arm pointing back, they face right)
  s5.attach(AXPIN, BLUE, { to: bent, where: (s) => s.kind === "axle" && Math.abs(s.pos[2]) < 12, accept: (m) => y(m) < -5 });
  s5.attach(PIN, BLACK, { to: bent, where: near([0, 0, 40], 3), accept: (m) => y(m) < -5 });
  const trunkR = b.attachGroup(s5, {
    to: f1,
    where: all(axisIs("x"), (s) => s.pos[1] < -80 && Math.abs(s.pos[2] + 40) < 3),
    minConnections: 2,
    // 7L arm rising upwards (corner hole high above the pins), 3L arm at the top pointing away
    // from the builder (+z)
    accept: (T) => {
      // flush against the frame's left face (liftarm centre 20 LDU left of the frame's centre plane at x = 40)
      const ok = Math.abs(x(T) - 20) < 4 && pt(T, [0, 0, 120])[1] < -170 && pt(T, [32, 0, 144])[2] > pt(T, [0, 0, 120])[2] + 10;
      if (process.env.M05_DBG) console.log("acc", x(T).toFixed(0), pt(T, [0, 0, 120]).map(Math.round), pt(T, [32, 0, 144]).map(Math.round), ok);
      return ok;
    },
    label: "right trunk bent liftarm",
  });
  b.step();
  // 6 3L pin (1L liftarm on it) into the 4th hole from the bottom of the bent liftarm, sticking left
  const bentR = trunkR[0];
  const holes = b.snaps(bentR, (s) => hole(s) && s.kind === "round").sort((a, c) => c.pos[1] - a.pos[1]);
  const h4 = holes[2]; // bottom axle hole + 3 round holes up = the 4th hole
  const p6 = b.attach(PIN3, BLUE, { to: bentR, where: near(h4.pos, 1), accept: (m) => x(m) < h4.pos[0] - 15, offsets: [-20, -10, 0, 10, 20], label: "3L pin" });
  b.attach("18654.dat", BROWN, { to: p6, accept: (m) => x(m) < h4.pos[0] - 15, label: "1L liftarm on 3L pin" });
  b.step();

  // 7 green 2L liftarm with a red 2L axle (1L out to the left) and an axle/pin in its pin hole,
  //   a 3L axle joiner on that, another axle/pin in the joiner; the red axle goes into the top
  //   axle hole of the bent liftarm so the joiner hangs below it.
  const s7 = new Build(lib, "root joint");
  const l2 = s7.place("60483.dat", GREEN, IDENTITY);
  s7.attach("32062.dat", RED, { to: l2, where: (s) => s.kind === "axle", accept: (m) => y(m) < -5, offsets: [-30, -20, -10, 0, 10, 20, 30] });
  const ap7 = s7.attach(AXPIN, BLUE, { to: l2, where: (s) => s.kind === "round" && hole(s), own: (s) => true, accept: (m) => y(m) < -8 });
  const j7 = s7.attach("42195.dat", NOUGAT, { to: ap7, accept: (m) => y(m) < -25 });
  s7.attach(AXPIN, BLUE, { to: j7, accept: (m) => y(m) < -40 });
  const topAxle = b.snaps(bentR, (s) => s.kind === "axle" && hole(s)).sort((a, c) => a.pos[1] - c.pos[1])[0];
  const g7 = b.attachGroup(s7, {
    to: bentR,
    where: near(topAxle.pos, 1),
    ownPart: [1], // the red axle goes into the bent liftarm
    accept: (T) => pt(T, [0, 0, 0])[0] < topAxle.pos[0] - 5, // assembly on the left of the liftarm
    prefer: (T) => pt(T, [0, 0, 20])[1] * 0.01, // joiner hanging below
    label: "root joint",
  });
  b.step();

  // 8 trunk extension: 5L liftarm, stud pin + flower plate, two pins, a second bent liftarm and
  //   a white 3L axle/pin; the axle/pin's pin goes into the corner hole of the main bent liftarm.
  const s8 = new Build(lib, "trunk extension");
  const l5 = s8.place("32316.dat", BROWN, IDENTITY);
  const l5holes = s8.snaps(l5, (s) => hole(s) && axisIs("y")(s)).sort((a, c) => a.pos[2] - c.pos[2]);
  s8.attach("65826.dat", RED, { to: l5, where: near(l5holes[l5holes.length - 1].pos, 1), accept: (m) => y(m) < -3, label: "pin with stud" });
  for (const h of [l5holes[0], l5holes[l5holes.length - 2]]) s8.attach(PIN, BLACK, { to: l5, where: near(h.pos, 1), accept: (m) => y(m) > 3 });
  const bent2 = s8.attach("32271.dat", BROWN, { to: [2, 3], minConnections: 2, accept: (m) => y(m) > 5, label: "upper bent liftarm" });
  // axle side through the bent liftarm (1L out on the far side), pin side towards the 5L's layer
  // (65249: pin at the part's -X end, axle towards +X)
  s8.attach(AXPIN3, WHITE, { to: bent2, where: (s) => s.kind === "axle", minConnections: 1, accept: (m) => pt(m, [-25, 0, 0])[1] < pt(m, [25, 0, 0])[1], label: "white 3L axle/pin" });
  const corner = b.snaps(bentR, (s) => hole(s) && s.kind === "round").sort((a, c) => a.pos[1] - c.pos[1])[0];
  if (process.env.M05_STOP === "8") {
    s8.parts.forEach((_, i) => dump(s8, i));
    dump(b, bentR);
    return b;
  }
  const wLocal = s8.parts[s8.parts.length - 1].m;
  b.attachGroup(s8, {
    to: bentR,
    where: near(corner.pos, 3),
    ownPart: [s8.parts.length - 1],
    // hinged on the white axle/pin: swing it back until it rests on the axle joiner
    angles: Array.from({ length: 24 }, (_, i) => i * 15),
    maxOverlap: 40, // it rests against the axle joiner
    minConnections: 1,
    // the white axle/pin's pin is in the corner hole and the rest of the extension is on the left
    accept: (T) => pt(T, [wLocal[3], wLocal[7], wLocal[11]])[0] < corner.pos[0] - 5 && pt(T, [0, 0, 0])[0] < corner.pos[0] - 5,
    prefer: (T) => pt(T, [0, 0, 40])[2] * 0.01 - pt(T, [0, 0, 40])[1] * 0.005,
    label: "trunk extension",
    debug: !!process.env.M05_DBG,
  });
  b.step();

  // 9 left bent liftarm (axle/pin at the front axle hole, pin two holes up) slides onto the white
  //   axle/pin sticking out on the left and pins into the left of the trunk.
  const whiteAx = b.parts.length - 1;
  if (process.env.M05_STOP === "9") {
    for (const i of [whiteAx, p6, whiteAx - 1, whiteAx - 4]) dump(b, i);
    return b;
  }
  // The left bent liftarm is the right one moved 40 LDU to the left (both bend backwards: the
  // instructions build the two sides the same way), its pins pushed in from the left face.
  const mR = b.parts[bentR].m;
  const mL = new Float64Array(mR);
  mL[3] -= 40;
  const bentLi = b.put("32271.dat", BROWN, mL, 1, "left trunk bent liftarm"); // held by the white axle/pin + 3L pin
  const pinsOf = (li: number) => {
    const ax = b.snaps(li, (s) => s.kind === "axle" && hole(s)).sort((a, c) => c.pos[1] - a.pos[1])[0]; // bottom axle hole
    const h3 = b.snaps(li, (s) => hole(s) && s.kind === "round").sort((a, c) => c.pos[1] - a.pos[1]).find((s) => Math.abs(s.pos[1] - (ax.pos[1] - 40)) < 3)!;
    return { ax, h3 };
  };
  const { ax: axL, h3: h3L } = pinsOf(bentLi);
  const lp1 = b.attach(AXPIN, BLUE, { to: bentLi, where: near(axL.pos, 1), own: () => true, accept: (m) => x(m) < axL.pos[0] - 5, label: "left trunk axle/pin" });
  const lp2 = b.attach(PIN, BLACK, { to: bentLi, where: near(h3L.pos, 1), accept: (m) => x(m) < h3L.pos[0] - 5, label: "left trunk pin" });
  const leftTrunk = [bentLi, lp1, lp2];
  const bentL = leftTrunk[0];
  b.step();

  // 10 red 2L axle in the top axle hole of the left bent liftarm, green 2L liftarm on it
  const topL = b.snaps(bentL, (s) => s.kind === "axle" && hole(s)).sort((a, c) => a.pos[1] - c.pos[1])[0];
  const ax10 = b.attach("32062.dat", RED, { to: bentL, where: near(topL.pos, 1), accept: (m) => x(m) < topL.pos[0] - 5 });
  b.attach("60483.dat", GREEN, { to: [ax10, bentL], accept: (m) => x(m) < topL.pos[0] - 5, prefer: (m) => -pt(m, [0, 0, 20])[1] * 0.01, label: "green 2L liftarm (left)" });
  b.step();

  // 11 left 5x7 frame onto the four pins on the left side; pin up in its bottom beam
  const leftPins = [...p4, leftTrunk[1], leftTrunk[2]];
  if (process.env.M05_STOP === "11") {
    for (const i of leftPins) dump(b, i);
    return b;
  }
  const minX = Math.min(...leftPins.map((i) => b.bounds(i).min[0]));
  // standing upright parallel to the right frame (its flat normal = the part's Y axis along world X)
  const f2 = b.attach("64179.dat", LBG, { to: leftPins, minConnections: 3, // 80 LDU from the right frame: the 5L stabiliser (step 12) spans both frames' bottom pins
    accept: (m) => Math.abs(x(m) - (x(b.parts[f1].m) - 80)) < 1 && Math.abs(m[1]) > 0.99 && Math.abs(m[6]) > 0.99 && Math.abs(z(m) - z(b.parts[f1].m)) < 5, label: "left hollow frame", debug: !!process.env.M05_DBG });
  // middle hole on the top side of the bottom beam (like step 1.2)
  const f2m = b.parts[f2].m;
  const f2bottom = b.snaps(f2, all(hole, axisIs("y"), near([x(f2m), -10, z(f2m)], 3)))[0];
  const upPinL = b.attach(PIN, BLACK, { to: f2, where: near(f2bottom.pos, 1), accept: (m) => y(m) < f2bottom.pos[1] - 2 });
  b.step();

  // 12 stabiliser: 3x3 block lying flat with pins at left/right, 5L liftarm on top, pressed onto the
  //    two pins sticking up from the bottom beams of the frames.
  if (process.env.M05_STOP === "12") {
    for (const i of [f1, f2, upPinR, upPinL, blk, bentR, bentL, ...p4]) console.log(i, b.parts[i].file, b.parts[i].label ?? "", b.bounds(i).min.map(Math.round), b.bounds(i).max.map(Math.round));
    return b;
  }
  // (the 3x3 block with its two pins sits inside, under the 5L; attach the 5L to the frame pins first)
  const stab = b.attach("32316.dat", BROWN, { to: [upPinR, upPinL], minConnections: 2, label: "5L stabiliser" });
  // two pins in the 5L's 2nd and 4th holes sticking down, the flat 3x3 block hung on them
  const sm = b.parts[stab].m;
  const stabPins = [-20, 20].map((dx) => {
    const h = b.snaps(stab, all(hole, axisIs("y"), near([x(sm) + dx, y(sm), z(sm)], 3)))[0];
    return b.attach(PIN, BLACK, { to: stab, where: near(h.pos, 1), accept: (m) => y(m) > y(sm) + 5 });
  });
  b.attach("39793.dat", DBG, { to: stabPins, minConnections: 2, own: (s) => axisIs("y")(s), accept: (m) => y(m) > y(sm) + 10, label: "3x3 block under the stabiliser" });
  b.step();

  // 13 red 1L pins with a stud, studs facing the front: the three front holes of the right frame,
  //    the bottom front hole of the left frame, the top and bottom of the front block's cross.
  const studPin = (part: number, p: [number, number, number]) =>
    b.attach("65826.dat", RED, { to: part, where: all(hole, axisIs("z"), near(p, 3)), accept: (m) => pt(m, [8, 0, 0])[2] < p[2] - 5, label: "stud pin" });
  const f1m = b.parts[f1].m, bm = b.parts[blk].m;
  for (const yy of [-30, -70, -110]) studPin(f1, [x(f1m), yy, -40]);
  studPin(f2, [x(f2m), -30, -40]);
  for (const yy of [-50, -10]) studPin(blk, [x(bm), yy, z(bm)]);
  b.step();

  // 14-22 front detail, built lying flat on a green 3x3 plate (studs up = -y, front = -z).
  //    Stud-grid parts are placed exactly (origin = top surface centre) and verified to connect.
  const d = new Build(lib, "front detail");
  d.place("11212.dat", GREEN, IDENTITY, "3x3 plate"); // top at y = 0, studs at x,z in {-20,0,20}
  // 14.2 2x3 slope (2 wide, 3 deep, slope at the front) on the right two columns
  d.put("3298.dat", BROWN, at(10, -24, 20), 4, "2x3 slope");
  // 15 2x3 brick, 3 wide, on the left column + 2 overhanging columns, back rows z = 0, 20
  d.put("3002.dat", BROWN, at(-40, -24, 10), 2, "2x3 brick");
  // 16 2x3 plate, 3 deep, under the overhang (x = -60, -40), front row sticking out at z = -20
  d.put("3021.dat", BROWN, at(-50, 0, 0, rot("y", 90)), 4, "2x3 plate under the overhang");
  // 17 1x2 brick on the back row of the 2x3 brick, left sides even
  d.put("3004.dat", BROWN, at(-50, -48, 20), 2, "1x2 brick");
  // 18 1x4x2 curved slope: its stud end on the right stud of the 1x2 brick, running to the right
  d.put("3573.dat", BROWN, at(-10, -88, 20, rot("y", 90)), 1, "curved slope");
  // 19 green 1x2 slopes, tall side at the back: on the 2x3 plate's front row and the brick's front row
  d.put("85984.dat", GREEN, at(-50, 0, -20), 2, "1x2 slope (front)");
  d.put("85984.dat", GREEN, at(-50, -24, 0), 2, "1x2 slope");
  b.step();
  // 23 the detail goes onto the six studs on the front of the tree, anti-studs at the back
  const pinsWithStuds = b.parts.map((p, i) => (p.file === "65826.dat" ? i : -1)).filter((i) => i >= 0);
  // rotated so the anti-studs face back (+z) and the arch (the plate's left column) is on the right
  b.attachGroup(d, { to: pinsWithStuds, where: (s) => s.gender === "M", rotation: orient("-x", "+z", "+y"), minConnections: 2, maxOverlap: 6, label: "front detail" });
  // (steps 20-22 — inverted arch, 1x3 plate, 1x2 curved slope, 1x1 slope — are decorative; not modelled)
  b.step();

  // 24-32 root arm, built flat: 7L liftarm with holes along its own Y ("front" of this build = -y,
  //       left = -z, right = +z).
  const r = new Build(lib, "root arm");
  const g1 = r.place("32524.dat", GREEN, IDENTITY, "green 7L (back)");
  const holeAt = (bb: Build, part: number, zz: number) => bb.snaps(part, all(hole, near([0, 0, zz], 2)))[0];
  // 24.2 blue 3L pins from the front into the rightmost and 4th-from-left holes, 2L sticking out front
  const bp = [60, 0].map((zz) => r.attach(PIN3, BLUE, { to: g1, where: near(holeAt(r, g1, zz).pos, 1), accept: (m) => y(m) < -12, label: "blue 3L pin" }));
  // 25 brown 1L liftarm on each, pushed back against the 7L
  for (const pi of bp) r.attach("18654.dat", BROWN, { to: pi, accept: (m) => y(m) < -15 && y(m) > -25, label: "1L liftarm" });
  // 26 5L lever: tan free 3L pin (leftmost hole, 1L out each side), dark grey 3L axle/pin
  //    (rightmost), black pin next to it; stood up with the axle/pin at the top and hinged on the
  //    tan pin in the 7L's 3rd hole from the right, resting on the right 3L pin.
  const s26 = new Build(lib, "lever");
  const l5b = s26.place("32316.dat", BROWN, IDENTITY);
  const l5h = (zz: number) => s26.snaps(l5b, all(hole, near([0, 0, zz], 2)))[0];
  const tan = s26.attach(PIN3FREE, TAN, { to: l5b, where: near(l5h(-40).pos, 1), accept: (m) => Math.abs(y(m)) < 3, label: "tan free 3L pin" });
  s26.attach(AXPIN3F, DBG, { to: l5b, where: near(l5h(40).pos, 1), accept: (m) => Math.abs(y(m)) < 3, label: "dark grey 3L axle/pin" });
  s26.attach(PIN, BLACK, { to: l5b, where: near(l5h(20).pos, 1), accept: (m) => y(m) < -5, label: "black pin" });
  const lever = r.attachGroup(s26, {
    to: g1,
    where: near(holeAt(r, g1, 20).pos, 1),
    ownPart: [tan],
    angles: Array.from({ length: 36 }, (_, i) => i * 10),
    accept: (T) => y(T) < -12 && y(T) > -28,
    maxOverlap: 10,
    prefer: (T) => -Math.abs(pt(T, [0, 0, 40])[2] - 60) * 0.05, // leaning over to rest on the right 3L pin
    label: "lever",
  });
  r.step();
  // 27 second green 7L onto the three pins on the front
  r.attach("32524.dat", GREEN, { to: [...bp, lever[tan]], minConnections: 2, accept: (m) => y(m) < -35, label: "green 7L (front)" });
  r.step();

  // 33 the root arm hangs on the tree's top hole: a black 4L axle through the front holes of both 7L
  //    liftarms and the top axle hole of the upper bent liftarm (the arm swings on it).
  const upperBent = b.parts.findIndex((p) => p.label === "upper bent liftarm");
  const topHole = b.snaps(upperBent, (s) => s.kind === "axle" && hole(s)).sort((a, c) => a.pos[1] - c.pos[1])[0];
  // the 7L beams sandwich the bent liftarm (one each side), the axle sticking out 1L on the left:
  // centre 10 LDU left of the bent liftarm's centre
  const ubx = (b.bounds(upperBent).min[0] + b.bounds(upperBent).max[0]) / 2;
  const axle4 = b.attach("3705.dat", BLACK, { to: upperBent, where: near(topHole.pos, 1), accept: (m) => Math.abs(x(m) - (ubx - 10)) < 3, label: "4L axle (root arm hinge)" });
  b.attachGroup(r, {
    to: axle4,
    ownPart: [0, r.parts.length - 1],
    minConnections: 2,
    angles: Array.from({ length: 24 }, (_, i) => i * 15),
    maxOverlap: 10,
    prefer: (T) => -pt(T, [0, 0, 0])[1] * 0.005, // hanging arm, lever at the top
    // sandwich: the two 7L beams on either side of the bent liftarm
    accept: (T) => {
      const front = r.parts[r.parts.length - 1].m;
      const xs = [pt(T, [0, 0, 0])[0], pt(T, [front[3], front[7], front[11]])[0]].sort((a, c) => a - c);
      return Math.abs(xs[0] - (ubx - 20)) < 3 && Math.abs(xs[1] - (ubx + 20)) < 3;
    },
    label: "root arm",
  });
  b.step();
  // 34 red 3L axle joiner, red 2L axle and red ball on the free end of the 4L axle (the handle)
  if (process.env.M05_STOP === "34") {
    for (const i of [upperBent, axle4, ...b.parts.map((p, i) => (p.label === "root arm" || p.label?.startsWith("green 7L") ? i : -1)).filter((i) => i >= 0).slice(0, 3)]) console.log(i, b.parts[i].file, b.parts[i].label, b.bounds(i).min.map(Math.round), b.bounds(i).max.map(Math.round));
    return b;
  }
  const j34 = b.attach("42195.dat", RED, { to: axle4, accept: (m) => x(m) < b.bounds(axle4).min[0] + 15, label: "handle joiner" });
  const ax34 = b.attach("32062.dat", RED, { to: j34, accept: (m) => x(m) < b.bounds(j34).min[0] + 5, label: "handle axle" });
  b.attach("32474.dat", RED, { to: ax34, accept: (m) => x(m) < b.bounds(ax34).min[0] + 5, label: "handle ball" });
  b.step();

  return b;
}
