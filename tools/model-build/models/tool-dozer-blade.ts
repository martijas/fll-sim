// Advanced Driving Base modular tool: dozer blade, scripted from the LEGO Education building
// guide. It goes on the robot's rear mount ("rear"): its 36-tooth gear meshes with motor C's
// 28-tooth gear; the 12-tooth bevel on top turns the double 20-tooth bevel on the arm axle.
//
// The arm axle (guide steps 8-16) is a 9L axle (x -150..30) and a red 6L axle (30..150) joined by
// a white inline joiner. Along it: racks (-140, -120), bush (-100), yellow T-beam (-80), two
// 20-tooth bevels (-60, -40; the one at -40 meshes with the 12-tooth bevel at x = -20), bush
// (-20), red cross block with a black pin (0), white joiner (10..50), yellow T-beam (80), bush
// (100), racks (120, 140). The racks are curved gear racks (quarter rings), two side by side on
// each end, pinned together; at their far ends a red 3L axle holds a cross block on each side, and
// the blade is pinned to the blocks: a black 15L beam, a magenta 11L beam on it and the azure
// smooth panel on top (tan axle pins through the three).
// On the robot (LEGO's photo of the finished robot) the racks rise from the rear and arch back,
// away from the robot, holding the blade up behind it with the azure panel facing up and back;
// ARM_DEG turns the arm from "racks leave the axle straight up" further back.
// Frame: see adb-tool-base.ts (mount at the tool frame's centre, -Y up, -Z away from the robot).
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, pt } from "../src/build";
import { ARM_AXLE_Y, AZURE, BLACK, DBG, LBG, MAGENTA, O, PIN, RED, TAN, tbeam, toolBase, type V3 } from "./adb-tool-base";

/** Arm turn about the axle, degrees: 0 = the racks leave the axle straight up and arch back to the
 *  blade straight above their centre; more = the blade end swings further back and down. */
export const ARM_DEG = 45;
/** The two racks of each pair (x, both sides): on the axle outside the bush next to the T-beam. */
const RACK_X = [120, 140];

const fr = (x: V3, y: V3, z: V3, o: V3): Mat4 => new Float64Array([x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]]);
const add = (...vs: [V3, number][]): V3 => vs.reduce<V3>((s, [v, k]) => [s[0] + k * v[0], s[1] + k * v[1], s[2] + k * v[2]], [0, 0, 0]);
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const X: V3 = [1, 0, 0];

export function build(lib: Library) {
  const b = new Build(lib, "ADB dozer blade");
  const L = (s: string) => `dozer blade: ${s}`;
  toolBase(b, "dozer blade");
  const Y = ARM_AXLE_Y;
  const along = (x: number): Mat4 => fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [x, Y, 0]);

  // 8-15 the yellow T-beams at the frame's ends, the arm axle through them with the gears,
  //      bushes and red cross block
  for (const side of [-1, 1] as const) tbeam(b, side, L("yellow T-beam"));
  b.put("60485.dat", DBG, along(-60), 1, L("9L axle (arm pivot)"));
  b.put("59443.dat", 15, fr([0, 0, -1], [0, 1, 0], [1, 0, 0], [30, Y, 0]), 1, L("white inline axle joiner"));
  b.put("3706.dat", RED, along(90), 1, L("red 6L axle (arm pivot)"));
  for (const px of [-60, -40]) b.put("18575.dat", TAN, O("+z", "+y", "-x", [px, Y, 0]), 1, L("20-tooth bevel gear"));
  b.put("6536.dat", RED, O("+x", "-y", "-z", [0, Y, 0]), 1, L("red 1x2 cross block"));
  b.put(PIN, BLACK, fr([0, 0, 1], [0, 1, 0], [-1, 0, 0], [0, Y - 20, 10]), 1, L("pin (in the red cross block)"));
  for (const px of [-100, -20, 100]) b.put("3713.dat", LBG, O("-z", "+y", "+x", [px, Y, 0]), 1, L("bush"));
  b.step();

  // 16-21 the curved racks. 24121: quarter ring about its origin in local X-Z, radius 200, end
  //       axle holes at (0, *, 200) (on the arm axle) and (-200, *, 0) (the blade end).
  //       u = from the arm axle towards the ring's centre, v = from the centre out to the blade
  //       end; at 0 degrees u points back (-Z) and v up (-Y): local Z -> -u, local X -> -v.
  const a = (ARM_DEG * Math.PI) / 180;
  const u: V3 = [0, Math.sin(a), -Math.cos(a)], v: V3 = [0, -Math.cos(a), -Math.sin(a)];
  const neg = (w: V3): V3 => [-w[0], -w[1], -w[2]];
  const rackM = (px: number): Mat4 => fr(neg(v), cross(u, v), neg(u), add([[px, Y, 0], 1], [u, 200]));
  for (const sx of [-1, 1]) for (const rx of RACK_X) b.put("24121.dat", BLACK, rackM(sx * rx), 1, L("curved gear rack"));
  //       pins joining each pair's two racks
  for (const sx of [-1, 1]) for (const lp of [[-100, 0, 173.2], [-173.2, 0, 100]] as V3[]) {
    const p = pt(rackM(sx * RACK_X[0]), lp);
    b.put("3673.dat", LBG, fr([1, 0, 0], [0, 1, 0], [0, 0, 1], [sx * (RACK_X[0] + RACK_X[1]) / 2, p[1], p[2]]), 2, L("pin (joins the doubled racks)"));
  }
  b.step();

  // 17-19 at the racks' far ends: a red 3L axle through both racks and a cross block inside them
  //       (32184: axle holes along local X at local y = -20 and +20, pin hole at the centre along
  //       local Z; here local Y -> u, past the racks' ends, local Z -> v), a black pin in its pin
  //       hole pointing out (v)
  const E = add([[0, Y, 0], 1], [u, 200], [v, 200]); // the blade end (x = 0)
  const at = (x: number, du: number, dv: number): V3 => [x, E[1] + du * u[1] + dv * v[1], E[2] + du * u[2] + dv * v[2]];
  const alongV = (o: V3): Mat4 => fr(v, cross(X, v), X, o); // a pin or axle pin along v
  const acrossX = (o: V3): Mat4 => fr(cross(v, X), v, X, o); // a beam across x, holes along v
  for (const sx of [-1, 1]) {
    b.put("4519.dat", RED, fr([1, 0, 0], [0, 1, 0], [0, 0, 1], at(sx * 120, 0, 0)), 2, L("red 3L axle"));
    b.put("32184.dat", DBG, fr(cross(u, v), u, v, at(sx * 100, 20, 0)), 1, L("cross block (blade holder)"));
    b.put(PIN, BLACK, alongV(at(sx * 100, 20, 10)), 1, L("pin"));
  }
  b.step();
  // 22-25 the blade: the black 15L beam on the blocks' pins, the magenta 11L beam on it, tan axle
  //       pins through both into the azure panel on top (its pin-hole face down on the magenta)
  b.put("32278.dat", BLACK, acrossX(at(0, 20, 20)), 1, L("black 15L beam (blade)"));
  b.put("32525.dat", MAGENTA, acrossX(at(0, 20, 40)), 0, L("magenta 11L beam"));
  for (const px of [-80, 80]) b.put("3749.dat", TAN, alongV(at(px, 20, 40)), 2, L("tan axle pin"));
  b.put("11954.dat", AZURE, fr(cross(X, v), neg(v), X, at(0, 20, 60)), 1, L("azure smooth panel 11x2x3 (blade)"));
  b.step();
  b.mount("rear", O("+x", "+y", "+z", [0, 0, 0]));
  return b;
}
