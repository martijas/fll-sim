// SPIKE Prime Advanced Driving Base, scripted from the LEGO Education building guide
// (front part, rear part, left side, right side, assembly). LDraw frame: -Y up, -Z = front
// (the colour-sensor end), +X = the robot's left. Stands on y = 0 on its wheels.
//
// Ports (wiring page of the assembly guide): A = left large motor (wheel), E = right large motor
// (wheel), C = rear medium motor, D = front medium motor (each turns a 28-tooth gear under a tool
// mount), B and F = the two colour sensors looking down at the front.
// Mounts: "front" and "rear" = the centres of the two magenta 11x7 frames (tool mounts); a tool's
// 7x5 frame sits in the opening and the two red pins (pushed in) lock it; its 36-tooth gear
// meshes with the motor's 28-tooth gear (see adb-tool-base.ts).
import { mul, type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, dir, dump, orient, pt, type SnapInfo } from "../src/build";

const BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, YELLOW = 14, WHITE = 15, LBG = 71, DBG = 72, AZURE = 322, MAGENTA = 26;
const PIN = "61332.dat", PIN3 = "6558.dat", AXPIN = "43093.dat";
type V3 = [number, number, number];
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const near3 = (a: V3, b: V3, tol = 1.5) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;
/** Snap whose axis line passes through p (within tol), at most `along` away along the axis. */
const onAxis = (p: V3, tol = 1.5, along = 15) => (s: SnapInfo) => {
  const v = [p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]];
  const t = v[0] * s.axis[0] + v[1] * s.axis[1] + v[2] * s.axis[2];
  return Math.abs(t) <= along && Math.hypot(v[0] - t * s.axis[0], v[1] - t * s.axis[1], v[2] - t * s.axis[2]) <= tol;
};
const O = (x: string, y: string, z: string, t: V3) => orient(x as never, y as never, z as never, t);
const at3 = (t: V3) => orient("+x", "+y", "+z", t);

export function build(lib: Library) {
  const b = new Build(lib, "Advanced Driving Base");
  const DEBUG = process.env.ADB_DEBUG ?? "";
  /** Pin-like part into a hole, its centre at a given point. */
  const pinAt = (file: string, color: number, to: number | number[], holePos: V3, centre: V3, label?: string, extra?: (m: Mat4) => boolean) =>
    b.attach(file, color, { to, where: onAxis(holePos), accept: (m) => near3([x(m), y(m), z(m)], centre) && (!extra || extra(m)), offsets: [-30, -20, -10, 0, 10, 20, 30], label });
  const put = (file: string, color: number, m: Mat4, min = 1, label?: string) => b.put(file, color, m, min, label);

  // ============================== FRONT PART ==============================
  // The azure 15x11 frame lies flat (long side across the robot, x = ±150, z = ±110); its front
  // long side (z = -100) carries the 9L beam, motor D, the colour sensors and ball casters.
  // (Coordinates below are before the final shift that puts the wheels' lowest point on y = 0.)
  // 1-3: 9L beam on edge in front of the frame, two 1x3 pin blocks between, 2 pins out front,
  //      2 pins up in the blocks' outer end holes
  const beam9 = b.place("40490.dat", BLACK, O("+y", "+z", "+x", [0, 0, -140]), "front: 9L beam");
  for (const px of [-20, 20]) pinAt(PIN, BLACK, beam9, [px, 0, -140], [px, 0, -150], "front: pin");
  b.step();
  const blk = [60, -60].map((bx) => put("48989.dat", LBG, O("-y", "+x", "+z", [bx, 0, -120]), 2, "front: 1x3 pin block"));
  b.step();
  for (const [i, px] of [[0, 80], [1, -80]]) pinAt(PIN, BLACK, blk[i], [px, 0, -120], [px, -20, -120], "front: pin up");
  b.step();
  // 4 frame
  const frame = put("39790.dat", AZURE, O("-z", "+y", "+x", [0, 0, 0]), 2, "front: 15x11 frame");
  b.step();
  // 5 pins: two out of each short side (front half), one into the front side from inside
  for (const sx of [140, -140]) for (const pz of [-80, -40]) pinAt(PIN, BLACK, frame, [sx, 0, pz], [sx + Math.sign(sx) * 10, 0, pz], "front: side pin");
  pinAt(PIN, BLACK, frame, [40, 0, -100], [40, 0, -90], "front: inner pin");
  b.step();
  // 6-7 white 1x3 axle/pin/axle blocks with blue axle pins, on the front corners; 6 pins up
  for (const sx of [1, -1]) {
    const w = put("32184.dat", WHITE, O("+y", "+x", "-z", [sx * 120, -20, -100]), 0, "front: white cross block");
    pinAt(AXPIN, BLUE, [w, frame], [sx * 100, -20, -100], [sx * 100, -10, -100], "front: blue axle pin");
  }
  for (const sx of [140, -140]) for (const pz of [100, 60, -60]) pinAt(PIN, BLACK, frame, [sx, 0, pz], [sx, -20, pz], "front: pin up");
  b.step();
  // 8-10 motor D along the front, output up, on the two block pins
  const motorD = put("54696p01.dat", WHITE, O("+z", "+y", "-x", [60, -40, -120]), 2, "front: medium motor D");
  b.setPort(motorD, "D");
  if (DEBUG.includes("motorD")) dump(b, motorD);
  // 8-9 two blue axle pins in the motor's inner side holes, a blue and a green cable clip on them
  const clipOn = (to: number, holePos: V3, pinCentre: V3, clipColor: number, label: string) => {
    const ap = pinAt(AXPIN, BLUE, to, holePos, pinCentre, label + " axle pin");
    b.attach("49283.dat", clipColor, { to: ap, label: label + " cable clip" });
    return ap;
  };
  clipOn(motorD, [80, -20, -99], [80, -20, -89], BLUE, "front: motor D");
  clipOn(motorD, [-80, -20, -99], [-80, -20, -89], GREEN, "front: motor D");
  b.step();
  // 11-15 magenta 3x3 block with 4 pins flat on top of the motor, a grey H with a blue axle pin
  //       and red clip beside it, a second grey H on the front hanging from the 9L beam's pins
  //  (built in place: the grey H on the front first, then the block and the back H)
  const h2 = put("14720.dat", LBG, O("+x", "+z", "-y", [0, -40, -160]), 2, "front: grey H (front)");
  const mag = put("39793.dat", MAGENTA, O("+z", "+y", "-x", [0, -80, -120]), 0, "front: magenta 3x3 block");
  for (const px of [-20, 20]) for (const pz of [-150, -90]) pinAt(PIN, BLACK, [mag, h2], [px, -80, pz], [px, -80, pz], "front: pin");
  const h1 = put("14720.dat", LBG, O("+x", "+z", "-y", [0, -40, -80]), 2, "front: grey H (back)");
  if (DEBUG.includes("h1")) dump(b, h1);
  clipOn(h1, [0, -40, -80], [10, -40, -80], RED, "front: grey H");
  if (DEBUG.includes("mag")) { dump(b, mag); dump(b, h1); }
  b.step();
  // 16-29 two colour sensor + ball caster modules (sensor, 1x3 pin block, azure H with ball
  //        socket, 2 pins, azure L beam), mirror images, pinned to the short sides' pins
  const sensors: number[] = [];
  for (const s of [-1, 1]) {
    // 16 colour sensor, lens down, two blue long pins up in its back
    const cs = put("37308.dat", WHITE, O("+x", "+z", "-y", [s * 80, -20, -180]), 0, "front: colour sensor");
    sensors.push(cs);
    for (const px of [-20, 20]) pinAt(PIN3, BLUE, cs, [s * 80 + px, -21, -180], [s * 80 + px, -40, -180], "front: blue long pin");
    // 17 1x3 pin block on its outer side; 18-19 azure H with ball socket on the block
    put("48989.dat", LBG, O("+y", "+z", "+x", [s * 120, -20, -180]), 2, "front: 1x3 pin block");
    const hb = put("39370.dat", AZURE, O("+x", "+y", "+z", [s * 140, -20, -160]), 2, "front: azure H with ball socket");
    // (the 19 mm caster ball, 52629, is left out: it has no snap data, so the simulator cannot
    //  hold it in its socket and it would fall out; the socket rests on the floor instead)
    // 20 two pins out of the H's back column, 21 the 3x5 L beam's short arm on them
    for (const py of [-40, -20]) pinAt(PIN, BLACK, hb, [s * 140, py, -120], [s * 150, py, -120], "front: pin");
    // 22 the L beam's long arm onto the frame's side pins
    put("32526.dat", AZURE, O("-y", "-x", "-z", [s * 160, 0, -40]), 4, "front: azure 3x5 L beam");
    b.step();
  }
  // 30 black 15L beam flat across the front, on the sensors' blue pins
  const beam15 = put("32278.dat", BLACK, O("+z", "+y", "-x", [0, -40, -180]), 4, "front: 15L beam");
  if (DEBUG.includes("15")) dump(b, beam15);
  b.step();
  // 31-33 yellow 2x4 bricks with 3 axle holes on the front corners, each on two red axle pins:
  //       one straight into the 15L beam's end hole, one through a black 1L beam onto the blue pin
  for (const s of [-1, 1]) {
    const brick = put("39789.dat", YELLOW, at3([s * 120, -94, -180]), 0, "front: yellow 2x4 brick");
    if (DEBUG.includes("brick")) dump(b, brick);
    for (const px of [120, 140]) pinAt("11214.dat", RED, [brick, beam15], [s * px, -76, -180], [s * px, -54, -180], "front: red axle pin", (m) => pt(m, [20, 0, 0])[1] < -65);
    put("18654.dat", BLACK, at3([s * 100, -60, -180]), 1, "front: black 1L beam");
  }
  b.step();
  // 34-35 two magenta 3x3 blocks standing on the 15L beam (on the sensors' inner blue pins),
  //       two pins up in each
  for (const s of [-1, 1]) {
    const mb = put("39793.dat", MAGENTA, O("+y", "+z", "+x", [s * 40, -80, -180]), 1, "front: magenta 3x3 block (upright)");
    for (const px of [20, 60]) pinAt(PIN, BLACK, mb, [s * px, -101, -180], [s * px, -110, -180], "front: pin up");
  }
  b.step();
  // 37-38 grey 28-tooth gear on motor D, held by two pins in the rotor
  const gearD = put("46372.dat", LBG, O("+x", "-z", "+y", [60, -100, -120]), 0, "front: 28t gear on motor D");
  for (const pz of [-140, -100]) pinAt(PIN, BLACK, [gearD, motorD], [60, -81, pz], [60, -90, pz], "front: gear pin");
  b.step();
  sensors.forEach((cs) => b.setPort(cs, x(b.parts[cs].m) > 0 ? "B" : "F"));

  // ============================== SIDES (assembly 6-7) ==============================
  // Each side module is scripted in the large motor's own frame ("module frame": output up = -y,
  // body along +z, front face at z = -21) and mapped to the world: the motor lies on its side on
  // the azure frame's up-pins, output facing out (wheel outside), body running forward.
  // sx = +1 left (motor A, world +x), -1 right (motor E). Module x maps to world -y (left) / +y
  // (right), so module x offsets are multiplied by sx to keep the two sides mirror images.
  const sideModule = (sx: 1 | -1) => {
    const T = sx > 0 ? O("-y", "-x", "-z", [120, -61, 80]) : O("+y", "+x", "-z", [-120, -61, 80]);
    const side = sx > 0 ? "left" : "right";
    const W = (m: Mat4) => mul(T, m);
    const Wp = (p: V3): V3 => pt(T, [p[0] * sx, p[1], p[2]]);
    const M = (xx: string, yy: string, zz: string, p: V3) => W(O(xx, yy, zz, [p[0] * sx, p[1], p[2]]));
    const P = (file: string, color: number, m: Mat4, min: number, label: string) => put(file, color, m, min, `${side}: ${label}`);
    const pinM = (file: string, color: number, to: number | number[], hole: V3, centre: V3, label: string, extra?: (m: Mat4) => boolean) => pinAt(file, color, to, Wp(hole), Wp(centre), `${side}: ${label}`, extra);
    // 1 large motor on the azure frame's up-pins
    const motor = P("54675.dat", WHITE, T, 3, sx > 0 ? "large motor A" : "large motor E");
    b.setPort(motor, sx > 0 ? "A" : "E");
    if (DEBUG.includes("side")) dump(b, motor);
    // 1-2 two pins in the front face, the black 7x5 frame flat on them (long side across)
    for (const px of [-40, 40]) pinM(PIN, BLACK, motor, [px, 0, -21], [px, 0, -21], "front-face pin");
    const frame75 = P("64179.dat", BLACK, M("-z", "+y", "+x", [0, 0, -71]), 2, "7x5 frame");
    // 3 two black pins in the rotor, a grey axle pin up in the frame, two blue long pins out of
    //   the frame's far side (they go into the rear part)
    const rotorPins = [-20, 20].map((px) => pinM(PIN, BLACK, motor, [px, -41, 0], [px, -41, 0], "rotor pin"));
    pinM("3749.dat", LBG, frame75, [-60, 0, -31], [-60, -10, -31], "grey axle pin");
    for (const px of [0, 40]) pinM(PIN3, BLUE, frame75, [px, 0, -111], [px, 0, -131], "blue long pin");
    b.step();
    // 4 the wheel on the rotor pins
    const wheel = b.attach("49295p01.dat", AZURE, { to: rotorPins, accept: (m) => near3(pt(m, [0, 0, 0]), Wp([0, -61, 0])) && Math.abs(dir(m, [0, 0, 1])[0]) > 0.99, maxOverlap: 120, minConnections: 2, label: `${side}: wheel` });
    b.step();
    // 5-6 two blue long pins through the wheel hub, the magenta 3x3 block on them
    for (const pz of [-20, 20]) pinM(PIN3, BLUE, wheel, [0, -61, pz], [0, -61, pz], "blue long pin (wheel)");
    const magW = P("39793.dat", MAGENTA, M("+x", "+y", "+z", [0, -81, 0]), 2, "magenta 3x3 block (wheel)");
    b.step();
    // 7-12 the arch over the wheel: two 3x3.8x7 double-bent liftarms (their short arms down to the
    //      frame), a 1x3 pin block between them over the wheel, a 5L axle with two 1x2 cross blocks
    //      at the bottom and a yellow 3L axle in the top end
    const blk = P("48989.dat", LBG, M("+y", "+z", "+x", [0, -100, -20]), 0, "1x3 pin block (arch)");
    const arch = [-20, 20].map((px) => P("32009.dat", BLACK, M("+y", "+x", "-z", [px, -100, -120]), 1, "double bent liftarm (arch)"));
    const ax5 = b.attach("32073.dat", LBG, { to: arch, where: onAxis(Wp([0, -20, -120]), 1.5, 40), accept: (m) => near3(pt(m, [0, 0, 0]), Wp([0, -20, -120])), label: `${side}: 5L axle` });
    const cb = [-40, 40].map((px) => P("6536.dat", LBG, M("+x", "-y", "-z", [px, -20, -120]), 1, "1x2 cross block"));
    b.attach("32054.dat", LBG, { to: cb[0], where: onAxis(Wp([-40, -40, -120]), 1.5, 20), accept: (m) => pt(m, [0, 0, 0])[2] > Wp([0, 0, -120])[2] + 5, label: `${side}: pin with stop bush` });
    const yAxle = b.attach("4519.dat", YELLOW, { to: arch[0], where: onAxis(Wp([-20, -100, 40]), 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), Wp([-40, -100, 40])), label: `${side}: yellow 3L axle` });
    void ax5; void blk; void magW;
    b.step();
    // 14 axle 4 with stop down through the pin block, the magenta block and the wheel into the
    //    motor output
    const axle = b.attach("87083.dat", DBG, { to: motor, where: (q) => q.kind === "axle", accept: (m) => near3(pt(m, [0, 0, 0]), Wp([0, -70, 0]), 12) && Math.abs(dir(m, [1, 0, 0])[0]) > 0.99, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], maxOverlap: 50, debug: DEBUG.includes("axle"), label: `${side}: 4L axle with stop (into the motor)` });
    if (DEBUG.includes("side")) dump(b, axle);
    b.step();
    // 15 two black pins in the motor's back face
    const backPins = [-40, 40].map((px) => pinM(PIN, BLACK, motor, [px, 0, 141], [px, 0, 141], "back-face pin"));
    // 16-21 the back arm: a double-bent liftarm whose top end locks onto the yellow axle and whose
    //       short arm comes down behind the motor; two blue long pins through it carry two 1x3
    //       axle/pin/pin cross blocks, whose axle holes take two red axle pins into a grey H on
    //       the motor's back; a yellow 3L beam on the other back pin
    //       (the back arm sits beside the arch; the red axle pins go through a yellow 3L beam, one
    //       on into the grey H, which sits on the two back-face pins)
    const hBack = P("14720.dat", LBG, M("+y", "+z", "+x", [0, 0, 151]), 2, "grey H (motor back)");
    const arm2 = P("32009.dat", BLACK, M("+y", "-x", "+z", [-60, -100, 200]), 1, "double bent liftarm (back arm)");
    for (const py of [-60, -40]) b.attach(PIN3, BLUE, { to: arm2, where: onAxis(Wp([-60, py, 200])), accept: (m) => near3(pt(m, [0, 0, 0]), Wp([-60, py, 200])), maxOverlap: 10, label: `${side}: blue long pin (back arm)` });
    const xb = [-80, -40].map((px) => P("42003.dat", LBG, M("-z", "-y", "-x", [px, -40, 200]), 1, "1x3 axle/pin/pin cross block"));
    const yBeam = P("32523.dat", YELLOW, M("+y", "+z", "+x", [-60, -20, 171]), 0, "yellow 3L beam");
    for (const [i, px] of [[0, -80], [1, -40]] as const) b.attach("11214.dat", RED, { to: [xb[i], yBeam, hBack], where: onAxis(Wp([px, -20, 171]), 1.5, 40), accept: (m) => Math.abs(pt(m, [0, 0, 0])[0] - Wp([px, -20, 0])[0]) < 1.5 && Math.abs(pt(m, [0, 0, 0])[1] - Wp([px, -20, 0])[1]) < 1.5, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], maxOverlap: 5, minConnections: 2, debug: DEBUG.includes("bred"), label: `${side}: red axle pin` });
    // 23-24 magenta cable clip on a blue axle pin in the motor's inner side
    const cp = pinM(AXPIN, BLUE, motor, [40, 21, 0], [40, 31, 0], "blue axle pin (clip)");
    b.attach("49283.dat", MAGENTA, { to: cp, label: `${side}: magenta cable clip` });
    void backPins; void yAxle;
    b.step();
    return { motor, wheel, frame75 };
  };
  const left = sideModule(1);
  const right = sideModule(-1);

  // ============================== HUB (assembly 8) ==============================
  // Two pins up in each large motor's top face at its back end; the hub (long side across the
  // robot) on those four pins.
  const topPins: number[] = [];
  for (const [side, mot] of [[1, left.motor], [-1, right.motor]] as const)
    for (const pz of [-20, -60]) topPins.push(pinAt(PIN, BLACK, mot, [side * 100, -102, pz], [side * 100, -112, pz], "hub pin"));
  b.step();
  const hub = b.attach("45601c01.dat", YELLOW, { to: topPins, accept: (m) => Math.abs(m[2]) > 0.99 && Math.abs(x(m)) < 1 && Math.abs(z(m) + 40) < 1, minConnections: 4, debug: DEBUG.includes("hub"), label: "hub" });
  if (DEBUG.includes("hub")) dump(b, hub);
  b.step();

  // ============================== REAR PART (assembly 9-10) ==============================
  // Medium motor C across the back (output up at x = -60, 28-tooth gear on it), the rear magenta
  // 11x7 frame over it (the rear tool mount), two azure 13L beams and two azure 7L beams on the
  // side modules' blue pins. (Approximation: the guide's rear part carries motor C on grey H
  // frames, white thin liftarms and yellow pin joiners; here the motor hangs from the lower 13L
  // beam and the frame sits on two cross blocks on axles in the upper 13L beam.)
  const ZR = 190;
  const beam7 = [1, -1].map((s) => put("32524.dat", AZURE, O("+x", "+z", "-y", [s * 120, -81, 211]), 2, "rear: azure 7L beam (upright)"));
  const beam13 = [-61, -101].map((py) => put("41239.dat", AZURE, O("-y", "+z", "-x", [0, py, 231]), 2, "rear: azure 13L beam"));
  b.step();
  const motorC = put("54696p01.dat", WHITE, O("-z", "+y", "+x", [-60, -41, ZR]), 0, "rear: medium motor C");
  b.setPort(motorC, "C");
  for (const px of [-80, 80]) pinAt(PIN3, BLUE, [motorC, beam13[0]], [px, -61, ZR + 21], [px, -61, ZR + 31], "rear: blue long pin (motor C to 13L)");
  // two 9L beams on the motor's front face
  for (const py of [-61, -21]) {
    const pins = [-80, 80].map((px) => pinAt(PIN, BLACK, motorC, [px, py, ZR - 21], [px, py, ZR - 21], "rear: pin"));
    put("40490.dat", BLACK, O("-y", "+z", "-x", [0, py, ZR - 31]), 2, "rear: 9L beam");
    void pins;
  }
  b.step();
  // 25-26 28-tooth gear on motor C, held by two pins in the rotor
  const gearC = put("46372.dat", LBG, O("+x", "-z", "+y", [-60, -101, ZR]), 0, "rear: 28t gear on motor C");
  for (const pz of [ZR - 20, ZR + 20]) pinAt(PIN, BLACK, [gearC, motorC], [-60, -82, pz], [-60, -91, pz], "rear: gear pin");
  b.step();
  // 27-29 the magenta frame with two red pins (pushed in: they lock a tool's frame), on two cross
  //       blocks whose axles sit in the upper 13L beam, two blue long pins down into the blocks
  for (const s of [1, -1]) {
    const cb = put("6536.dat", LBG, O("+z", s > 0 ? "+x" : "-x", s > 0 ? "+y" : "-y", [s * 80, -101, 210]), 0, "rear: 1x2 cross block");
    b.attach("32062.dat", DBG, { to: [cb, beam13[1]], where: onAxis([s * 80, -101, 225], 1.5, 30), accept: (m) => near3(pt(m, [0, 0, 0]), [s * 80, -101, 220]), minConnections: 2, label: "rear: 2L axle" });
  }
  const frameR = put("39794.dat", MAGENTA, O("+z", "+y", "-x", [0, -121, ZR]), 0, "rear: magenta 11x7 frame (tool mount)");
  for (const s of [1, -1]) pinAt(PIN3, BLUE, frameR, [s * 100, -121, ZR + 20], [s * 100, -101, ZR + 20], "rear: blue long pin (frame)");
  for (const s of [1, -1]) b.attach("32054.dat", RED, { to: frameR, where: onAxis([s * 40, -121, ZR + 60], 1.5, 20), accept: (m) => Math.abs(pt(m, [-10, 0, 0])[2] - (ZR + 70)) < 2 && Math.abs(pt(m, [30, 0, 0])[2] - (ZR + 30)) < 2, offsets: [-30, -20, -10, 0, 10, 20, 30], label: "rear: red pin with stop bush (tool lock)" });
  // 28 two dark grey axles out of the frame's ends into the side modules' 7x5 frames
  for (const s of [1, -1]) b.attach("3705.dat", DBG, { to: frameR, where: onAxis([s * 100, -121, ZR], 1.5, 20), accept: (m) => Math.abs(pt(m, [0, 0, 0])[0] - s * 120) < 2, offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], maxOverlap: 5, label: "rear: 4L axle into the side frame" });
  b.mount("rear", O("-x", "+y", "-z", [0, -121, ZR]));
  b.step();
  void beam7;

  // ============================== FRONT TOOL MOUNT (assembly 11-12) ==============================
  // Magenta 11x7 frame on the front magenta blocks' pins, two red pins with stop bushes in its
  // outer side, pushed in (their tips reach into the opening and lock a tool's frame).
  // (Not scripted: assembly steps 13-18, two brown 5L axles with stop, two bushes and the pair of
  //  black 7x5 frames under the azure frame.)
  const frameF = put("39794.dat", MAGENTA, O("+z", "+y", "-x", [0, -120, -120]), 4, "front: magenta 11x7 frame (tool mount)");
  for (const s of [1, -1]) b.attach("32054.dat", RED, { to: frameF, where: onAxis([s * 40, -120, -180], 1.5, 20), accept: (m) => Math.abs(pt(m, [-10, 0, 0])[2] + 190) < 2 && Math.abs(pt(m, [30, 0, 0])[2] + 150) < 2, offsets: [-30, -20, -10, 0, 10, 20, 30], label: "front: red pin with stop bush (tool lock)" });
  b.mount("front", O("+x", "+y", "+z", [0, -120, -120]));
  b.step();

  // Stand on y = 0 (the wheels' lowest point; the ball sockets clear the floor by ~11 LDU).
  const dy = -b.bounds().max[1];
  for (const p of b.parts) p.m[7] += dy;
  return b;
}
