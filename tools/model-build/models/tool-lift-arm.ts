// Advanced Driving Base modular tool: lift arm (forklift), scripted from the LEGO Education
// building guide. It goes on the robot's front mount ("front"): its 36-tooth gear meshes with
// motor D's 28-tooth gear; the 12-tooth bevel on top turns a 20-tooth bevel on a 9L axle that
// carries the arm (bent liftarms with a gear rack as the fork at the tip).
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Z away from the robot).
import { type Library } from "@fll-sim/ldraw";
import { Build, dump, pt } from "../src/build";
import { ARM_AXLE_Y, BLACK, BLUE, DBG, LBG, O, PIN3, RED, TAN, YELLOW, near3, onAxis, pinAt, toolBase } from "./adb-tool-base";

export function build(lib: Library) {
  const b = new Build(lib, "ADB lift arm");
  const DEBUG = process.env.ADB_DEBUG ?? "";
  const L = (s: string) => `lift arm: ${s}`;
  const base = toolBase(b, "lift arm");
  const Y = ARM_AXLE_Y;
  // 9-11 9L axle through the T-beam's top, a red 1x2 cross block and two tan 20-tooth bevel gears
  //      (the one at x = 0 meshes with the 12-tooth bevel)
  const axle9 = b.attach("60485.dat", DBG, { to: base.tbeam, where: onAxis([20, Y, 0], 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), [30, Y, 0]), offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: L("9L axle (arm pivot)") });
  for (const px of [0, 40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  const red = b.put("6536.dat", RED, O("+x", "+y", "+z", [60, Y, 0]), 1, L("red 1x2 cross block"));
  b.step();
  // 10-14 the arm: two 4x6 bent liftarms locked on the axle by their axle holes (the fork arm
  //       reaches forward and down), a 9L beam along them, blue pins between
  const armM = (px: number) => O("+y", "+x", "-z", [px, Y, 0]); // 6629: long arm along -Z, bend towards +Y (down)
  const armA = b.put("6629.dat", BLACK, armM(80), 1, L("4x6 bent liftarm"));
  const armB = b.put("6629.dat", BLACK, armM(100), 1, L("4x6 bent liftarm"));
  if (DEBUG.includes("arm")) dump(b, armA);
  for (const pz of [-40, -80]) pinAt(b, PIN3, BLUE, [armA, armB], [90, Y, pz], [90, Y, pz], L("blue long pin"), 5);
  b.put("40490.dat", BLACK, O("+y", "+x", "-z", [120, Y, -60]), 1, L("9L beam"));
  b.step();
  // 15 bushes on the axle ends
  for (const px of [-50, 115]) b.put("3713.dat", LBG, O("-z", "+y", "+x", [px, Y, 0]), 1, L("bush"));
  b.step();
  // 19-21 the fork: a 3L yellow axle through the bent liftarms' tips, a 1x7 gear rack on it
  const tip = pt(b.parts[armA].m, [48, 0, 136]);
  const yax = b.attach("4519.dat", YELLOW, { to: [armA, armB], where: onAxis([tip[0], tip[1], tip[2]], 2, 30), accept: (m) => near3(pt(m, [0, 0, 0]), [110, tip[1], tip[2]], 3), label: L("yellow 3L axle") });
  b.attach("87761.dat", BLACK, { to: yax, own: (s) => s.kind === "axle", accept: (m) => pt(m, [0, 0, 0])[0] > 115, label: L("1x7 gear rack (fork)") });
  b.step();
  void red; void BLACK;
  b.mount("front", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}

