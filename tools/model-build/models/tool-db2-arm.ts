// Driving Base 2 accessory: the motorised arm (tools & accessories guide, steps 1-17).
// A base of 3 stacked beams (magenta 5L, medium azure 3x5 L, magenta 5L on 2 blue 3L pins)
// with two 5L axles through it and a white 1x3 cross block (axle/pin/axle) on each axle pair;
// black pins in the cross blocks go into the hub's front holes. The L beam's short arm reaches
// forward over the accessory motor and carries the yellow 7L arm axle (across the robot). On it:
// a 12T double bevel gear meshing the accessory motor's (port E) 12T, two black double-bent
// liftarms, medium azure 2L liftarms and a bush; the liftarms' far ends are joined by a 9L axle
// with white 135° angle connectors on its ends. The arm swings up and down about the 7L axle.
// Approximations: the guide pins the base to the accessory motor; in this model the base is
// pinned to the hub's front face and the gear sits at the 7L axle's end so it meshes with the
// motor's gear (see robot-db2.ts for the motor's place).
// Scripted in the robot's frame (see robot-db2.ts); mount "db2-arm".
import type { Library, Mat4 } from "@fll-sim/ldraw";
import { orient, pt } from "../src/build";
import { DB2, MOUNTS, buildBase, near3, onAxis, pinner, toolFrom, x, y, z } from "./robot-db2";

const BLACK = 0, WHITE = 15, MAGENTA = 26, AZURE = 322, BLUE = 1, YELLOW = 14, LBG = 71;
/** Arm pose: the far end of the double-bent liftarms (y, z) about the 7L axle. Lowered forwards. */
export const ARM_TIP = { y: -30, z: -300 };

export function build(lib: Library) {
  const b = buildBase(lib);
  const n0 = b.parts.length;
  const pinAt = pinner(b);
  const hub = b.parts.findIndex((p) => p.label === "hub");
  const Z = -120; // base plane (just in front of the hub's front face, z = -110)
  const AX = { y: -130, z: DB2.eMotor.z }; // the 7L arm axle, over the accessory motor's output
  const accept = (c: [number, number, number], tol = 1.5) => (m: Mat4) => near3([x(m), y(m), z(m)], c, tol);

  // ---- steps 5-7 first (the cross blocks carry the base): white cross blocks with black pins
  // in their centre holes, pins into the hub's front holes x = ±40, y = -110
  const blocks = [-40, 40].map((bx) => b.place("32184.dat", WHITE, orient("+x", "+y", "+z", [bx, -110, Z]), "white cross block"));
  for (const bx of [-40, 40]) pinAt("2780.dat", BLACK, [hub, ...blocks], [bx, -110, -101], [bx, -110, -110], "pin");
  b.step();
  // ---- steps 1-3: magenta 5L, azure L, magenta 5L stacked across x on 2 blue 3L pins (holes 1, 4)
  const beam5 = (bx: number) => b.place("32316.dat", MAGENTA, orient("+z", "+x", "+y", [bx, -90, Z]), "magenta 5L beam");
  const m1 = beam5(-20);
  const L = b.place("32526.dat", AZURE, orient("-z", "+x", "-y", [0, -50, Z]), "azure L beam");
  const m2 = beam5(20);
  for (const py of [-50, -110]) pinAt("6558.dat", BLUE, [m1, L, m2], [0, py, Z], [0, py, Z], "blue 3L pin");
  b.step();
  // step 4: two 5L axles through the cross blocks and the stack (holes 3, 5)
  for (const py of [-90, -130]) pinAt("32073.dat", LBG, [...blocks, m1, L, m2], [0, py, Z], [0, py, Z], "5L axle");
  b.step();
  // ---- steps 8-15: the arm. 7L yellow axle through the L's forward end hole
  const ax7 = pinAt("44294.dat", YELLOW, L, [0, AX.y, AX.z], [0, AX.y, AX.z], "7L arm axle");
  b.step();
  const onAx = (file: string, color: number, px: number, label: string, extra: (m: Mat4) => boolean = () => true, own?: (s: any) => boolean) =>
    b.attach(file, color, { to: ax7, own, accept: (m) => Math.abs(pt(m, [0, 0, 0])[0] - px) < 12 && extra(m), offsets: [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60], angles: Array.from({ length: 36 }, (_, i) => i * 10), label, maxOverlap: 4 });
  onAx("32270.dat", BLACK, -60, "12T double bevel gear");
  // double-bent liftarms: one end's axle hole on the 7L axle, the other end lowered forwards
  const tip = (m: Mat4) => pt(m, [0, 10, -160]);
  const liftarm = (px: number) => onAx("32009.dat", BLACK, px, "double-bent liftarm", (m) => Math.abs(pt(m, [80, 10, 0])[1] - AX.y) < 2 && Math.abs(pt(m, [80, 10, 0])[2] - AX.z) < 2 && Math.abs(tip(m)[1] - ARM_TIP.y) < 45 && tip(m)[2] < AX.z - 60, (s) => s.kind === "axle" && Math.abs(s.pos[0] - 80) < 1);
  const armA = liftarm(-40);
  onAx("60483.dat", AZURE, -20, "azure 2L liftarm", (m) => pt(m, [0, 0, 20])[1] < AX.y - 10, (s) => s.kind === "axle");
  onAx("60483.dat", AZURE, 20, "azure 2L liftarm", (m) => pt(m, [0, 0, 20])[1] < AX.y - 10, (s) => s.kind === "axle");
  const armB = liftarm(40);
  onAx("3713.dat", LBG, 60, "bush");
  b.step();
  // the 9L axle through both liftarms' far ends, white 135° angle connectors on its ends
  const t = tip(b.parts[armA].m);
  const ax9 = b.attach("60485.dat", LBG, { to: [armA, armB], where: onAxis([0, t[1], t[2]], 2, 60), accept: accept([0, t[1], t[2]], 2), minConnections: 2, offsets: [-30, -20, -10, 0, 10, 20, 30], label: "9L axle" });
  for (const px of [-1, 1]) b.attach("32192.dat", WHITE, { to: ax9, accept: (m) => px * x(m) > 75 && px * x(m) < 85, own: (s) => s.kind === "axle" || /A 6 19/.test(s.secs), offsets: Array.from({ length: 21 }, (_, i) => i * 10 - 100), label: "angle connector" });
  return toolFrom(b, n0, "DB2 arm", "db2-arm", MOUNTS.arm);
}
