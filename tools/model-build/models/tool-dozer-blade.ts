// Advanced Driving Base modular tool: dozer blade, scripted from the LEGO Education building
// guide. It goes on the robot's rear mount ("rear"): its 36-tooth gear meshes with motor C's
// 28-tooth gear; the 12-tooth bevel on top turns a 20-tooth bevel on the arm axle.
//
// Guide steps 8-25: the arm axle is a 6L red axle and a 9L axle joined by a white inline axle
// joiner; on each end two curved gear racks (quarter rings, doubled side by side and pinned
// together) hang from the axle by their end axle holes; a red axle through the racks' far ends
// carries a cross block on each side, and the blade (black 15L beam with a magenta 11L beam on
// one face and the azure smooth panel on the other, tan axle pins through all three) is pinned to
// the cross blocks.
// On the robot (guide step 26) the racks arch up from the rear and forward over the robot,
// holding the blade up over it; ARM_DEG turns the arm from "rack leaves the axle straight up".
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Y up, -Z away from the robot,
// so +Z points along the robot towards its front when the tool is on the rear mount).
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, pt } from "../src/build";
import { ARM_AXLE_Y, AZURE, BLACK, DBG, LBG, MAGENTA, O, PIN, RED, TAN, near3, onAxis, toolBase, type V3 } from "./adb-tool-base";

/** Arm turn about the axle, degrees (0: racks leave the axle straight up and reach over the robot,
 *  positive: the blade end swings further forward and down onto the robot). */
const ARM_DEG = 30;
/** Rack planes: inner and outer rack of each pair. */
const RACK_X = [100, 120];

const fr = (x: V3, y: V3, z: V3, o: V3): Mat4 => new Float64Array([x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]]);
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function build(lib: Library) {
  const b = new Build(lib, "ADB dozer blade");
  const L = (s: string) => `dozer blade: ${s}`;
  const base = toolBase(b, "dozer blade");
  const Y = ARM_AXLE_Y;
  // 8-15 the arm axle: red 6L (x -150..-30), white inline joiner, 9L (x -30..150) through the
  //      T-beam's top; a red 1x2 cross block and two tan 20-tooth bevel gears (the one at x = 0
  //      meshes with the 12-tooth bevel)
  const along = (file: string, color: number, cx: number, n: number, label: string) => b.put(file, color, fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [cx, Y, 0]), n, L(label));
  const ax9 = along("60485.dat", DBG, 60, 1, "9L axle (arm pivot)");
  b.put("59443.dat", 15, fr([0, 0, -1], [0, 1, 0], [1, 0, 0], [-30, Y, 0]), 1, L("white inline axle joiner"));
  const ax6 = along("3706.dat", RED, -90, 1, "red 6L axle (arm pivot)");
  for (const px of [0, 40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  b.put("6536.dat", RED, O("+x", "+y", "+z", [60, Y, 0]), 1, L("red 1x2 cross block"));
  b.step();

  // 16-21 the curved racks. 24121: quarter ring about its origin in local X-Z, radius 200, end
  //       axle holes at (0, *, 200) (on the arm axle) and (-200, *, 0) (the blade end).
  //       With u = from the axle end towards the ring's centre and v = from the centre out to the
  //       blade end: local Z -> -u, local X -> -v, local Y -> +X.
  const a = (ARM_DEG * Math.PI) / 180;
  const rot = (y: number, z: number): V3 => [0, y * Math.cos(a) + z * Math.sin(a), -y * Math.sin(a) + z * Math.cos(a)];
  const u = rot(0, 1), v = rot(-1, 0); // at 0 degrees: centre level with the axle towards +Z, blade end straight above it
  const rackM = (px: number): Mat4 => fr([-v[0], -v[1], -v[2]], [1, 0, 0], [-u[0], -u[1], -u[2]], add([px, Y, 0], u, 200));
  const racks: number[] = [];
  for (const sx of [1, -1]) for (const rx of RACK_X) racks.push(b.put("24121.dat", BLACK, rackM(sx * rx), 1, L("curved gear rack")));
  //       pins between each pair's two racks
  for (const sx of [1, -1]) for (const lp of [[-100, 0, 173.2], [-173.2, 0, 100]] as V3[]) {
    const p = pt(rackM(sx * RACK_X[0]), lp);
    b.put("3673.dat", LBG, fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [sx * (RACK_X[0] + RACK_X[1]) / 2, p[1], p[2]]), 2, L("pin (joins the doubled racks)"));
  }
  //       bushes on the axle ends
  for (const sx of [1, -1]) b.put("3713.dat", LBG, O("-z", "+y", "+x", [sx * 140, Y, 0]), 1, L("bush"));
  b.step();

  // 17-19, 22-25 the blade end: a red 3L axle through each pair's far ends and a cross block
  //       outside them; the blade's black 15L beam across, pinned to the blocks' centre holes
  const E = add(add([0, Y, 0], u, 200), v, 200); // blade-end axle hole (x = 0)
  const blocks: number[] = [];
  for (const sx of [1, -1]) {
    b.put("4519.dat", RED, fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [sx * 120, E[1], E[2]]), 2, L("red 3L axle"));
    // 32184: axle holes at (*, -20, 0) and (*, +20, 0) along local X, pin hole at the centre
    // along local Z; local Y -> along the arc past its end (u), local Z -> v
    blocks.push(b.put("32184.dat", DBG, fr(cross(u, v), u, v, [sx * 140, E[1] + 20 * u[1], E[2] + 20 * u[2]]), 1, L("cross block (blade holder)")));
  }
  const at = (x: number, k: number): V3 => [x, E[1] + 20 * u[1] + k * v[1], E[2] + 20 * u[2] + k * v[2]];
  const across = (y: V3): Mat4 => fr(cross(y, [1, 0, 0]), y, [1, 0, 0], [0, 0, 0]);
  const place = (m: Mat4, o: V3) => { m[3] = o[0]; m[7] = o[1]; m[11] = o[2]; return m; };
  for (const sx of [1, -1]) b.put(PIN, BLACK, fr(v, cross([1, 0, 0], v), [1, 0, 0], at(sx * 140, 10)), 1, L("pin"));
  const beam = b.put("32278.dat", BLACK, place(across(v), at(0, 20)), 1, L("black 15L beam (blade)"));
  b.put("32525.dat", MAGENTA, place(across(v), at(0, 40)), 0, L("magenta 11L beam"));
  // the azure panel against the beam's other face, its pin-hole face (local +Y) towards the beam
  b.put("11954.dat", AZURE, place(across(v), at(0, 0)), 0, L("azure smooth panel 11x2x3 (blade)"));
  for (const px of [-80, 80]) b.put("3749.dat", TAN, fr(v, cross([1, 0, 0], v), [1, 0, 0], at(px, 20)), 2, L("tan axle pin"));
  b.step();
  void ax9; void ax6; void beam; void blocks; void near3; void onAxis;
  b.mount("rear", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}
