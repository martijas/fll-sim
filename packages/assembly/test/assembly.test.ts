import { describe, expect, it } from "vitest";
import { IDENTITY, Library, mul, type Mat4 } from "@fll-sim/ldraw";
import { dirSource, findLDrawDir, findShadowDir } from "@fll-sim/ldraw/node";
import { analyzePart, assemble, partSnaps, placeOnSnap, type ModelPart } from "../src";

const dir = findLDrawDir();
const lib = dir ? new Library(dirSource(dir), findShadowDir() ? dirSource(findShadowDir()!) : undefined) : null;

const axleSnap = (file: string) => partSnaps(lib!, file).find((s) => s.secs.startsWith("A"))!;

describe.skipIf(!lib)("assembly from LDraw parts", () => {
  it("analyzes parts: colliders and masses", () => {
    for (const f of ["3001.dat", "32524.dat", "39367p01.dat", "54696p01.dat", "45601c01.dat", "2780.dat", "3705.dat"]) {
      const a = analyzePart(lib!, f);
      console.log(f, a.title.slice(0, 40), "boxes", a.boxes.length, "rotor", a.rotorBoxes?.length ?? "-", "cyl", !!a.cylinder, "mass g", (a.massKg * 1000).toFixed(2), "snaps", a.snaps.length, "connector", a.connector);
    }
    expect(analyzePart(lib!, "3001.dat").massKg * 1000).toBeGreaterThan(1.2);
    expect(analyzePart(lib!, "3001.dat").massKg * 1000).toBeLessThan(4);
    expect(analyzePart(lib!, "39367p01.dat").cylinder).toBeTruthy();
    expect(analyzePart(lib!, "2780.dat").connector).toBe(true);
  });

  it("motor + axle + wheel: wheel rides on the rotor, joined to the housing by the motor joint", () => {
    const motor: ModelPart = { file: "54696p01.dat", color: 71, m: IDENTITY, port: "A" };
    // Axle 4 through the motor's output axle hole.
    const target = partSnaps(lib!, "54696p01.dat").find((s) => s.secs.startsWith("A"))!;
    const axleM = placeOnSnap(mul(motor.m, target.m) as Mat4, axleSnap("3705.dat").m);
    const axle: ModelPart = { file: "3705.dat", color: 0, m: axleM };
    // Wheel onto the axle, its axle hole aligned with the axle's snap.
    const axleWorld = mul(axleM, axleSnap("3705.dat").m) as Mat4;
    const wheelM = placeOnSnap(axleWorld, axleSnap("39367p01.dat").m, { offset: 20 });
    const wheel: ModelPart = { file: "39367p01.dat", color: 0, m: wheelM };
    const { robot, report } = assemble(lib!, [motor, axle, wheel]);
    console.log("report", report, robot.bodies.map((b) => `${b.id} ${b.massKg.toFixed(3)}kg ${b.shapes.length} shapes, visuals ${b.visuals?.map((v) => v.file).join(",")}`));
    expect(robot.motors.length).toBe(1);
    expect(robot.bodies.length).toBe(2);
    const rotorBody = robot.bodies.find((b) => b.id === robot.motors[0].output)!;
    expect(rotorBody.visuals!.some((v) => v.file === "39367p01.dat")).toBe(true);
    expect(rotorBody.visuals!.some((v) => v.file === "3705.dat")).toBe(true);
  });
});
