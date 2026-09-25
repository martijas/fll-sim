// SPIKE Prime "Driving Base 3" (FIRST LEGO League building guide), with its colour-sensor add-on,
// scripted part by part from the guide pages (build/p01-p36, colorsensor/p01-p05).
// LDraw frame: -Y up, -Z = front, +X = the robot's LEFT (the builder faces the robot's front).
// 1 stud = 20 LDU = 8 mm. The robot stands on y = 0.
//
// Layout (guide steps):
//  1-2   magenta 11x7 frame lying flat across the robot (y -40..-20), 6 black pins up from it.
//  3-4   two medium motors lying on the frame along Z, discs facing outwards (left motor = port C
//        at +X, right = port D at -X), 2 pins in each output disc, a yellow 3L axle in each output.
//  5     8 pins up from the motor tops.
//  6-9   hub (button at the rear) with two "legs" (grey 3L cross block with 4 pins + yellow 3L beam)
//        hanging under its front corners; 2 pins down from its rear end.
//  10-13 magenta 3x3 connector block + ball castor (medium azure) under the hub's rear end, a tan
//        axle pin + yellow cross block on the castor's side.
//  14    the hub goes onto the motor pins.
//  15-24 black 15L beams lying flat on the motors along each side (tan axle pins + cable clips).
//  25-26 wheels on the drive axles (and the pins in the discs), white teeth on the axle ends.
//  27-32 accessory motor (port E) across the front between the 15L beam ends: output disc down, red
//        2L axle + 12-tooth double-bevel gear on top, two grey cross blocks (each with 2 pins and a
//        yellow 3L beam) on its back face; one plugs into the hub's front face.
//  colour sensor: two pins into the right 15L beam's front end, sensor facing down (port B),
//        tan axle pin + blue cable clip. Wiring (last page): C/D drive, E accessory, B colour.
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, all, axisIs, near, orient } from "../src/build";

const BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, YELLOW = 14, WHITE = 15, TAN = 19, MAGENTA = 26, LBG = 71, DBG = 72, AZURE = 322;
const PIN = "2780.dat", AXPIN = "3749.dat", XBLOCK = "6536.dat", PINBLOCK = "48989.dat", L3 = "32523.dat", L15 = "32278.dat";
const FRAME = "39794.dat", BLOCK33 = "39793.dat", CASTOR = "39370.dat", BALL = "52629.dat", HUB = "45601c01.dat", MOTOR = "54696p01.dat";
const AX3 = "4519.dat", AX2N = "32062.dat", GEAR12 = "32270.dat", WHEEL = "39367p01.dat", TOOTH = "48267.dat", SENSOR = "37308.dat";

type V3 = [number, number, number];
type Dir = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const O = (x: Dir, y: Dir, z: Dir) => (p: V3): Mat4 => orient(x, y, z, p);
const PIN_Y = O("+y", "+x", "-z"); // pin (own X) vertical

// ---- heights (LDraw y, -Y up) ------------------------------------------------------------------
const AXLE_Y = -70; // drive axles: wheel radius 70 LDU (56 mm wheels)
const FRAME_Y = -30; // frame centre (y -40..-20), right under the motors
const MOTOR_TOP = -100; // motor tops = hub bottom = 15L beam bottoms
const ROTOR_Z = -40; // drive motor outputs (wheel axles)

export function build(lib: Library): Build {
  const b = new Build(lib, "Driving Base 3");

  // ---- 1-2: frame + 6 pins -----------------------------------------------------------------------
  b.put(FRAME, MAGENTA, orient("+z", "+y", "-x", [0, FRAME_Y, 0]), 0, "magenta 11x7 frame");
  b.step();
  // Each motor sits on three pins: the frame's front corner (no snap data there - placed with the
  // motor below), 2 holes in along the front edge, 2 holes back along the side.
  for (const s of [1, -1]) {
    b.put(PIN, BLACK, PIN_Y([s * 60, -40, -60]), 1, "pin (frame front edge)");
    b.put(PIN, BLACK, PIN_Y([s * 100, -40, -20]), 1, "pin (frame side)");
  }
  b.step();

  // ---- 3-4: drive motors ------------------------------------------------------------------------
  const motors: number[] = [];
  for (const s of [1, -1] as const) {
    // own Y (output) points outwards, own Z (length) backwards, own X vertical
    const m = s > 0 ? orient("+y", "-x", "+z", [80, AXLE_Y, ROTOR_Z]) : orient("-y", "+x", "+z", [-80, AXLE_Y, ROTOR_Z]);
    const mo = b.put(MOTOR, WHITE, m, 2, s > 0 ? "left drive motor (C)" : "right drive motor (D)");
    b.setPort(mo, s > 0 ? "C" : "D");
    motors.push(mo);
    b.put(PIN, BLACK, PIN_Y([s * 100, -40, -60]), 1, "pin (frame corner)");
  }
  b.step();
  // 2 pins in each output disc (above and below the axle), a yellow 3L axle in each output
  const axles: number[] = [];
  for (const [i, s] of [1, -1].entries()) {
    const mo = motors[i];
    for (const dy of [-20, 20])
      b.attach(PIN, BLACK, { to: mo, where: all(near([s * 121, AXLE_Y + dy, ROTOR_Z], 4), axisIs("x")), accept: (m) => m[3] * s > 131, label: "pin (motor disc)" });
    axles.push(b.attach(AX3, YELLOW, { to: mo, where: (sn) => sn.kind === "axle" && sn.pos[0] * s > 90, accept: (m) => m[3] * s > 135, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "yellow 3L axle (drive)" }));
  }
  b.step();

  // ---- 5: pins up from the motor tops -------------------------------------------------------------
  for (const s of [1, -1]) for (const x of [60, 100]) for (const z of [-60, 100]) b.put(PIN, BLACK, PIN_Y([s * x, MOTOR_TOP, z]), 1, "pin (motor top)");
  b.step();

  // ---- 6-14: hub with legs and castor, onto the motor pins -----------------------------------------
  // (built upside down in the guide; placed here directly) button at the rear, ports A/C/E on the left
  b.put(HUB, WHITE, orient("-x", "+y", "-z", [0, MOTOR_TOP, 0]), 4, "hub");
  b.step();
  // 7-8 legs: grey cross block, one pin up into the hub's front corner hole, the other (outside the
  // hub) up into the 15L beam later; a yellow 3L beam on the two lower pins
  for (const s of [1, -1]) {
    b.put(PINBLOCK, LBG, orient("+z", "+x", "+y", [s * 80, MOTOR_TOP + 10, -100]), 1, "leg: grey cross block with 4 pins");
    b.put(L3, YELLOW, orient("-z", "+y", "+x", [s * 80, MOTOR_TOP + 30, -100]), 1, "leg: yellow 3L beam");
  }
  b.step();
  // 9-10 two pins down from the hub's rear end, magenta 3x3 block on them, two pins down from it
  for (const x of [-20, 20]) b.put(PIN, BLACK, PIN_Y([x, MOTOR_TOP, 100]), 1, "pin (hub rear)");
  b.put(BLOCK33, MAGENTA, orient("+z", "+y", "-x", [0, MOTOR_TOP + 10, 100]), 2, "magenta 3x3 connector block");
  for (const z of [80, 120]) b.put(PIN, BLACK, PIN_Y([0, MOTOR_TOP + 20, z]), 1, "pin (under 3x3 block)");
  b.step();
  // 11 ball castor on the two pins
  // (its crossbar right under the 3x3 block, its legs rising on both sides of it; ball on y = 0). The
  // white 19 mm ball rides loose in the socket (as in 39370c01, which the app's part pack lacks).
  const castor = b.put(CASTOR, AZURE, orient("+x", "+y", "+z", [0, MOTOR_TOP + 30, 100]), 2, "ball castor");
  b.place(BALL, WHITE, orient("+x", "+y", "+z", [0, MOTOR_TOP + 76, 100]), "ball castor: white 19 mm ball [loose:castor ball]");
  b.step();
  // 12-13 tan axle pin in the castor's outer (rear) leg, yellow cross block on it
  const cpin = b.attach(AXPIN, TAN, { to: castor, where: all(near([0, MOTOR_TOP + 10, 140], 3), axisIs("x")), accept: (m) => m[3] > 10 && m[0] > 0.9, offsets: [-20, -10, 0, 10, 20], label: "tan axle pin (castor)" });
  b.attach(XBLOCK, YELLOW, { to: cpin, own: (sn) => sn.kind === "axle", accept: (m) => m[3] > 35, label: "yellow cross block (castor)" });
  b.step();

  // ---- 15-24: 15L beams flat on the motors, tan axle pins with cable clips ------------------------
  const beams: number[] = [];
  for (const s of [1, -1]) {
    // holes z = -180 .. 100: onto the motor pins at z = -60 / 100 and the leg's outer pin at z = -100
    const beam = b.put(L15, BLACK, orient("+x", "+y", "+z", [s * 100, MOTOR_TOP - 10, -40]), 3, s > 0 ? "left 15L beam" : "right 15L beam");
    beams.push(beam);
    const ap = b.attach(AXPIN, TAN, { to: beam, where: all(near([s * 100, MOTOR_TOP - 10, 40], 3), axisIs("y")), accept: (m) => m[7] < MOTOR_TOP - 25, offsets: [-20, -10, 0, 10, 20], label: "tan axle pin (cable clip)" });
    b.attach(XBLOCK, s > 0 ? AZURE : GREEN, { to: ap, own: (sn) => sn.kind === "axle", accept: (m) => m[7] < MOTOR_TOP - 30, label: "cable clip (cross block)" });
    b.step();
  }

  // ---- 25-26: wheels and white teeth ------------------------------------------------------------
  // (on the axle, against the output disc; the two disc pins go into holes of the wheel hub)
  for (const [i, s] of [1, -1].entries())
    b.attach(WHEEL, BLACK, { to: axles[i], where: (sn) => sn.kind === "axle", own: (sn) => sn.kind === "axle", accept: (m) => m[3] * s > 135 && m[3] * s < 160, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: s > 0 ? "left wheel" : "right wheel" });
  b.step();
  for (const [i, s] of [1, -1].entries())
    b.attach(TOOTH, WHITE, { to: axles[i], where: (sn) => sn.kind === "axle", own: (sn) => sn.kind === "axle", accept: (m) => m[3] * s > 160, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: "white tooth (axle end)" });
  b.step();

  // ---- 27-32: accessory motor (port E) across the front --------------------------------------------
  // Output disc down, white end on the left; it fills the gap between the two 15L beams (x -90..90)
  // with its front face flush with the beams' front ends, and sits one stud above the colour sensor.
  // Two grey cross blocks on its back face (at the white part's two hole columns, x = 80 / 40), each
  // with two pins in its side holes and a yellow 3L beam on them; the block at x = 40 plugs with its
  // back pins into the hub's front face (the one at x = 80 sits in front of the left hub leg).
  const EM_Y = MOTOR_TOP - 30, EM_Z = -160;
  const em = b.put(MOTOR, WHITE, orient("-z", "-y", "-x", [60, EM_Y, EM_Z]), 0, "accessory motor (E)");
  b.setPort(em, "E");
  const eax = b.attach(AX2N, RED, { to: em, where: (sn) => sn.kind === "axle" && sn.pos[1] < EM_Y - 5, accept: (m) => m[7] < EM_Y - 25, offsets: [-20, -10, 0, 10, 20], label: "red 2L notched axle (accessory output)" });
  b.attach(GEAR12, DBG, { to: eax, own: (sn) => sn.kind === "axle", accept: (m) => m[7] < EM_Y - 35, offsets: [-20, -10, 0, 10, 20], label: "12-tooth double bevel gear (accessory output)" });
  b.step();
  for (const x of [40, 80]) {
    b.put(PINBLOCK, LBG, orient("+x", "+y", "+z", [x, EM_Y, EM_Z + 40]), x === 40 ? 4 : 2, "accessory: grey cross block with 4 pins");
    for (const dy of [-20, 20]) b.put(PIN, BLACK, orient("+x", "+y", "+z", [x - 10, EM_Y + dy, EM_Z + 40]), 1, "accessory: pin (cross block side)");
    b.put(L3, YELLOW, orient("+z", "+x", "+y", [x - 20, EM_Y, EM_Z + 40]), 2, "accessory: yellow 3L beam");
  }
  b.step();

  // ---- colour sensor add-on (port B): under the right 15L beam's front end, facing down -------------
  for (const z of [-180, -140]) b.put(PIN, BLACK, PIN_Y([-100, MOTOR_TOP, z]), 1, "pin (colour sensor)");
  const sensor = b.put(SENSOR, BLACK, orient("+z", "-x", "-y", [-100, MOTOR_TOP + 10, -160]), 2, "colour sensor (B)");
  b.setPort(sensor, "B");
  const sp = b.attach(AXPIN, TAN, { to: beams[1], where: all(near([-100, MOTOR_TOP - 10, -80], 3), axisIs("y")), accept: (m) => m[7] < MOTOR_TOP - 25, offsets: [-20, -10, 0, 10, 20], label: "tan axle pin (sensor cable clip)" });
  b.attach(XBLOCK, BLUE, { to: sp, own: (sn) => sn.kind === "axle", accept: (m) => m[7] < MOTOR_TOP - 30, label: "sensor cable clip (cross block)" });
  b.step();

  // ---- mount point ---------------------------------------------------------------------------------
  // The accessory motor at the front, whose gear (on top, output axis vertical at x = 60, z = -160)
  // drives a tool. Origin = centre of the motor's front face on the output axis (x 60, y -130,
  // z -190: on the motor housing, so a tool held there rides on the chassis, not on the gear); axes
  // as the robot's (-Y up, -Z forward). No "front" mount: the modular dozer blade / lift arm hook
  // onto the Advanced Driving Base's magenta top frames (red pins), which this base doesn't have.
  b.mount("accessory", orient("+x", "+y", "+z", [60, EM_Y, EM_Z - 30]));
  return b;
}
