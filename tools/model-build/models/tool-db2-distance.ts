// Driving Base 2 accessory: the distance sensor (tools & accessories guide, steps 23-28).
// A medium azure 7L beam with 4 black pins (2 down in holes 1 and 7, 2 up in holes 3 and 5)
// lies across the hub's top at its front end; the distance sensor stands on the 2 up pins, its
// "eyes" looking forward; a tan axle pin in its lower back hole carries a red cable clip.
// Port F. Scripted in the robot's frame (see robot-db2.ts); mount "db2-distance".
import type { Library } from "@fll-sim/ldraw";
import { orient } from "../src/build";
import { MOUNTS, buildBase, pinner, toolFrom, z } from "./robot-db2";

const BLACK = 0, AZURE = 322, WHITE = 15, TAN = 19, RED = 4;

export function build(lib: Library) {
  const b = buildBase(lib);
  const n0 = b.parts.length;
  const pinAt = pinner(b);
  b.step();
  // step 23: 7L beam with 2 pins down (holes 1, 7) and 2 up (holes 3, 5)
  const beam = b.place("32524.dat", AZURE, orient("+z", "+y", "-x", [0, -190, -100]), "7L beam");
  for (const px of [-60, 60]) pinAt("2780.dat", BLACK, beam, [px, -190, -100], [px, -180, -100], "pin");
  for (const px of [-20, 20]) pinAt("2780.dat", BLACK, beam, [px, -190, -100], [px, -200, -100], "pin");
  b.step();
  // step 24: the sensor stands on the up pins, looking forward
  const sensor = b.put("37316.dat", WHITE, orient("-y", "+x", "+z", [0, -270, -100]), 2, "distance sensor");
  b.setPort(sensor, "F");
  b.step();
  // steps 25-26: tan axle pin in the sensor's lower back hole, red cable clip on it
  const ap = pinAt("3749.dat", TAN, sensor, [0, -210, -99], [0, -210, -90], "axle pin (cable clip)", (m) => m[11] > -95);
  b.attach("49283.dat", RED, { to: ap, accept: (m) => z(m) > -85, label: "cable clip" });
  return toolFrom(b, n0, "DB2 distance sensor", "db2-distance", MOUNTS.distance);
}
