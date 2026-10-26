// Advanced Driving Base modular tool: lift arm (forklift), scripted from the LEGO Education
// building guide. It goes on the robot's front mount ("front"): its 36-tooth gear meshes with
// motor D's 28-tooth gear; the 12-tooth bevel on top turns the double 20-tooth bevel on a 9L axle
// that carries the arm.
//
// Along the 9L axle (x, centred on the tool): yellow T-beam (-80), two 20-tooth bevels (-60, -40;
// the one at -40 meshes with the 12-tooth bevel at x = -20), the arm (bent liftarms at -20 and
// +20 with the red cross block between them at 0), two bushes (40, 60), yellow T-beam (+80).
// The arm (guide steps 9-21): the two 4x6 bent liftarms hang from the axle by their short legs
// with a 9L beam sandwiched between their long legs (blue long pins through all three); the 9L
// beam reaches further down, where a second pair of bent liftarms bends forward, and a 1x7 gear
// rack on a yellow 3L axle through their tips is the fork.
// The arm is laid out hanging as the guide draws it, then turned ARM_DEG forward about the axle so
// that it rests as on the finished robot (LEGO's photo): the short legs level, the long part
// sloping down and forward, the fork lying just above the floor pointing forward.
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Y up, -Z away from the robot).
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build } from "../src/build";
import { ARM_AXLE_Y, BLACK, BLUE, DBG, LBG, O, PIN, PIN3, RED, TAN, YELLOW, tbeam, toolBase, type V3 } from "./adb-tool-base";

/** Arm turn about the axle from hanging straight down (0) towards forward (90). */
export const ARM_DEG = 27;

/** Matrix whose local X, Y, Z axes point along x, y, z (world) with its origin at o. */
const fr = (x: V3, y: V3, z: V3, o: V3): Mat4 => new Float64Array([x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]]);

export function build(lib: Library) {
  const b = new Build(lib, "ADB lift arm");
  const L = (s: string) => `lift arm: ${s}`;
  toolBase(b, "lift arm");
  const Y = ARM_AXLE_Y;
  // 8 the yellow T-beam on the right end
  tbeam(b, 1, L("yellow T-beam"));
  b.step();
  // turn about the axle line (y = Y, z = 0): hanging down (+Y) -> forward (-Z) at 90 degrees
  const a = (ARM_DEG * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const R: Mat4 = new Float64Array([1, 0, 0, 0, 0, c, s, Y - c * Y, 0, -s, c, s * Y]);
  const arm = (m: Mat4) => mul(R, m);
  const along = (x: number, y: number, z: number): Mat4 => fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [x, y, z]);

  // 9-15 the 9L axle, the red cross block (a black pin in its pin hole, sticking out towards the
  //      robot), two 20-tooth bevels, the upper bent liftarms on either side of the red block,
  //      the 9L beam between them, blue long pins, two bushes
  b.put("60485.dat", DBG, along(0, Y, 0), 1, L("9L axle (arm pivot)"));
  for (const px of [-60, -40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  // 6536: axle hole along local X, pin hole 1 stud along local +Y (here: up), along local Z
  b.put("6536.dat", RED, arm(O("+x", "-y", "-z", [0, Y, 0])), 1, L("red 1x2 cross block"));
  b.put(PIN, BLACK, arm(fr([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, Y - 20, 10])), 1, L("pin (in the red cross block)"));
  // 6629: long leg along local +Z from the axle hole at the origin to the bend at z = 100, short
  // leg towards +X ending in the axle hole at (48, *, 136); holes along local Y.
  // Hanging: local Z -> up (-Y), local X -> back (+Z), local Y -> -X: the short leg reaches
  // forward and down from the axle, the long leg straight down from the bend.
  const upper = (px: number): Mat4 => fr([0, 0, 1], [-1, 0, 0], [0, -1, 0], [px, Y + 136, -48]);
  b.put("6629.dat", BLACK, arm(upper(-20)), 1, L("4x6 bent liftarm"));
  const bendY = Y + 136 - 100, beamZ = -48;
  // the 9L beam's top hole at the bend, reaching 3 holes below the liftarms' ends
  b.put("40490.dat", BLACK, arm(fr([0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, bendY + 80, beamZ])), 0, L("9L beam"));
  b.put("6629.dat", BLACK, arm(upper(20)), 1, L("4x6 bent liftarm"));
  for (const py of [bendY + 40, bendY + 80]) b.put(PIN3, BLUE, arm(along(0, py, beamZ)), 2, L("blue long pin"));
  for (const px of [40, 60]) b.put("3713.dat", LBG, O("-z", "+y", "+x", [px, Y, 0]), 1, L("bush"));
  b.step();
  // 17 the yellow T-beam on the left end, over the axle end and the blue pins
  tbeam(b, -1, L("yellow T-beam"));
  b.step();

  // 18-21 lower bent liftarms on the 9L beam's lower holes (blue long pins), bending forward at
  //       its bottom hole: hanging, local Z -> down (+Y), local X -> forward (-Z), local Y -> -X
  const bottomY = bendY + 160;
  const lower = (px: number): Mat4 => fr([0, 0, -1], [-1, 0, 0], [0, 1, 0], [px, bottomY - 100, beamZ]);
  b.put("6629.dat", BLACK, arm(lower(-20)), 0, L("4x6 bent liftarm (lower)"));
  b.put("6629.dat", BLACK, arm(lower(20)), 0, L("4x6 bent liftarm (lower)"));
  for (const py of [bottomY - 60, bottomY - 20]) b.put(PIN3, BLUE, arm(along(0, py, beamZ)), 2, L("blue long pin"));
  //       the fork: a yellow 3L axle through the lower liftarms' tips, a 1x7 gear rack on it
  //       continuing the short legs' direction
  const tip: V3 = [0, bottomY - 100 + 136, beamZ - 48];
  b.put("4519.dat", YELLOW, arm(along(tip[0], tip[1], tip[2])), 2, L("yellow 3L axle"));
  const d: V3 = [0, 0.6, -0.8]; // bend -> tip of the lower short legs (hanging)
  const rx: V3 = [0, -d[1], -d[2]], rz: V3 = [1, 0, 0];
  const ry: V3 = [rz[1] * rx[2] - rz[2] * rx[1], rz[2] * rx[0] - rz[0] * rx[2], rz[0] * rx[1] - rz[1] * rx[0]];
  b.put("87761.dat", BLACK, arm(fr(rx, ry, rz, [tip[0], tip[1] - 40 * rx[1], tip[2] - 40 * rx[2]])), 1, L("1x7 gear rack (fork)"));
  b.step();
  b.mount("front", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}
