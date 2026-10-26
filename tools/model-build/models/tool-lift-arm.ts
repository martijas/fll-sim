// Advanced Driving Base modular tool: lift arm (forklift), scripted from the LEGO Education
// building guide. It goes on the robot's front mount ("front"): its 36-tooth gear meshes with
// motor D's 28-tooth gear; the 12-tooth bevel on top turns a 20-tooth bevel on a 9L axle that
// carries the arm.
//
// The arm (guide steps 9-21): two 4x6 bent liftarms hang from the axle by their short legs with a
// 9L beam sandwiched between their long legs (blue long pins through all three); the 9L beam
// reaches further down, where a second pair of bent liftarms bends forward, and a 1x7 gear rack
// on a yellow 3L axle through their tips is the fork.
// The arm is laid out hanging straight down (as the guide draws it) and then turned ARM_DEG about
// the axle: on the robot it starts raised (guide step 22), the long part pointing forward and the
// fork up.
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Y up, -Z away from the robot).
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build, pt } from "../src/build";
import { ARM_AXLE_Y, BLACK, BLUE, DBG, LBG, O, PIN3, RED, TAN, YELLOW, near3, onAxis, toolBase, type V3 } from "./adb-tool-base";

/** Arm turn about the axle from hanging down (0) towards raised forward (90 = long part level). */
const ARM_DEG = 90;

/** Matrix whose local X, Y, Z axes point along x, y, z (world) with its origin at o. */
const fr = (x: V3, y: V3, z: V3, o: V3): Mat4 => new Float64Array([x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]]);

export function build(lib: Library) {
  const b = new Build(lib, "ADB lift arm");
  const L = (s: string) => `lift arm: ${s}`;
  const base = toolBase(b, "lift arm");
  const Y = ARM_AXLE_Y;
  // turn about the axle line (x, Y, 0): hanging down (+Y) -> forward (-Z) at 90 degrees
  const a = (ARM_DEG * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const R: Mat4 = new Float64Array([1, 0, 0, 0, 0, c, s, -Y * c - 0 * s + Y, 0, -s, c, Y * s]);
  const arm = (m: Mat4) => mul(R, m);

  // 9-11 9L axle through the T-beam's top, a red 1x2 cross block and two tan 20-tooth bevel gears
  //      (the one at x = 0 meshes with the 12-tooth bevel)
  const axle = b.attach("60485.dat", DBG, { to: base.tbeam, where: onAxis([20, Y, 0], 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), [40, Y, 0]), offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: L("9L axle (arm pivot)") });
  for (const px of [0, 40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  b.put("6536.dat", RED, O("+x", "+y", "+z", [60, Y, 0]), 1, L("red 1x2 cross block"));
  b.step();

  // 10-14 upper bent liftarms (x = 80 and 120) hanging from the axle by their short legs: the short
  //       leg reaches forward and down from the axle, the long leg straight down. 6629: long leg
  //       along local +Z from the axle hole at the origin to the bend at z = 100, short leg towards
  //       +X ending in the axle hole at (48, *, 136); holes along local Y.
  //       Hanging: local Z -> up (-Y), local X -> back (+Z), local Y -> -X.
  const upper = (px: number): Mat4 => fr([0, 0, 1], [-1, 0, 0], [0, -1, 0], [px, Y + 136, -48]);
  const armA = b.put("6629.dat", BLACK, arm(upper(80)), 1, L("4x6 bent liftarm"));
  //       the 9L beam between them, its top hole at the bend, reaching 3 holes below their ends
  const bendY = Y + 136 - 100, beamZ = -48;
  const beam = b.put("40490.dat", BLACK, arm(fr([0, 0, -1], [-1, 0, 0], [0, 1, 0], [100, bendY + 80, beamZ])), 0, L("9L beam"));
  const armB = b.put("6629.dat", BLACK, arm(upper(120)), 1, L("4x6 bent liftarm"));
  const pin3 = (at: V3, to: number[]) => b.put(PIN3, BLUE, arm(fr([1, 0, 0], [0, 1, 0], [0, 0, 1], at)), 2, L("blue long pin"));
  for (const py of [bendY + 40, bendY + 80]) pin3([100, py, beamZ], [armA, beam, armB]);
  b.step();
  // 15 a bush on the axle's free end (the other end is flush with the outer liftarm)
  b.put("3713.dat", LBG, O("-z", "+y", "+x", [-40, Y, 0]), 1, L("bush"));
  void axle;
  b.step();

  // 18-21 lower bent liftarms (x = 80 and 120) on the 9L beam's lower holes, bending forward at
  //       its bottom hole: hanging, local Z -> down (+Y), local X -> forward (-Z), local Y -> -X
  const bottomY = bendY + 160;
  const lower = (px: number): Mat4 => fr([0, 0, -1], [-1, 0, 0], [0, 1, 0], [px, bottomY - 100, beamZ]);
  const armC = b.put("6629.dat", BLACK, arm(lower(80)), 0, L("4x6 bent liftarm (lower)"));
  const armD = b.put("6629.dat", BLACK, arm(lower(120)), 0, L("4x6 bent liftarm (lower)"));
  for (const py of [bottomY - 60, bottomY - 20]) pin3([100, py, beamZ], [armC, beam, armD]);
  //       the fork: a yellow 3L axle through the lower liftarms' tips, a 1x7 gear rack on it
  //       continuing the short legs' direction (forward and down when hanging)
  const tip: V3 = [100, bottomY - 100 + 136, beamZ - 48];
  b.put("4519.dat", YELLOW, arm(fr([1, 0, 0], [0, 1, 0], [0, 0, 1], tip)), 2, L("yellow 3L axle"));
  const d: V3 = [0, 0.6, -0.8]; // bend -> tip of the short leg
  const rx: V3 = [0, -d[1], -d[2]], rz: V3 = [1, 0, 0];
  const ry: V3 = [rz[1] * rx[2] - rz[2] * rx[1], rz[2] * rx[0] - rz[0] * rx[2], rz[0] * rx[1] - rz[1] * rx[0]];
  b.put("87761.dat", BLACK, arm(fr(rx, ry, rz, [tip[0], tip[1] - 40 * rx[1], tip[2] - 40 * rx[2]])), 1, L("1x7 gear rack (fork)"));
  b.step();
  void LBG;
  b.mount("front", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}
