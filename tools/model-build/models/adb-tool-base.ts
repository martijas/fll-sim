// Shared base of the Advanced Driving Base's modular tools (dozer blade, lift arm), steps 1-8 of
// both tool guides: a black 7x5 frame around a magenta 3x3 block (two pins and two yellow pin
// joiners on one side, four blue long pins through the frame's ends), a vertical axle through the
// block with a 36-tooth gear under the frame and a 12-tooth bevel gear on top.
//
// Tool frame (= the mount frame, see b.mount): origin at the centre of the black frame, which
// sits inside the robot's magenta 11x7 frame; -Y up, -Z = away from the robot (the tool's
// front), +X to the right looking from the robot outwards. The 36-tooth gear (x = -20, y = +20)
// meshes with the robot's 28-tooth gear on the mount's motor (x = +60, same height); the robot's
// two red pins (pushed in) lock into the frame's outer long side at x = ±40, z = -40.
import { type Mat4 } from "@fll-sim/ldraw";
import { Build, orient, pt, type SnapInfo } from "../src/build";

export const BLACK = 0, BLUE = 1, RED = 4, YELLOW = 14, TAN = 19, LBG = 71, DBG = 72, AZURE = 322, MAGENTA = 26;
export const PIN = "61332.dat", PIN3 = "6558.dat";
export type V3 = [number, number, number];
export const O = (x: string, y: string, z: string, t: V3) => orient(x as never, y as never, z as never, t);
export const near3 = (a: V3, b: V3, tol = 1.5) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= tol;
export const onAxis = (p: V3, tol = 1.5, along = 15) => (s: SnapInfo) => {
  const v = [p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]];
  const t = v[0] * s.axis[0] + v[1] * s.axis[1] + v[2] * s.axis[2];
  return Math.abs(t) <= along && Math.hypot(v[0] - t * s.axis[0], v[1] - t * s.axis[1], v[2] - t * s.axis[2]) <= tol;
};
/** A pin-like part into the hole on the line through `hole`, its origin at `centre`. */
export function pinAt(b: Build, file: string, color: number, to: number | number[], hole: V3, centre: V3, label: string, maxOverlap = 2, extra?: (m: Mat4) => boolean) {
  return b.attach(file, color, { to, where: onAxis(hole, 1.5, 40), accept: (m) => near3(pt(m, [0, 0, 0]), centre) && (!extra || extra(m)), offsets: [-40, -30, -20, -10, 0, 10, 20, 30, 40], maxOverlap, label });
}

/** Height of the arm axle (a 9L axle along X at z = 0) above the tool frame. */
export const ARM_AXLE_Y = -40;

/** x of the yellow T-beams that hold the arm axle: on the blue long pins sticking out of the
 *  frame's two short ends, inside the robot's magenta 11x7 frame. */
export const TBEAM_X = 80;

/**
 * Steps 1-7 of both tool guides: a black 7x5 frame (long side across, x) around a magenta 3x3
 * block (vertical axle with a 12-tooth bevel on top and a 36-tooth gear under the frame) and two
 * yellow pin joiners; four blue long pins through the frame's short ends, sticking out of them so
 * that the yellow T-beams (see `tbeam`) can go on at x = -80 and x = +80.
 */
export function toolBase(b: Build, name: string) {
  const L = (s: string) => `${name}: ${s}`;
  // 1-2 magenta 3x3 block, two pins in its right side, a yellow pin joiner on each
  //     (the frame of step 3 is put down first: the blue long pins of step 4 then count as held
  //      by the frame rather than by the free-spinning joiners, so the T-beams on them are rigid)
  const block = b.place("39793.dat", MAGENTA, O("+x", "+y", "+z", [-20, 0, 0]), L("magenta 3x3 block"));
  const pins = [-20, 20].map((pz) => b.attach(PIN, BLACK, { to: block, where: onAxis([1, 0, pz], 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), [1, 0, pz]), label: L("pin") }));
  // 3 the black 7x5 frame around them (long side across)
  const frame = b.put("64179.dat", BLACK, O("-z", "+y", "+x", [0, 0, 0]), 0, L("black 7x5 frame"));
  const joiners = [-20, 20].map((pz, i) => b.attach("62462.dat", YELLOW, { to: pins[i], accept: (m) => pt(m, [0, 0, 0])[0] > 15 && Math.abs(pt(m, [0, 0, 0])[2] - pz) < 2, label: L("yellow pin joiner") }));
  b.step();
  // 4 four blue long pins through the frame's ends into the block and the joiners, one stud
  //   sticking out of each end
  for (const px of [-60, 60]) for (const [i, pz] of [-20, 20].entries()) pinAt(b, PIN3, BLUE, [frame, px < 0 ? block : joiners[i]], [px, 0, pz], [px < 0 ? -70 : 60, 0, pz], L("blue long pin"), 5);
  b.step();
  // 5-7 3L axle down through the block (a 12-tooth bevel on top), a 36-tooth gear under the frame
  const axle = b.attach("4519.dat", DBG, { to: block, where: onAxis([-20, 0, 0], 1.5, 20), accept: (m) => near3(pt(m, [0, 0, 0]), [-20, 0, 0]), offsets: [0], label: L("3L axle (tool input)") });
  const gear36 = b.put("32498.dat", LBG, O("+x", "-z", "+y", [-20, 20, 0]), 1, L("36-tooth gear (driven by the robot)"));
  const bevel12 = b.attach("6589.dat", TAN, { to: axle, accept: (m) => Math.abs(pt(m, [0, 0, 0])[1] + 15) < 3 && pt(m, [0, 0, 1])[1] < pt(m, [0, 0, 0])[1], label: L("12-tooth bevel gear") });
  b.step();
  return { frame, block, axle, gear36, bevel12 };
}

/** A yellow T-beam standing at a short end of the tool frame (x = ±TBEAM_X): crossbar down on the
 *  two blue long pins, stem up; the arm axle turns in its top hole (y = ARM_AXLE_Y). */
export function tbeam(b: Build, side: -1 | 1, label: string) {
  return b.put("60484.dat", YELLOW, O("+z", "+x", "+y", [side * TBEAM_X, ARM_AXLE_Y, 0]), 2, label);
}
