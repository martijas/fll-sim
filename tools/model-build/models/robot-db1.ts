// SPIKE Prime Driving Base 1, scripted from the official LEGO/FIRST building guide (34 steps).
// LDraw frame: -Y up, -Z = the robot's front, +X = the robot's LEFT (the LDraw -> robot mapping
// mirrors X). 1 stud = 20 LDU = 8 mm. The model is built with the drive axle at y = -40, z = 0 and
// shifted at the end so the wheels stand on y = 0.
//
// Layout (read off the guide's pictures and fixed by the hole grids of the real parts):
//  * a magenta 11x7 frame lies flat at the bottom (11 across, x = -110..110; z = -30..110);
//  * the two medium drive motors lie on it at x = +-80 (3 pins each into the frame), output discs
//    outwards, azure backs towards the rear; port C = +X (robot's left), D = -X (robot's right),
//    as on the guide's wiring page;
//  * the hub (button at the back) sits on the motors' inner pin column (x = +-60); the motors' outer
//    column (x = +-100) sticks out beside the hub and carries the two 15L beams;
//  * two cross blocks with 4 pins hang under the hub's front row with a 3L beam each;
//  * the ball caster hangs from a 3x3 connector block under the hub's back edge;
//  * the accessory motor (port E) lies between the drive motors, under the hub, output down, a
//    12-tooth gear on top in front of the hub; its two side cross blocks plug into the two front
//    cross blocks.
//
// Approximation: with the LDraw hub's bottom-hole grid (x = +-20, +-60) and the cross blocks' fixed
// hole spacing, the accessory motor's side cross blocks (2 studs apart from the motor centre) can
// only reach the robot's front cross blocks if the accessory motor sits 1 stud off-centre (x = +20)
// with the right-hand (-X) front cross block moved in (x = -40, both pins in the hub). The guide's
// pictures don't show this offset clearly; it is the only fully pinned arrangement.
// Also: the ball caster (39370c01) ends 10 LDU (4 mm) below the tyres, so the robot rests on it
// tilted ~4 degrees nose-down; the cable clips (6536) go on by their pin hole (data gap); the drive
// motors' 6 frame pins match the guide, the 8 motor-top pins too (the hub takes the inner 4 at
// x = +-60 only where the LDraw hub has holes).
//
// Tools: the Advanced Driving Base's dozer blade and lift arm pin into that robot's magenta front
// frame and are driven by its horizontal gear; Driving Base 1 has neither, so there is no "front"
// mount. Mount "accessory": the accessory motor's output (centre of the 12-tooth gear).
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, dir, orient, pt } from "../src/build";

const BLACK = 0, GREEN = 2, RED = 4, YELLOW = 14, WHITE = 15, TAN = 19, MAGENTA = 26, LBG = 71, AZURE = 322;
const PIN = "61332.dat", AXPIN = "43093.dat", AX3 = "4519.dat", AX2N = "32062.dat";
const FRAME = "39794.dat", HUB = "45601c01.dat", MOTOR = "54696p01.dat", WHEEL = "39367p01.dat";
const L3 = "32523.dat", L15 = "32278.dat", XBLOCK4P = "48989.dat", BLOCK33 = "39793.dat", CASTER = "39370c01.dat";
const XBLOCK = "6536.dat", TOOTH = "48267.dat", GEAR12 = "32270.dat";

type V3 = [number, number, number];
type Dir = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const O = (x: Dir, y: Dir, z: Dir) => (p: V3): Mat4 => orient(x, y, z, p);

const FLAT = O("+x", "+y", "+z"); // identity: 15L beam along Z (holes vertical), caster, 3x3 block
const FRAME_FLAT = O("-z", "+y", "+x"); // 11x7 frame lying flat, 11 long along X
const PIN_UP = O("-y", "+x", "+z"); // pin / axle (own X) vertical
const PIN_X = O("+x", "+y", "+z"); // pin / axle along X
const HUB_R = O("-x", "+y", "-z"); // hub turned round: button at the back (+Z), ports A/C/E on +X
const MOTOR_OUT_PX = O("+y", "-x", "+z"); // drive motor, output (own -Y) towards +X, back towards +Z
const MOTOR_OUT_NX = O("-y", "+x", "+z"); // drive motor, output towards -X
const MOTOR_OUT_DOWN = O("-x", "-y", "+z"); // accessory motor, output disc down, back towards +Z
const XB_VERT = O("+z", "+x", "+y"); // 4-pin cross block: pins vertical, spaced along X, holes along Z
const XB_SIDE = O("+x", "+y", "+z"); // 4-pin cross block: pins along Z, spaced vertically, holes along X
const L3_ALONG_X = O("-z", "+y", "+x"); // 3L beam lying along X, holes vertical
const L3_UPRIGHT = O("-x", "+z", "+y"); // 3L beam upright, holes along Z

// ---- layout (LDU, before the final shift) -----------------------------------------------------
const MX = 80; // drive motors at x = +-80 (hole columns x = +-60 under the hub and +-100 outside it)
const MY = -40; // motor centre height: on the frame (top y = -10), under the hub (bottom y = -70)
const FZ = 40; // frame and hub centre z (the drive axle is at z = 0)
const HUB_Y = MY - 30; // hub bottom
const AX = 20, AZ = -100; // accessory motor position (x, z); its output axis
const FRONT_X = [80, -40]; // the two front cross blocks (x centre), +X side first

/**
 * A 1x2 cross block (axle/pin) used as a cable clip on the axle half of a tan axle pin. LDraw data
 * gap: the block's axle hole has no usable snap, so it goes on by its pin hole instead (turned 90
 * degrees from the real part) and is labelled [locked] so it doesn't spin.
 */
function clip(b: Build, axpin: number, color: number, label: string) {
  const t = b.parts[axpin].m;
  const c = pt(t, [-10, 0, 0]); // centre of the axle pin's axle half (own -X)
  const d = dir(t, [1, 0, 0]);
  const hole = (m: Mat4) => pt(m, [0, 20, 0]); // the block's pin hole (own Z axis)
  return b.attach(XBLOCK, color, {
    to: axpin,
    accept: (m) => Math.hypot(...[0, 1, 2].map((k) => hole(m)[k] - c[k])) < 3 && Math.abs(dir(m, [0, 0, 1]).reduce((a, v, k) => a + v * d[k], 0)) > 0.99,
    prefer: (m) => -pt(m, [0, 0, 0])[1], // the block above / beside rather than below
    offsets: [-20, -10, 0, 10, 20],
    label: `${label} [locked]`,
  });
}

export function build(lib: Library) {
  const b = new Build(lib, "Driving Base 1");
  // 1 the 11x7 frame
  const frame = b.put(FRAME, MAGENTA, FRAME_FLAT([0, 0, FZ]), 0, "11x7 frame");
  b.step();
  // 2 six pins up: per side the corner hole, the next hole of the front beam and the next hole of
  // the short side
  for (const s of [1, -1]) for (const [x, z] of [[100, -20], [60, -20], [100, 20]]) b.put(PIN, BLACK, PIN_UP([s * x, -10, z]), 1, "pin (frame -> motor)");
  b.step();
  // 3 the two drive motors on the pins, output outwards; two pins in each output disc
  const mC = b.put(MOTOR, WHITE, MOTOR_OUT_PX([MX, MY, 0]), 3, "drive motor (left, port C)");
  b.setPort(mC, "C");
  const mD = b.put(MOTOR, WHITE, MOTOR_OUT_NX([-MX, MY, 0]), 3, "drive motor (right, port D)");
  b.setPort(mD, "D");
  for (const s of [1, -1]) for (const y of [MY - 20, MY + 20]) b.put(PIN, BLACK, PIN_X([s * 130, y, 0]), 1, "pin (output disc -> wheel)");
  b.step();
  // 4 a 3L axle in each motor output
  const ax: Record<number, number> = {};
  for (const s of [1, -1]) ax[s] = b.put(AX3, YELLOW, PIN_X([s * 150, MY, 0]), 1, "3L axle (drive)");
  b.step();
  // 5 eight pins up on the motor tops: front and back hole of both columns
  for (const s of [1, -1]) for (const [x, z] of [[60, -20], [100, -20], [60, 140], [100, 140]]) b.put(PIN, BLACK, PIN_UP([s * x, HUB_Y, z]), 1, "pin (motor top)");
  b.step();
  // 6 the hub on the inner pin column (x = +-60), button at the back
  const hub = b.put(HUB, WHITE, HUB_R([0, HUB_Y, FZ]), 4, "SPIKE Prime hub");
  b.step();
  // 7-8 under the hub's front row (z = -60): a 4-pin cross block (pins up into the hub, its
  // perpendicular holes facing forward) with a yellow 3L beam on its lower pins
  const fronts: number[] = [];
  for (const x of FRONT_X) {
    fronts.push(b.put(XBLOCK4P, LBG, XB_VERT([x, HUB_Y + 10, -60]), 1, "cross block with 4 pins (front)"));
    b.put(L3, YELLOW, L3_ALONG_X([x, HUB_Y + 30, -60]), 2, "3L beam (front)");
  }
  b.step();
  // 9 two pins down in the hub's back row (x = +-20)
  for (const x of [20, -20]) b.put(PIN, BLACK, PIN_UP([x, HUB_Y, FZ + 100]), 1, "pin (hub -> 3x3 block)");
  b.step();
  // 10 the magenta 3x3 connector block on them, two more pins down in its other cross holes
  const blk = b.put(BLOCK33, MAGENTA, FLAT([0, HUB_Y + 10, FZ + 100]), 2, "3x3 connector block");
  for (const z of [80, 120]) b.put(PIN, BLACK, PIN_UP([0, HUB_Y + 20, FZ + z]), 1, "pin (3x3 block -> caster)");
  b.step();
  // 11 the ball caster on those pins (ball down)
  const caster = b.put(CASTER, AZURE, FLAT([0, HUB_Y + 40, FZ + 100]), 2, "ball caster");
  b.step();
  // 12-13 a tan axle pin in the caster's side and the yellow cable clip on it
  const cpin = b.attach(AXPIN, TAN, { to: caster, where: (s) => Math.abs(s.pos[1] - (HUB_Y + 40)) < 2 && s.pos[2] < FZ + 100, accept: (m) => pt(m, [0, 0, 0])[0] > 10, label: "tan axle pin (caster)" });
  clip(b, cpin, YELLOW, "yellow cross block (cable clip)");
  b.step();
  // 14 (the hub assembly goes on the motors: done above)
  // 15-16 / 20-21 the 15L beams on the outer pin column, a tan axle pin in the 4th hole from the back
  // 17 / 22 a cable clip (azure on the left, green on the right) on that axle pin
  for (const s of [1, -1]) {
    const beam = b.put(L15, BLACK, FLAT([s * 100, HUB_Y - 10, 0]), 2, "15L beam");
    const tp = b.attach(AXPIN, TAN, { to: beam, where: (w) => Math.abs(w.pos[2] - 80) < 2, accept: (m) => m[7] < HUB_Y - 20, label: "tan axle pin (beam)" });
    clip(b, tp, s > 0 ? AZURE : GREEN, "cross block (cable clip)");
  }
  b.step();
  // 25 the wheels on the axles and the disc pins; 26 a white tooth on each axle end
  for (const s of [1, -1]) {
    b.attach(WHEEL, BLACK, { to: [ax[s]], own: (o) => o.kind === "axle", accept: (m) => Math.abs(m[3] - s * 147) < 12, prefer: (m) => -Math.abs(m[3] - s * 147), offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "wheel", minConnections: 3 });
  }
  b.step();
  for (const s of [1, -1]) b.attach(TOOTH, WHITE, { to: ax[s], accept: (m) => m[3] * s > 165, prefer: (m) => -pt(m, [0, 0, -40])[1], offsets: [-20, -10, 0, 10, 20], maxOverlap: 4, label: "white tooth (axle end)" });
  b.step();
  // 27-32 the accessory motor (port E): output disc down, a red 2L axle up through it with the
  // 12-tooth gear; a side assembly on each side (4-pin cross block pinned to the motor's side, a 3L
  // beam upright on its front pins); its back pins go into the front cross blocks' holes
  const mE = b.put(MOTOR, WHITE, MOTOR_OUT_DOWN([AX, MY, AZ]), 0, "accessory motor (port E)");
  b.setPort(mE, "E");
  const ax2 = b.put(AX2N, RED, PIN_UP([AX, MY - 30, AZ]), 1, "2L axle (accessory output)");
  const gear = b.attach(GEAR12, BLACK, { to: ax2, accept: (g) => g[7] < MY - 35, label: "12-tooth double bevel gear" });
  for (const sx of [1, -1]) {
    const x = AX + sx * 40, z = AZ + 20;
    for (const y of [MY - 20, MY + 20]) b.put(PIN, BLACK, PIN_X([AX + sx * 30, y, z]), 1, "pin (side cross block -> accessory motor)");
    b.put(XBLOCK4P, LBG, XB_SIDE([x, MY, z]), 3, "cross block with 4 pins (accessory)");
    b.put(L3, YELLOW, L3_UPRIGHT([x, MY, z - 20]), 2, "3L beam (accessory)");
  }
  b.step();
  // Mount: the accessory motor's output (the gear), for attachments driven by it. Origin on the
  // output axis at the gear's centre; axes as the robot's (X left, Y down, Z back).
  const g = b.parts[gear].m;
  b.mount("accessory", O("+x", "+y", "+z")([g[3], g[7], g[11]]));

  // stand the robot on its wheels (tyre bottom at y = 0)
  const dy = -(MY + 70);
  for (const p of b.parts) p.m[7] += dy;
  void frame; void hub; void blk; void fronts;
  return b;
}
