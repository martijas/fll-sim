// SPIKE Prime "Driving Base 2", scripted from the official LEGO Education building guide
// (34 steps). LDraw frame: -Y up, -Z = the robot's front, +X = the robot's left (the builder's
// right when the robot faces them).
//
// Layout (world, LDU; the robot stands on y = 0):
// - Two medium motors lie on their sides at x = ±80, outputs pointing outwards, output axis at
//   y = -70, z = -40 (the wheel axle). Left motor (+X) = port C, right motor = port D.
// - A magenta 11x7 frame underneath ties the motors together (6 pins); the hub (USB end to the
//   front) sits on the motors' inner top pins; two black 15L beams on their outer top pins run from
//   the motors' back ends (z = 100) forwards past the hub (front hole z = -180).
// - Two hangers (yellow 3L + grey 1x3 cross block with 4 pins) hang from the hub's front bottom
//   corners, their cross holes facing forwards. The accessory motor (port E) lies across the
//   front (white end to the robot's right, output axis vertical at x = -80, z = -160, pointing
//   down), a red 2L axle in the top end of its output carrying a 12T double bevel gear; two
//   brackets (cross block + 2 black pins + yellow 3L) on its back face plug into the hangers'
//   outer holes.
// - Ball caster under the back of the hub.
// Approximations (the guide's pictures leave some hole choices open): the accessory motor's
// position and brackets are reconstructed to be consistent with the hub, hangers and beams; the
// caster is pinned straight into the hub (see steps 9-11); cable clips on cables are left out
// except the two on the 15L beams' axle pins (cables themselves are not modelled).
import type { Library, Mat4 } from "@fll-sim/ldraw";
import { Build, at, orient, type SnapInfo } from "../src/build";

const BLACK = 0, YELLOW = 14, WHITE = 15, TAN = 19, LBG = 71, MAGENTA = 26, AZURE = 322, GREEN = 2, RED = 4;
const PIN = "2780.dat", AXPIN = "3749.dat";
const MOTOR = "54696p01.dat", MOTOR_COLOR = 15, HUB = "45601c01.dat";
const CASTER_Y = -70;
export const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
export type V3 = [number, number, number];
/** Snap whose axis line passes through p (within tol), at most `along` away along the axis. */
export const onAxis = (p: V3, tol = 1.5, along = 15) => (s: SnapInfo) => {
  const v = [p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]];
  const t = v[0] * s.axis[0] + v[1] * s.axis[1] + v[2] * s.axis[2];
  return Math.abs(t) <= along && Math.hypot(v[0] - t * s.axis[0], v[1] - t * s.axis[1], v[2] - t * s.axis[2]) <= tol;
};
export const near3 = (a: V3, b: V3, tol = 1.5) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;

/** Robot-side facts the tools rely on (world LDU). */
export const DB2 = {
  wheelAxle: { y: -70, z: -40 },
  /** Accessory motor E: output axis vertical at this x/z; top face y. */
  eMotor: { x: -80, y: -70, z: -160 },
};

/** Pin-like part into the hole on the axis through `holePos`, its centre at `centre`. */
export const pinner = (b: Build) => (file: string, color: number, to: number | number[], holePos: V3, centre: V3, label?: string, extra?: (m: Mat4) => boolean) =>
  b.attach(file, color, { to, where: onAxis(holePos), accept: (m) => near3([x(m), y(m), z(m)], centre) && (!extra || extra(m)), offsets: [-30, -20, -10, 0, 10, 20, 30], label });

/**
 * Mount points. Tools are scripted in the robot's frame, so each mount is the same matrix on the
 * robot and on its tool (identity rotation, origin at the hole the tool's first pin goes into).
 */
export const MOUNTS = {
  /** Arm: its two cross blocks' pins go into the hub's front holes x = ±40, y = -110. */
  arm: at(40, -110, -110),
  /** Force sensor: pinned into the accessory motor's front face holes x = -100 / -60, y = -50. */
  force: at(-100, -50, -190),
  /** Distance sensor: its 7L beam's pins go into the hub's top front corner holes x = ±60. */
  distance: at(60, -180, -100),
};

/**
 * A tool scripted on top of the robot (parts from index n0 on): a Build of just those parts, its
 * steps renumbered from 1, plus its mount point.
 */
export function toolFrom(b: Build, n0: number, name: string, mount: string, m: Mat4) {
  const t = new Build(b.lib, name);
  const s0 = b.parts[n0].step;
  t.parts = b.parts.slice(n0).map((p) => ({ ...p, step: p.step - s0 + 1 }));
  while (t.step() <= t.parts[t.parts.length - 1].step);
  t.mount(mount, m);
  return t;
}

/** The robot with its mount points. */
export function build(lib: Library) {
  const b = buildBase(lib);
  b.step();
  for (const [name, m] of Object.entries(MOUNTS)) b.mount(`db2-${name}`, m);
  return b;
}

/** The robot's parts without mount points (the tool scripts build on this). */
export function buildBase(lib: Library) {
  const b = new Build(lib, "Driving Base 2");
  const pinAt = pinner(b);

  // ---- steps 1-2: frame + 6 pins ----------------------------------------------------------
  const frame = b.place("39794.dat", MAGENTA, orient("-z", "+y", "+x", [0, -30, 0]), "11x7 frame");
  b.step();
  for (const s of [1, -1]) for (const [px, pz] of [[100, -60], [100, -20], [60, -60]]) pinAt(PIN, BLACK, frame, [s * px, -30, pz], [s * px, -40, pz], "pin");
  b.step();
  // ---- step 3: the two drive motors on the pins (outputs outwards) ------------------------
  const motorL = b.put(MOTOR, MOTOR_COLOR, orient("+y", "-x", "+z", [80, -70, -40]), 3, "left drive motor");
  b.setPort(motorL, "C");
  const motorR = b.put(MOTOR, MOTOR_COLOR, orient("-y", "+x", "+z", [-80, -70, -40]), 3, "right drive motor");
  b.setPort(motorR, "D");
  b.step();
  // ---- step 4: 3L axles in the outputs, 2L sticking out ------------------------------------
  const axles = [motorL, motorR].map((mo, i) => {
    const s = i ? -1 : 1;
    return pinAt("4519.dat", YELLOW, mo, [s * 120, -70, -40], [s * 140, -70, -40], "wheel axle");
  });
  b.step();
  // ---- step 5: 8 pins in the motors' top faces (inner ones for the hub, outer for the beams) --
  const topPins: number[] = [];
  for (const [i, mo] of [motorL, motorR].entries()) {
    const s = i ? -1 : 1;
    for (const px of [60, 100]) for (const pz of [-60, 100]) topPins.push(pinAt(PIN, BLACK, mo, [s * px, -91, pz], [s * px, -100, pz], "pin"));
  }
  // ---- steps 6-11: hub with hangers and the ball caster underneath -------------------------
  b.step();
  const hub = b.put(HUB, WHITE, orient("-x", "+y", "-z", [0, -100, 0]), 4, "hub");
  // steps 7-8: hangers (grey 1x3 cross block with 4 pins + yellow 3L beam) in the hub's front
  // bottom corner holes; their cross holes face forwards
  const hangers: number[] = [];
  for (const s of [1, -1]) {
    const blk = b.put("48989.dat", LBG, s > 0 ? orient("-z", "+x", "-y", [40, -90, -100]) : orient("+z", "-x", "-y", [-40, -90, -100]), 2, "hanger cross block");
    hangers.push(blk);
    b.attach("32523.dat", YELLOW, { to: blk, accept: (m) => near3([x(m), y(m), z(m)], [s * 40, -70, -100], 2), minConnections: 2, label: "hanger 3L beam" });
  }
  b.step();
  // steps 9-11: ball caster under the back of the hub. Approximation: the guide puts a magenta
  // 3x3 connector (+2 pins) between hub and caster; with it the ball would hang 8 mm below the
  // wheels, so the caster is pinned straight into the hub's back bottom holes and the connector
  // is left out. The 19 mm ball has no connection data in LDraw: it rests in the socket as a
  // loose body (the assembler reports it as 1 part group not connected).
  for (const s of [1, -1]) pinAt(PIN, BLACK, hub, [s * 20, -109, 100], [s * 20, -100, 100], "pin");
  b.put("39370.dat", AZURE, orient("-z", "+y", "+x", [0, CASTER_Y, 100]), 2, "ball caster");
  b.put("52629.dat", WHITE, at(0, CASTER_Y + 46, 100), 0, "caster ball");
  b.step();
  // ---- steps 15-24: 15L beams on the outer top pins, tan axle pins, cable clips ------------
  const beams: number[] = [];
  for (const s of [1, -1]) {
    const bm = b.put("32278.dat", BLACK, orient("+x", "+y", "+z", [s * 100, -110, -40]), 2, "15L beam");
    beams.push(bm);
    const ap = pinAt(AXPIN, TAN, bm, [s * 100, -110, 40], [s * 100, -120, 40], "axle pin (cable clip)", (m) => m[7] < -115);
    b.attach("49283.dat", s > 0 ? AZURE : GREEN, { to: ap, accept: (m) => y(m) < -130, label: "cable clip" });
  }
  b.step();
  // ---- steps 25-26: wheels + white teeth on the axle ends ----------------------------------
  for (const [i, ax] of axles.entries()) {
    const s = i ? -1 : 1;
    b.attach("39367p01.dat", 0, { to: ax, own: (q) => q.kind === "axle", accept: (m) => Math.abs(z(m) + 40) < 1 && Math.abs(y(m) + 70) < 1 && s * x(m) > 135, label: "wheel", offsets: [-30, -20, -10, 0, 10, 20, 30] });
    b.attach("48267.dat", WHITE, { to: ax, accept: (m) => s * x(m) > 150, label: "white tooth", offsets: [-30, -20, -10, 0, 10, 20, 30], maxOverlap: 6 });
  }
  b.step();
  // ---- steps 27-33: accessory motor E across the front, output down; a red 2L axle in the
  // top end of its output with a 12T double bevel gear on it. Two brackets (grey 1x3 cross
  // block + 2 black pins + yellow 3L) on its back face hold it to the hangers' outer holes.
  const E = DB2.eMotor;
  const motorE = b.put(MOTOR, MOTOR_COLOR, orient("+z", "-y", "+x", [E.x, E.y, E.z]), 0, "accessory motor");
  b.setPort(motorE, "E");
  const eAxle = pinAt("32062.dat", RED, motorE, [E.x, E.y - 10, E.z], [E.x, E.y - 30, E.z], "red 2L axle");
  b.attach("32270.dat", BLACK, { to: eAxle, accept: (m) => Math.abs(y(m) - (E.y - 40)) < 2, label: "12T double bevel gear", offsets: [-20, -10, 0, 10, 20] });
  b.step();
  for (const s of [1, -1]) {
    const bx = s * 60;
    const blk = b.put("48989.dat", LBG, orient("+x", "+y", "+z", [bx, E.y, E.z + 40]), 3, "bracket cross block");
    for (const dy of [-20, 20]) pinAt(PIN, BLACK, blk, [bx, E.y + dy, E.z + 40], [bx + s * 10, E.y + dy, E.z + 40], "pin", (m) => true);
    b.attach("32523.dat", YELLOW, { to: b.parts.length - 1, accept: (m) => near3([x(m), y(m), z(m)], [bx + s * 20, E.y, E.z + 40], 2), minConnections: 1, label: "bracket 3L beam" });
  }
  return b;
}
