import { describe, expect, it } from "vitest";
import { Library, bounds, flatten, LDU_MM } from "../src";
import { dirSource, findLDrawDir, findShadowDir } from "../src/node";

const dir = findLDrawDir();
const shadowDir = findShadowDir();
const lib = dir ? new Library(dirSource(dir), shadowDir ? dirSource(shadowDir) : undefined) : null;

const sizeMm = (name: string) => {
  const { mesh } = flatten(lib!, name, 16, { geometry: true });
  const b = bounds(mesh.positions);
  return b.max.map((v, i) => +((v - b.min[i]) * LDU_MM).toFixed(1));
};

describe.skipIf(!lib)("LDraw library", () => {
  it("loads colours", () => {
    expect(lib!.color(4).name).toBe("Red");
    expect(lib!.color(0).rgb).toEqual([27, 42, 52]);
  });

  it("measures real part sizes (mm)", () => {
    // 2x4 brick: 32 x 28.8 (incl. studs 1.7 mm) x 16 mm
    const brick = sizeMm("3001.dat");
    console.log("3001", brick);
    expect(brick[0]).toBeCloseTo(32, 0);
    expect(brick[2]).toBeCloseTo(16, 0);
    for (const p of ["39367p01.dat", "45601c01.dat", "54696p01.dat", "54675.dat", "37308.dat", "37316.dat", "37312.dat", "32524.dat"]) console.log(p, sizeMm(p));
  });

  it("collects snaps from primitives and the shadow library", () => {
    const beam = flatten(lib!, "32524.dat", 16, { geometry: false });
    console.log("beam 7 snaps", beam.snaps.length, beam.snaps.map((s) => `${s.gender}:${s.secs}`).slice(0, 3));
    expect(beam.snaps.length).toBeGreaterThanOrEqual(7);
    const brick = flatten(lib!, "3001.dat", 16, { geometry: false });
    console.log("brick snaps", brick.snaps.length);
    expect(brick.snaps.length).toBeGreaterThanOrEqual(8);
  });
});
