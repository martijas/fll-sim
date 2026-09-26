// Driving Base 2 accessory: the force sensor bumper (tools & accessories guide, steps 18-22).
// The force sensor sits low at the robot's front right, its button pointing forwards, held by
// 2 black pins; a tan axle pin in the right 15L beam carries a magenta cable clip. Port A.
// Approximation: the guide pins the sensor to the accessory motor's white end; that face has no
// connection points in LDraw, so here the pins go from the sensor's back holes into the
// accessory motor's front face holes (x = -100 / -60, y = -50), same spot give or take a stud.
// Scripted in the robot's frame (see robot-db2.ts); mount "db2-force".
import type { Library } from "@fll-sim/ldraw";
import { orient } from "../src/build";
import { DB2, MOUNTS, buildBase, pinner, toolFrom, y } from "./robot-db2";

const BLACK = 0, WHITE = 15, TAN = 19, MAGENTA = 26;

export function build(lib: Library) {
  const b = buildBase(lib);
  const n0 = b.parts.length;
  const pinAt = pinner(b);
  const motorE = b.parts.findIndex((p) => p.label === "accessory motor");
  const beamR = b.parts.findIndex((p) => p.label === "15L beam" && p.m[3] < 0);
  // step 18: tan axle pin in the right 15L beam (second hole from the front), axle end up
  const ap = pinAt("3749.dat", TAN, beamR, [-100, -110, -160], [-100, -120, -160], "axle pin (cable clip)", (m) => m[7] < -115);
  b.step();
  // steps 19-21: 2 black pins into the accessory motor's front face, the sensor on them
  const fz = DB2.eMotor.z - 30; // the motor's front face
  for (const px of [-100, -60]) pinAt("2780.dat", BLACK, motorE, [px, -50, fz + 9], [px, -50, fz], "pin");
  const sensor = b.put("37312.dat", WHITE, orient("+x", "+y", "+z", [-80, -50, fz - 50]), 2, "force sensor");
  b.setPort(sensor, "A");
  b.attach("49283.dat", MAGENTA, { to: ap, accept: (m) => y(m) < -130, label: "cable clip" });

  return toolFrom(b, n0, "DB2 force sensor", "db2-force", MOUNTS.force);
}
