// Advanced Driving Base modular tool: dozer blade, scripted from the LEGO Education building
// guide. It goes on the robot's rear mount ("rear"): its 36-tooth gear meshes with motor C's
// 28-tooth gear; the 12-tooth bevel on top turns a 20-tooth bevel on the arm axle, which carries
// the two curved gear racks (quarter gear rings) that hold the blade.
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Z away from the robot).
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, pt } from "../src/build";
import { ARM_AXLE_Y, AZURE, BLACK, DBG, LBG, O, PIN, RED, TAN, near3, onAxis, pinAt, toolBase } from "./adb-tool-base";

/** Arm angle (degrees about X): the racks' far ends hang down and away from the robot. */
const ARM_DEG = 170;

export function build(lib: Library) {
  const b = new Build(lib, "ADB dozer blade");
  const L = (s: string) => `dozer blade: ${s}`;
  const base = toolBase(b, "dozer blade");
  const Y = ARM_AXLE_Y;
  // 8-15 the arm axle (12L) through the T-beam's top, a red cross block and two tan 20-tooth
  //      bevel gears (the one at x = 0 meshes with the 12-tooth bevel)
  const axle = b.attach("3708.dat", DBG, { to: base.tbeam, where: onAxis([20, Y, 0], 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), [0, Y, 0]), offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], label: L("12L axle (arm pivot)") });
  for (const px of [0, 40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  b.put("6536.dat", RED, O("+x", "+y", "+z", [60, Y, 0]), 1, L("red 1x2 cross block"));
  b.step();
  // 16 the curved racks on the axle ends (their end axle holes lock them to the axle), turned
  //    ARM_DEG about X so that they reach down and away from the robot
  // rack 24121: arc in its local X-Z plane (centre at its origin), end axle holes at (0,*,200)
  // and (-200,*,0), holes along local Y (the end's axle ring is at local y = +10, so the racks
  // face outwards to sit on the axle's ends: local Y -> -X on the right, +X on the left, and the
  // left one turned 90 degrees less so that both reach the same way).
  const rackM = (px: number): Mat4 => {
    const sx = Math.sign(px), ang = ((ARM_DEG - (sx > 0 ? 90 : 0)) * Math.PI) / 180, c = Math.cos(ang), s = Math.sin(ang);
    // columns: local X -> (0,c,s), local Y -> (-sx,0,0) [right: (+1,0,0)], local Z = X x Y
    const Yv = [sx > 0 ? -1 : 1, 0, 0], Xv = [0, c, s];
    const Zv = [Xv[1] * Yv[2] - Xv[2] * Yv[1], Xv[2] * Yv[0] - Xv[0] * Yv[2], Xv[0] * Yv[1] - Xv[1] * Yv[0]];
    const m = new Float64Array([Xv[0], Yv[0], Zv[0], 0, Xv[1], Yv[1], Zv[1], 0, Xv[2], Yv[2], Zv[2], 0]);
    const a = pt(m, [0, 0, 200]);
    m[3] = px - a[0]; m[7] = Y - a[1]; m[11] = 0 - a[2];
    return m;
  };
  const racks = [120, -120].map((px) => b.put("24121.dat", BLACK, rackM(px), 1, L("curved gear rack")));
  b.step();
  // 17-25 the blade: a 2L axle through each rack's lower end into a cross block, a pin from each
  //       block into a black 15L beam across, the azure smooth panel pinned to the beam's face
  const end = racks.map((r) => pt(b.parts[r].m, [-200, 0, 0]));
  const blocks = end.map((e, i) => {
    const sx = i ? -1 : 1;
    const cb = b.put("6536.dat", BLACK, O(sx > 0 ? "+x" : "-x", "+y", sx > 0 ? "+z" : "-z", [e[0] - sx * 20, e[1], e[2]]), 0, L("1x2 cross block"));
    b.attach("32062.dat", DBG, { to: [cb, racks[i]], where: onAxis(e, 1.5, 30), accept: (m) => near3(pt(m, [0, 0, 0]), [e[0] - sx * 10, e[1], e[2]], 2), minConnections: 2, label: L("2L axle") });
    return cb;
  });
  const by = end[0][1] + 20, bz = end[0][2];
  const pinZ = (i: number) => pt(b.parts[blocks[i]].m, [0, 20, 0]);
  const beam = b.put("32278.dat", BLACK, O("-y", "+z", "-x", [0, by, bz - 20]), 0, L("black 15L beam"));
  for (const i of [0, 1]) { const p = pinZ(i); pinAt(b, PIN, BLACK, [blocks[i], beam], p, [p[0], p[1], bz - 10], L("pin")); }
  for (const px of [-40, 40]) pinAt(b, PIN, BLACK, beam, [px, by, bz - 20], [px, by, bz - 30], L("pin"));
  b.put("11954.dat", AZURE, O("+y", "+z", "+x", [0, by, bz - 40]), 2, L("azure smooth panel 11x2x3 (blade)"));
  b.step();
  void LBG; void RED;
  b.mount("rear", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}
