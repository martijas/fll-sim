// Mount points survive saving and loading, and a tool goes on at the robot's mount of the same name.
import { describe, expect, it } from "vitest";
import { IDENTITY, Library, MOUNT_PART } from "@fll-sim/ldraw";
import { dirSource, findLDrawDir } from "@fll-sim/ldraw/node";
import { attachTool, findMounts, parseModel, serializeModel, type ModelPart } from "../src";

const dir = findLDrawDir();
const lib = dir ? new Library(dirSource(dir)) : (null as unknown as Library);

const t = (x: number, y: number, z: number) => new Float64Array([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);

describe("mount points", () => {
  it.skipIf(!dir)("round-trip through .ldr and place a tool", () => {
    const robot: ModelPart[] = [{ file: "3001.dat", color: 4, m: IDENTITY }, { file: MOUNT_PART, color: 4, m: t(0, -24, -40), label: "front" }];
    const back = parseModel(lib, serializeModel(robot)).parts;
    expect(findMounts(back).map((m) => m.name)).toEqual(["front"]);
    const tool: ModelPart[] = [{ file: "3003.dat", color: 1, m: t(100, 0, 100) }, { file: MOUNT_PART, color: 4, m: t(100, 0, 140), label: "front" }];
    const r = attachTool(back, tool, "blade")!;
    expect(r.mount).toBe("front");
    const brick = r.parts.find((p) => p.file === "3003.dat")!;
    expect([brick.m[3], brick.m[7], brick.m[11]]).toEqual([0, -24, -80]);
    expect(brick.label).toContain("[tool:blade]");
    expect(attachTool(back, tool, "blade", "rear")).toBeNull();
  });
});
